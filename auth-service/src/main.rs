use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Redirect, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{distr::Alphanumeric, Rng};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use tracing::{error, info};
use url::Url;

const DESKTOP_CALLBACK_URL: &str = "sounduncloud://auth/callback";
const PENDING_AUTH_TTL_SECONDS: u64 = 10 * 60;
const TICKET_TTL_SECONDS: u64 = 5 * 60;

#[derive(Clone)]
struct AppState {
    client: Client,
    config: ServiceConfig,
    store: Arc<Mutex<AuthStore>>,
}

#[derive(Clone)]
struct ServiceConfig {
    soundcloud_client_id: String,
    soundcloud_client_secret: String,
    public_base_url: String,
}

#[derive(Default)]
struct AuthStore {
    pending: HashMap<String, PendingAuth>,
    tickets: HashMap<String, IssuedTicket>,
}

#[derive(Clone)]
struct PendingAuth {
    desktop_state: String,
    code_verifier: String,
    created_at: u64,
}

#[derive(Clone)]
struct IssuedTicket {
    desktop_state: String,
    session: BrokeredSession,
    created_at: u64,
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

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "sounduncloud_auth_service=info".into()),
        )
        .init();

    let bind_addr = std::env::var("SOUNDUNCLOUD_BIND_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8787".to_string())
        .parse::<SocketAddr>()?;

    let config = ServiceConfig {
        soundcloud_client_id: required_env("SOUNDCLOUD_CLIENT_ID")?,
        soundcloud_client_secret: required_env("SOUNDCLOUD_CLIENT_SECRET")?,
        public_base_url: normalize_base_url(&required_env("SOUNDUNCLOUD_PUBLIC_BASE_URL")?)?,
    };

    let state = AppState {
        client: Client::builder().timeout(Duration::from_secs(30)).build()?,
        config,
        store: Arc::new(Mutex::new(AuthStore::default())),
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

    let server_state = random_url_safe(40);
    let code_verifier = random_url_safe(96);
    let code_challenge = pkce_challenge(&code_verifier);

    {
        let mut store = state.store.lock().await;
        prune_store(&mut store);
        store.pending.insert(
            server_state.clone(),
            PendingAuth {
                desktop_state: query.desktop_state.clone(),
                code_verifier,
                created_at: current_epoch_seconds(),
            },
        );
    }

    let redirect_uri = service_url(&state.config.public_base_url, "/oauth/callback")?;
    let authorize_url = format!(
        "https://secure.soundcloud.com/authorize?client_id={}&redirect_uri={}&response_type=code&code_challenge={}&code_challenge_method=S256&state={}",
        urlencoding::encode(&state.config.soundcloud_client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&code_challenge),
        urlencoding::encode(&server_state),
    );

    Ok(Redirect::temporary(&authorize_url))
}

async fn oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
) -> Result<Response, AppError> {
    let Some(server_state) = query.state.clone() else {
        return Err(AppError::bad_request(
            "SoundCloud did not return a valid sign-in state.",
        ));
    };

    let pending = {
        let mut store = state.store.lock().await;
        prune_store(&mut store);
        store.pending.remove(&server_state)
    }
    .ok_or_else(|| {
        AppError::bad_request("This SoundCloud sign-in request expired or was already used.")
    })?;

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
            "SoundCloud sign-in did not finish",
            "Return to SoundunCloud to try again.",
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
    let session = BrokeredSession {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: current_epoch_seconds().saturating_add(token.expires_in),
        user,
    };
    let ticket = random_url_safe(48);

    {
        let mut store = state.store.lock().await;
        prune_store(&mut store);
        store.tickets.insert(
            ticket.clone(),
            IssuedTicket {
                desktop_state: pending.desktop_state.clone(),
                session,
                created_at: current_epoch_seconds(),
            },
        );
    }

    let deep_link = build_desktop_link(Some(&ticket), Some(&pending.desktop_state), None)?;

    Ok(Html(render_handoff_page(
        "Opening SoundunCloud",
        "If your browser does not reopen the desktop app automatically, use the button below.",
        &deep_link,
    ))
    .into_response())
}

async fn exchange_ticket(
    State(state): State<AppState>,
    Json(request): Json<ExchangeTicketRequest>,
) -> Result<Json<BrokeredSession>, AppError> {
    let issued = {
        let mut store = state.store.lock().await;
        prune_store(&mut store);
        store.tickets.remove(&request.ticket)
    }
    .ok_or_else(|| AppError::bad_request("This sign-in ticket is missing or expired."))?;

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

fn prune_store(store: &mut AuthStore) {
    let now = current_epoch_seconds();
    store
        .pending
        .retain(|_, pending| now.saturating_sub(pending.created_at) < PENDING_AUTH_TTL_SECONDS);
    store
        .tickets
        .retain(|_, ticket| now.saturating_sub(ticket.created_at) < TICKET_TTL_SECONDS);
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
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>SoundunCloud</title><style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0c;color:#f8f8fa;font:16px/1.6 ui-monospace,\"SFMono-Regular\",\"SF Mono\",Menlo,Consolas,\"Liberation Mono\",monospace}}main{{width:min(520px,calc(100vw - 32px));padding:32px;border-radius:28px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.015)),rgba(12,12,16,.88);box-shadow:0 24px 72px rgba(0,0,0,.34);text-align:center}}h1{{margin:0 0 14px;font-size:2rem;letter-spacing:-.03em}}p{{margin:0 0 22px;color:rgba(248,248,250,.72)}}a{{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:16px;background:linear-gradient(145deg,#ff5500,#ff7a00);color:#1e1204;text-decoration:none;font-weight:700;box-shadow:0 12px 30px rgba(255,85,0,.22)}}</style></head><body><main><h1>{title}</h1><p>{message}</p><a href=\"{deep_link}\">Return to SoundunCloud</a></main><script>window.setTimeout(function(){{window.location.href={deep_link:?};}},120);</script></body></html>"
    )
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
