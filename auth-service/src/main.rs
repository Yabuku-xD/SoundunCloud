use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Redirect, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{distr::Alphanumeric, Rng, RngCore};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    net::SocketAddr,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tracing::{error, info};
use url::Url;

const DESKTOP_CALLBACK_URL: &str = "sounduncloud://auth/callback";
const STATE_TOKEN_TTL_SECONDS: u64 = 10 * 60;
const TICKET_TTL_SECONDS: u64 = 5 * 60;
const STATE_TOKEN_KIND: &str = "sounduncloud.oauth.state";
const TICKET_TOKEN_KIND: &str = "sounduncloud.desktop.ticket";
const SEALED_TOKEN_NONCE_BYTES: usize = 12;

#[derive(Clone)]
struct AppState {
    client: Client,
    config: ServiceConfig,
}

#[derive(Clone)]
struct ServiceConfig {
    soundcloud_client_id: String,
    soundcloud_client_secret: String,
    public_base_url: String,
    auth_secret: [u8; 32],
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AuthenticatedUser {
    username: String,
    full_name: Option<String>,
    permalink_url: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BrokeredSession {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: u64,
    user: AuthenticatedUser,
}

#[derive(Debug, Deserialize)]
struct StartQuery {
    desktop_state: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExchangeTicketRequest {
    ticket: String,
    desktop_state: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RefreshRequest {
    refresh_token: String,
}

#[derive(Debug, Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}

#[derive(Debug, Deserialize)]
struct MeResponse {
    username: String,
    full_name: Option<String>,
    permalink_url: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    ok: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct ErrorResponse {
    error: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignedStatePayload {
    kind: String,
    desktop_state: String,
    code_verifier: String,
    issued_at: u64,
    expires_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignedTicketPayload {
    kind: String,
    desktop_state: String,
    session: BrokeredSession,
    issued_at: u64,
    expires_at: u64,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "sounduncloud_auth_service=info".into()),
        )
        .init();

    let bind_addr = std::env::var("SOUNDUNCLOUD_BIND_ADDR")
        .ok()
        .or_else(|| {
            std::env::var("PORT")
                .ok()
                .map(|port| format!("0.0.0.0:{port}"))
        })
        .unwrap_or_else(|| "127.0.0.1:8787".to_string())
        .parse::<SocketAddr>()?;

    let config = ServiceConfig {
        soundcloud_client_id: required_env("SOUNDCLOUD_CLIENT_ID")?,
        soundcloud_client_secret: required_env("SOUNDCLOUD_CLIENT_SECRET")?,
        public_base_url: normalize_base_url(&required_env("SOUNDUNCLOUD_PUBLIC_BASE_URL")?)?,
        auth_secret: derive_secret_key(&required_env("SOUNDUNCLOUD_AUTH_SECRET")?)?,
    };

    let state = AppState {
        client: Client::builder().timeout(Duration::from_secs(30)).build()?,
        config,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/oauth/start", get(start_oauth))
        .route("/oauth/callback", get(oauth_callback))
        .route("/api/auth/exchange-ticket", post(exchange_ticket))
        .route("/api/auth/refresh", post(refresh_session))
        .with_state(state);

    info!("SoundunCloud auth service listening on http://{bind_addr}");

    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { ok: true })
}

async fn start_oauth(
    State(state): State<AppState>,
    Query(query): Query<StartQuery>,
) -> Result<Redirect, AppError> {
    if !is_valid_desktop_state(&query.desktop_state) {
        return Err(AppError::bad_request(
            "Desktop sign-in state was missing or invalid.",
        ));
    }

    let issued_at = current_epoch_seconds();
    let code_verifier = random_url_safe(96);
    let code_challenge = pkce_challenge(&code_verifier);
    let sealed_state = seal_payload(
        &state.config.auth_secret,
        &SignedStatePayload {
            kind: STATE_TOKEN_KIND.into(),
            desktop_state: query.desktop_state,
            code_verifier,
            issued_at,
            expires_at: issued_at.saturating_add(STATE_TOKEN_TTL_SECONDS),
        },
    )?;

    let redirect_uri = service_url(&state.config.public_base_url, "/oauth/callback")?;
    let authorize_url = format!(
        "https://secure.soundcloud.com/authorize?client_id={}&redirect_uri={}&response_type=code&code_challenge={}&code_challenge_method=S256&state={}",
        urlencoding::encode(&state.config.soundcloud_client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&code_challenge),
        urlencoding::encode(&sealed_state),
    );

    Ok(Redirect::temporary(&authorize_url))
}

async fn oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
) -> Result<Response, AppError> {
    let Some(sealed_state) = query.state.clone() else {
        return Err(AppError::bad_request(
            "SoundCloud did not return a valid sign-in state.",
        ));
    };

    let pending = open_state_payload(&state.config.auth_secret, &sealed_state)?;

    if let Some(error) = query.error {
        let error_detail = query
            .error_description
            .unwrap_or_else(|| "SoundCloud sign-in was cancelled or rejected.".to_string());
        let deep_link = build_desktop_link(
            None,
            Some(&pending.desktop_state),
            Some(&format!("{error}: {error_detail}")),
        )?;
        return Ok(Html(render_handoff_page(
            "Sign-in did not finish",
            "Jump back into SoundunCloud to try again.",
            &deep_link,
        ))
        .into_response());
    }

    let auth_code = query
        .code
        .ok_or_else(|| AppError::bad_request("SoundCloud did not return an authorization code."))?;

    let redirect_uri = service_url(&state.config.public_base_url, "/oauth/callback")?;
    let token = exchange_code_for_token(
        &state.client,
        &state.config,
        &redirect_uri,
        &pending.code_verifier,
        &auth_code,
    )
    .await?;
    let user = fetch_authenticated_user(&state.client, &token.access_token).await?;
    let issued_at = current_epoch_seconds();
    let sealed_ticket = seal_payload(
        &state.config.auth_secret,
        &SignedTicketPayload {
            kind: TICKET_TOKEN_KIND.into(),
            desktop_state: pending.desktop_state.clone(),
            session: BrokeredSession {
                access_token: token.access_token,
                refresh_token: token.refresh_token,
                expires_at: issued_at.saturating_add(token.expires_in),
                user,
            },
            issued_at,
            expires_at: issued_at.saturating_add(TICKET_TTL_SECONDS),
        },
    )?;

    let deep_link = build_desktop_link(
        Some(&sealed_ticket),
        Some(&pending.desktop_state),
        None,
    )?;

    Ok(Html(render_handoff_page(
        "Returning to SoundunCloud",
        "This tab should close in a moment.",
        &deep_link,
    ))
    .into_response())
}

async fn exchange_ticket(
    State(state): State<AppState>,
    Json(request): Json<ExchangeTicketRequest>,
) -> Result<Json<BrokeredSession>, AppError> {
    let issued = open_ticket_payload(&state.config.auth_secret, &request.ticket)?;

    if issued.desktop_state != request.desktop_state {
        return Err(AppError::bad_request(
            "The desktop app could not verify the sign-in return link.",
        ));
    }

    Ok(Json(issued.session))
}

async fn refresh_session(
    State(state): State<AppState>,
    Json(request): Json<RefreshRequest>,
) -> Result<Json<BrokeredSession>, AppError> {
    if request.refresh_token.trim().is_empty() {
        return Err(AppError::bad_request(
            "A refresh token is required to renew the SoundCloud session.",
        ));
    }

    let token =
        refresh_soundcloud_token(&state.client, &state.config, request.refresh_token.trim())
            .await?;
    let user = fetch_authenticated_user(&state.client, &token.access_token).await?;

    Ok(Json(BrokeredSession {
        access_token: token.access_token,
        refresh_token: token.refresh_token.or(Some(request.refresh_token)),
        expires_at: current_epoch_seconds().saturating_add(token.expires_in),
        user,
    }))
}

async fn exchange_code_for_token(
    client: &Client,
    config: &ServiceConfig,
    redirect_uri: &str,
    code_verifier: &str,
    code: &str,
) -> Result<OAuthTokenResponse, AppError> {
    let response = client
        .post("https://secure.soundcloud.com/oauth/token")
        .header("accept", "application/json; charset=utf-8")
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", config.soundcloud_client_id.as_str()),
            ("client_secret", config.soundcloud_client_secret.as_str()),
            ("redirect_uri", redirect_uri),
            ("code_verifier", code_verifier),
            ("code", code),
        ])
        .send()
        .await
        .map_err(|error| AppError::bad_gateway(format!("Could not reach SoundCloud: {error}")))?;

    decode_json_response(
        response,
        "SoundCloud rejected the authorization code exchange.",
    )
    .await
}

async fn refresh_soundcloud_token(
    client: &Client,
    config: &ServiceConfig,
    refresh_token: &str,
) -> Result<OAuthTokenResponse, AppError> {
    let response = client
        .post("https://secure.soundcloud.com/oauth/token")
        .header("accept", "application/json; charset=utf-8")
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", config.soundcloud_client_id.as_str()),
            ("client_secret", config.soundcloud_client_secret.as_str()),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .map_err(|error| AppError::bad_gateway(format!("Could not reach SoundCloud: {error}")))?;

    decode_json_response(response, "SoundCloud rejected the stored refresh token.").await
}

async fn fetch_authenticated_user(
    client: &Client,
    access_token: &str,
) -> Result<AuthenticatedUser, AppError> {
    let response = client
        .get("https://api.soundcloud.com/me")
        .header("accept", "application/json; charset=utf-8")
        .header("Authorization", format!("OAuth {access_token}"))
        .send()
        .await
        .map_err(|error| {
            AppError::bad_gateway(format!("Could not load /me from SoundCloud: {error}"))
        })?;

    let me = decode_json_response::<MeResponse>(response, "SoundCloud did not return the profile.")
        .await?;

    Ok(AuthenticatedUser {
        username: me.username,
        full_name: me.full_name,
        permalink_url: me.permalink_url,
        avatar_url: me.avatar_url,
    })
}

async fn decode_json_response<T>(response: reqwest::Response, fallback: &str) -> Result<T, AppError>
where
    T: for<'de> Deserialize<'de>,
{
    if response.status().is_success() {
        return response.json::<T>().await.map_err(|error| {
            AppError::bad_gateway(format!("Could not decode the SoundCloud response: {error}"))
        });
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let message = extract_api_error(&body).unwrap_or_else(|| fallback.to_string());
    Err(AppError::new(status, message))
}

fn extract_api_error(body: &str) -> Option<String> {
    serde_json::from_str::<ErrorResponse>(body)
        .ok()
        .map(|payload| payload.error)
        .filter(|value| !value.trim().is_empty())
}

fn current_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn random_url_safe(length: usize) -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

fn random_nonce() -> [u8; SEALED_TOKEN_NONCE_BYTES] {
    let mut bytes = [0u8; SEALED_TOKEN_NONCE_BYTES];
    rand::rng().fill_bytes(&mut bytes);
    bytes
}

fn pkce_challenge(code_verifier: &str) -> String {
    let digest = Sha256::digest(code_verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn normalize_base_url(raw: &str) -> Result<String, Box<dyn std::error::Error>> {
    let url = Url::parse(raw.trim())?;
    let normalized = url.to_string().trim_end_matches('/').to_string();
    Ok(normalized)
}

fn required_env(name: &str) -> Result<String, Box<dyn std::error::Error>> {
    std::env::var(name).map_err(|_| format!("Missing required environment variable: {name}").into())
}

fn derive_secret_key(raw: &str) -> Result<[u8; 32], Box<dyn std::error::Error>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("SOUNDUNCLOUD_AUTH_SECRET cannot be empty.".into());
    }

    let digest = Sha256::digest(trimmed.as_bytes());
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest);
    Ok(key)
}

fn is_valid_desktop_state(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed.len() >= 24
        && trimmed.len() <= 128
        && trimmed
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
}

fn service_url(base_url: &str, path: &str) -> Result<String, AppError> {
    let normalized = if base_url.ends_with('/') {
        base_url.to_string()
    } else {
        format!("{base_url}/")
    };

    Url::parse(&normalized)
        .and_then(|base| base.join(path.trim_start_matches('/')))
        .map(|url| url.to_string())
        .map_err(|error| AppError::internal(format!("Could not build a service URL: {error}")))
}

fn build_desktop_link(
    ticket: Option<&str>,
    desktop_state: Option<&str>,
    error_message: Option<&str>,
) -> Result<String, AppError> {
    let mut url = Url::parse(DESKTOP_CALLBACK_URL).map_err(|error| {
        AppError::internal(format!("Could not build the desktop callback URL: {error}"))
    })?;
    {
        let mut query = url.query_pairs_mut();
        if let Some(ticket) = ticket {
            query.append_pair("ticket", ticket);
        }
        if let Some(desktop_state) = desktop_state {
            query.append_pair("state", desktop_state);
        }
        if let Some(error_message) = error_message {
            query.append_pair("error", error_message);
        }
    }
    Ok(url.to_string())
}

fn render_handoff_page(title: &str, message: &str, deep_link: &str) -> String {
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>SoundunCloud</title><style>:root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 18% 18%,rgba(255,106,26,.12),transparent 22%),linear-gradient(145deg,#050508 0%,#08090d 42%,#05060a 100%);color:#f7f7f9;font:15px/1.5 \"Segoe UI Variable Text\",\"Segoe UI\",Inter,system-ui,sans-serif}}main{{width:min(360px,calc(100vw - 40px));text-align:center}}.mark{{width:54px;height:54px;margin:0 auto 18px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);display:grid;place-items:center;box-shadow:0 18px 44px rgba(0,0,0,.22)}}.pulse{{width:14px;height:14px;border-radius:999px;border:2px solid rgba(255,106,26,.88);box-shadow:0 0 22px rgba(255,106,26,.28);position:relative}}.pulse::after{{content:\"\";position:absolute;inset:-7px;border-radius:999px;border:1px solid rgba(255,106,26,.22);animation:pulse 1.4s ease-out infinite}}h1{{margin:0;font-size:17px;letter-spacing:-.02em}}p{{margin:10px 0 18px;color:rgba(247,247,249,.56)}}a{{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:rgba(247,247,249,.82);text-decoration:none;font-weight:600}}@keyframes pulse{{0%{{transform:scale(.86);opacity:.85}}100%{{transform:scale(1.4);opacity:0}}}}</style></head><body><main><div class=\"mark\"><div class=\"pulse\"></div></div><h1>{title}</h1><p>{message}</p><a href=\"{deep_link}\">Open app</a></main><script>const deeplink={deep_link:?};window.setTimeout(function(){{window.location.replace(deeplink);}},40);window.setTimeout(function(){{window.close();}},420);</script></body></html>"
    )
}

fn seal_payload<T>(secret: &[u8; 32], payload: &T) -> Result<String, AppError>
where
    T: Serialize,
{
    let cipher = build_cipher(secret)?;
    let nonce_bytes = random_nonce();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::to_vec(payload)
        .map_err(|error| AppError::internal(format!("Could not encode auth payload: {error}")))?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|_| AppError::internal("Could not seal the auth payload."))?;

