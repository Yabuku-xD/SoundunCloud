use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{distr::Alphanumeric, Rng};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use url::Url;

const CONFIG_FILE_NAME: &str = "sounduncloud-config.json";
const SESSION_FILE_NAME: &str = "sounduncloud-session.json";
const AUTH_EVENT_SUCCESS: &str = "sounduncloud://auth-success";
const AUTH_EVENT_ERROR: &str = "sounduncloud://auth-error";
const DEFAULT_REDIRECT_PORT: u16 = 8976;

#[derive(Clone, Default)]
struct AuthRuntime {
    is_authorizing: bool,
}

type SharedAuthRuntime = Arc<Mutex<AuthRuntime>>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopContext {
    app_name: String,
    version: String,
    platform_label: String,
    arch: String,
    build_profile: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OAuthConfig {
    client_id: String,
    client_secret: String,
    redirect_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthenticatedUser {
    username: String,
    full_name: Option<String>,
    permalink_url: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSession {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: u64,
    user: AuthenticatedUser,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SoundunCloudSnapshot {
    desktop_context: DesktopContext,
    oauth_configured: bool,
    redirect_uri: String,
    has_local_session: bool,
    authenticated_user: Option<AuthenticatedUser>,
    config_source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OAuthConfigInput {
    client_id: String,
    client_secret: String,
    redirect_port: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthLaunch {
    authorize_url: String,
    redirect_uri: String,
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

#[tauri::command]
fn desktop_context(app: AppHandle) -> DesktopContext {
    build_desktop_context(&app)
}

#[tauri::command]
fn load_sounduncloud_snapshot(app: AppHandle) -> Result<SoundunCloudSnapshot, String> {
    let desktop_context = build_desktop_context(&app);
    let config = load_effective_config(&app)?;
    let session = load_session_file(&app)?;

    Ok(SoundunCloudSnapshot {
        desktop_context,
        oauth_configured: config.is_some(),
        redirect_uri: build_redirect_uri(config.as_ref().map_or(DEFAULT_REDIRECT_PORT, |cfg| cfg.redirect_port)),
        has_local_session: session.is_some(),
        authenticated_user: session.map(|stored| stored.user),
        config_source: if load_config_file(&app)?.is_some() {
            "app-storage".into()
        } else if load_config_from_env().is_some() {
            "environment".into()
        } else {
            "missing".into()
        },
    })
}

#[tauri::command]
fn save_oauth_config(app: AppHandle, input: OAuthConfigInput) -> Result<(), String> {
    if input.client_id.trim().is_empty() || input.client_secret.trim().is_empty() {
        return Err("Client ID and client secret are required.".into());
    }

    let config = OAuthConfig {
        client_id: input.client_id.trim().to_string(),
        client_secret: input.client_secret.trim().to_string(),
        redirect_port: sanitize_port(input.redirect_port),
    };

    write_json_file(&app, CONFIG_FILE_NAME, &config)
}

#[tauri::command]
fn clear_local_session(app: AppHandle) -> Result<(), String> {
    let session_path = app_file_path(&app, SESSION_FILE_NAME)?;
    if session_path.exists() {
        fs::remove_file(session_path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn begin_soundcloud_login(
    app: AppHandle,
    runtime: State<SharedAuthRuntime>,
) -> Result<AuthLaunch, String> {
    let config = load_effective_config(&app)?
        .ok_or_else(|| "Save your SoundCloud client settings before signing in.".to_string())?;

    {
        let mut guard = runtime
            .lock()
            .map_err(|_| "Could not lock OAuth runtime.".to_string())?;
        if guard.is_authorizing {
            return Err("SoundCloud sign-in is already in progress.".into());
        }
        guard.is_authorizing = true;
    }

    let redirect_uri = build_redirect_uri(config.redirect_port);
    let listener = TcpListener::bind(("127.0.0.1", config.redirect_port))
        .map_err(|_| format!("Port {} is unavailable for the OAuth callback.", config.redirect_port))?;
    listener
        .set_nonblocking(false)
        .map_err(|error| error.to_string())?;

    let state = random_url_safe(24);
    let code_verifier = random_url_safe(64);
    let code_challenge = pkce_challenge(&code_verifier);
    let authorize_url = format!(
        "https://secure.soundcloud.com/authorize?client_id={}&redirect_uri={}&response_type=code&code_challenge={}&code_challenge_method=S256&state={}&display=popup",
        urlencoding::encode(&config.client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&code_challenge),
        urlencoding::encode(&state)
    );

    let app_handle = app.clone();
    let runtime_handle = runtime.inner().clone();
    let callback_redirect_uri = redirect_uri.clone();

    std::thread::spawn(move || {
        let result = complete_browser_flow(
            &app_handle,
            listener,
            &config,
            &callback_redirect_uri,
            &state,
            &code_verifier,
        );

        let mut guard = runtime_handle.lock().ok();
        if let Some(runtime) = guard.as_mut() {
            runtime.is_authorizing = false;
        }

        match result {
            Ok(user) => {
                let _ = app_handle.emit(AUTH_EVENT_SUCCESS, user);
            }
            Err(message) => {
                let _ = app_handle.emit(AUTH_EVENT_ERROR, message);
            }
        }
    });

    Ok(AuthLaunch {
        authorize_url,
        redirect_uri,
    })
}

fn complete_browser_flow(
    app: &AppHandle,
    listener: TcpListener,
    config: &OAuthConfig,
    redirect_uri: &str,
    expected_state: &str,
    code_verifier: &str,
) -> Result<AuthenticatedUser, String> {
    listener
        .set_ttl(1)
        .map_err(|error| format!("Could not prepare callback listener: {error}"))?;

    let (mut stream, _) = listener
        .accept()
        .map_err(|error| format!("OAuth callback was not received: {error}"))?;

    stream
        .set_read_timeout(Some(Duration::from_secs(120)))
        .map_err(|error| error.to_string())?;

    let mut buffer = [0_u8; 8192];
    let bytes_read = stream
        .read(&mut buffer)
        .map_err(|error| format!("Could not read OAuth callback: {error}"))?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let request_line = request
        .lines()
        .next()
        .ok_or_else(|| "OAuth callback request was empty.".to_string())?;
    let request_target = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "OAuth callback request line was invalid.".to_string())?;
    let callback_url = Url::parse(&format!("http://127.0.0.1{}", request_target))
        .map_err(|error| format!("Could not parse callback URL: {error}"))?;

    let mut code = None;
    let mut returned_state = None;
    let mut error_message = None;

    for (key, value) in callback_url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.to_string()),
            "state" => returned_state = Some(value.to_string()),
            "error" => error_message = Some(value.to_string()),
            _ => {}
        }
    }

    if let Some(error) = error_message {
        write_browser_response(
            &mut stream,
            "SoundunCloud sign-in failed. You can close this tab and return to the app.",
        )?;
        return Err(format!("SoundCloud returned an error: {error}."));
    }

    if returned_state.as_deref() != Some(expected_state) {
        write_browser_response(
            &mut stream,
            "SoundunCloud could not verify the sign-in request. You can close this tab.",
        )?;
        return Err("OAuth state verification failed.".into());
    }

    let auth_code = code.ok_or_else(|| "SoundCloud did not return an authorization code.".to_string())?;
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?;

    let token = exchange_code_for_token(
        &client,
        config,
        redirect_uri,
        code_verifier,
        &auth_code,
    )?;
    let user = fetch_authenticated_user(&client, &token.access_token)?;
    let expires_at = current_epoch_seconds().saturating_add(token.expires_in);

    let session = PersistedSession {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at,
        user: user.clone(),
    };

    write_json_file(app, SESSION_FILE_NAME, &session)?;
    write_browser_response(
        &mut stream,
        "SoundunCloud sign-in is complete. You can close this browser tab and return to the app.",
    )?;

    Ok(user)
}

fn exchange_code_for_token(
    client: &Client,
    config: &OAuthConfig,
    redirect_uri: &str,
    code_verifier: &str,
    code: &str,
) -> Result<OAuthTokenResponse, String> {
    client
        .post("https://secure.soundcloud.com/oauth/token")
        .header("accept", "application/json; charset=utf-8")
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", config.client_id.as_str()),
            ("client_secret", config.client_secret.as_str()),
            ("redirect_uri", redirect_uri),
            ("code_verifier", code_verifier),
            ("code", code),
        ])
        .send()
        .map_err(|error| format!("Could not exchange the SoundCloud auth code: {error}"))?
        .error_for_status()
        .map_err(|error| format!("SoundCloud rejected the auth code exchange: {error}"))?
        .json::<OAuthTokenResponse>()
        .map_err(|error| format!("Could not decode the SoundCloud token response: {error}"))
}

fn fetch_authenticated_user(client: &Client, access_token: &str) -> Result<AuthenticatedUser, String> {
    let bearer_attempt = client
        .get("https://api.soundcloud.com/me")
        .header("accept", "application/json; charset=utf-8")
        .header("Authorization", format!("Bearer {access_token}"))
        .send();

    let response = match bearer_attempt {
        Ok(response) if response.status().is_success() => response,
        _ => client
            .get("https://api.soundcloud.com/me")
            .header("accept", "application/json; charset=utf-8")
            .header("Authorization", format!("OAuth {access_token}"))
            .send()
            .map_err(|error| format!("Could not load the authenticated SoundCloud profile: {error}"))?
            .error_for_status()
            .map_err(|error| format!("SoundCloud refused the authenticated profile request: {error}"))?,
    };

    let me = response
        .json::<MeResponse>()
        .map_err(|error| format!("Could not parse the authenticated SoundCloud profile: {error}"))?;

    Ok(AuthenticatedUser {
        username: me.username,
        full_name: me.full_name,
        permalink_url: me.permalink_url,
        avatar_url: me.avatar_url,
    })
}

fn write_browser_response(stream: &mut std::net::TcpStream, message: &str) -> Result<(), String> {
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>SoundunCloud</title><style>body{{margin:0;font-family:Segoe UI,sans-serif;background:#0d1117;color:#f4f7fb;display:grid;place-items:center;min-height:100vh}}main{{max-width:560px;padding:32px;border:1px solid rgba(255,255,255,.08);border-radius:24px;background:rgba(255,255,255,.03)}}h1{{margin-top:0}}p{{color:rgba(244,247,251,.72);line-height:1.6}}</style></head><body><main><h1>SoundunCloud</h1><p>{message}</p></main></body></html>"
    );

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );

    stream
        .write_all(response.as_bytes())
        .map_err(|error| format!("Could not write the browser response: {error}"))
}

fn load_effective_config(app: &AppHandle) -> Result<Option<OAuthConfig>, String> {
    Ok(load_config_file(app)?.or_else(load_config_from_env))
}

fn load_config_file(app: &AppHandle) -> Result<Option<OAuthConfig>, String> {
    read_json_file(app, CONFIG_FILE_NAME)
}

fn load_session_file(app: &AppHandle) -> Result<Option<PersistedSession>, String> {
    read_json_file(app, SESSION_FILE_NAME)
}

fn load_config_from_env() -> Option<OAuthConfig> {
    let client_id = std::env::var("SOUNDUNCLOUD_CLIENT_ID").ok()?;
    let client_secret = std::env::var("SOUNDUNCLOUD_CLIENT_SECRET").ok()?;
    let redirect_port = std::env::var("SOUNDUNCLOUD_REDIRECT_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(DEFAULT_REDIRECT_PORT);

    Some(OAuthConfig {
        client_id,
        client_secret,
        redirect_port: sanitize_port(redirect_port),
    })
}

fn build_desktop_context(app: &AppHandle) -> DesktopContext {
    let package = app.package_info();

    DesktopContext {
        app_name: package.name.clone(),
        version: package.version.to_string(),
        platform_label: format!("{} desktop", std::env::consts::OS),
        arch: std::env::consts::ARCH.to_string(),
        build_profile: if cfg!(debug_assertions) {
            "debug".into()
        } else {
            "release".into()
        },
    }
}

fn build_redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{}/callback", sanitize_port(port))
}

fn sanitize_port(port: u16) -> u16 {
    if port == 0 {
        DEFAULT_REDIRECT_PORT
    } else {
        port
    }
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

fn app_file_path(app: &AppHandle, file_name: &str) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the app data directory: {error}"))?;

    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|error| error.to_string())?;
    }

    Ok(app_dir.join(file_name))
}

fn read_json_file<T>(app: &AppHandle, file_name: &str) -> Result<Option<T>, String>
where
    T: for<'de> Deserialize<'de>,
{
    let path = app_file_path(app, file_name)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<T>(&raw).map_err(|error| error.to_string())?;
    Ok(Some(parsed))
}

fn write_json_file<T>(app: &AppHandle, file_name: &str, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    let path = app_file_path(app, file_name)?;
    let serialized = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(AuthRuntime::default())))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            begin_soundcloud_login,
            clear_local_session,
            desktop_context,
            load_sounduncloud_snapshot,
            save_oauth_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