    let mut sealed = nonce_bytes.to_vec();
    sealed.extend(ciphertext);
    Ok(URL_SAFE_NO_PAD.encode(sealed))
}

fn open_state_payload(secret: &[u8; 32], sealed: &str) -> Result<SignedStatePayload, AppError> {
    let payload = open_payload::<SignedStatePayload>(secret, sealed)?;
    validate_payload_window(
        &payload.kind,
        STATE_TOKEN_KIND,
        payload.issued_at,
        payload.expires_at,
        "This SoundCloud sign-in request expired or was invalid.",
    )?;
    Ok(payload)
}

fn open_ticket_payload(secret: &[u8; 32], sealed: &str) -> Result<SignedTicketPayload, AppError> {
    let payload = open_payload::<SignedTicketPayload>(secret, sealed)?;
    validate_payload_window(
        &payload.kind,
        TICKET_TOKEN_KIND,
        payload.issued_at,
        payload.expires_at,
        "This desktop sign-in ticket expired or was invalid.",
    )?;
    Ok(payload)
}

fn open_payload<T>(secret: &[u8; 32], sealed: &str) -> Result<T, AppError>
where
    T: for<'de> Deserialize<'de>,
{
    let bytes = URL_SAFE_NO_PAD
        .decode(sealed.as_bytes())
        .map_err(|_| AppError::bad_request("The auth token could not be decoded."))?;

    if bytes.len() <= SEALED_TOKEN_NONCE_BYTES {
        return Err(AppError::bad_request("The auth token was incomplete."));
    }

    let (nonce_bytes, ciphertext) = bytes.split_at(SEALED_TOKEN_NONCE_BYTES);
    let cipher = build_cipher(secret)?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| AppError::bad_request("The auth token could not be verified."))?;

    serde_json::from_slice::<T>(&plaintext)
        .map_err(|_| AppError::bad_request("The auth token payload was malformed."))
}

fn build_cipher(secret: &[u8; 32]) -> Result<Aes256Gcm, AppError> {
    Aes256Gcm::new_from_slice(secret)
        .map_err(|error| AppError::internal(format!("Could not prepare auth encryption: {error}")))
}

fn validate_payload_window(
    kind: &str,
    expected_kind: &str,
    issued_at: u64,
    expires_at: u64,
    message: &str,
) -> Result<(), AppError> {
    let now = current_epoch_seconds();
    if kind != expected_kind || expires_at < now || issued_at > now.saturating_add(60) {
        return Err(AppError::bad_request(message));
    }
    Ok(())
}

#[derive(Debug)]
struct AppError {
    status: StatusCode,
    message: String,
}

impl AppError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }

    fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    fn bad_gateway(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_GATEWAY, message)
    }

    fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, message)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        error!("auth service error: {}", self.message);
        (
            self.status,
            Json(ErrorResponse {
                error: self.message,
            }),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sealed_state_round_trip_survives() {
        let key = derive_secret_key("test-secret").unwrap();
        let payload = SignedStatePayload {
            kind: STATE_TOKEN_KIND.into(),
            desktop_state: "A".repeat(32),
            code_verifier: "B".repeat(64),
            issued_at: current_epoch_seconds(),
            expires_at: current_epoch_seconds() + 60,
        };

        let sealed = seal_payload(&key, &payload).unwrap();
        let opened = open_state_payload(&key, &sealed).unwrap();

        assert_eq!(opened.desktop_state, payload.desktop_state);
        assert_eq!(opened.code_verifier, payload.code_verifier);
    }

    #[test]
    fn expired_ticket_is_rejected() {
        let key = derive_secret_key("test-secret").unwrap();
        let payload = SignedTicketPayload {
            kind: TICKET_TOKEN_KIND.into(),
            desktop_state: "C".repeat(32),
            session: BrokeredSession {
                access_token: "access".into(),
                refresh_token: Some("refresh".into()),
                expires_at: current_epoch_seconds() + 3600,
                user: AuthenticatedUser {
                    username: "user".into(),
                    full_name: None,
                    permalink_url: None,
                    avatar_url: None,
                },
            },
            issued_at: current_epoch_seconds() - 120,
            expires_at: current_epoch_seconds() - 60,
        };

        let sealed = seal_payload(&key, &payload).unwrap();
        assert!(open_ticket_payload(&key, &sealed).is_err());
    }
}
