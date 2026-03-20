use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::{Entry, Error as KeyringError};
use rand::{distr::Alphanumeric, Rng};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use url::Url;
#[cfg(target_os = "windows")]
use window_vibrancy::apply_mica;

const CONFIG_FILE_NAME: &str = "sounduncloud-config.json";
const SESSION_FILE_NAME: &str = "sounduncloud-session.json";
const AUTH_EVENT_SUCCESS: &str = "sounduncloud://auth-success";
const AUTH_EVENT_ERROR: &str = "sounduncloud://auth-error";
const DEFAULT_REDIRECT_PORT: u16 = 8976;
const KEYRING_SERVICE: &str = "com.yabuku.sounduncloud";
const CONFIG_SECRET_ENTRY: &str = "oauth-client-secret";
const SESSION_SECRET_ENTRY: &str = "oauth-session";
const AUTH_ACCEPT_TIMEOUT: Duration = Duration::from_secs(180);
const AUTH_POLL_INTERVAL: Duration = Duration::from_millis(250);
const REFRESH_GRACE_SECONDS: u64 = 45;

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

#[derive(Debug, Clone)]
struct OAuthConfig {
    client_id: String,
    client_secret: String,
    redirect_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredOAuthConfig {
    client_id: String,
    redirect_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyOAuthConfig {
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

#[derive(Debug, Clone)]
struct PersistedSession {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: u64,
    user: AuthenticatedUser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSessionMetadata {
    expires_at: u64,
    user: AuthenticatedUser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionSecrets {
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyPersistedSession {
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
    stored_client_id: Option<String>,
    uses_secure_storage: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundCloudTrackUser {
    username: String,
    full_name: Option<String>,
    permalink_url: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundCloudTrack {
    urn: String,
    title: String,
    permalink_url: String,
    artwork_url: Option<String>,
    #[serde(default)]
    duration: u64,
    #[serde(default)]
    playback_count: u64,
    #[serde(default)]
    user_playback_count: u64,
    #[serde(default)]
    access: Option<String>,
    user: Option<SoundCloudTrackUser>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundCloudPlaylist {
    urn: String,
    title: String,
    permalink_url: String,
    artwork_url: Option<String>,
    #[serde(default)]
    track_count: u64,
    user: Option<SoundCloudTrackUser>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ApiCollection<T> {
    Wrapped { collection: Vec<T> },
    Plain(Vec<T>),
}

impl<T> ApiCollection<T> {
    fn into_vec(self) -> Vec<T> {
        match self {
            Self::Wrapped { collection } => collection,
            Self::Plain(values) => values,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersonalizedHome {
    viewer: AuthenticatedUser,
    featured_track: Option<SoundCloudTrack>,
    feed_tracks: Vec<SoundCloudTrack>,
    liked_tracks: Vec<SoundCloudTrack>,
    recent_tracks: Vec<SoundCloudTrack>,
    playlists: Vec<SoundCloudPlaylist>,
}

struct ConfigResolution {
    config: Option<OAuthConfig>,
    config_source: String,
    stored_client_id: Option<String>,
    redirect_port: u16,
}

#[tauri::command]
fn desktop_context(app: AppHandle) -> DesktopContext {
    build_desktop_context(&app)
}

#[tauri::command]
fn load_sounduncloud_snapshot(app: AppHandle) -> Result<SoundunCloudSnapshot, String> {
    let desktop_context = build_desktop_context(&app);
    let config_resolution = load_effective_config(&app)?;
    let session = load_session_file(&app, config_resolution.config.as_ref())?;

    Ok(SoundunCloudSnapshot {
        desktop_context,
        oauth_configured: config_resolution.config.is_some(),
        redirect_uri: build_redirect_uri(config_resolution.redirect_port),
        has_local_session: session.is_some(),
        authenticated_user: session.map(|stored| stored.user),
        config_source: config_resolution.config_source,
        stored_client_id: config_resolution.stored_client_id,
        uses_secure_storage: true,
    })
}

#[tauri::command]
fn save_oauth_config(app: AppHandle, input: OAuthConfigInput) -> Result<(), String> {
    if input.client_id.trim().is_empty() || input.client_secret.trim().is_empty() {
        return Err("Client ID and client secret are required.".into());
    }

    let config = StoredOAuthConfig {
        client_id: input.client_id.trim().to_string(),
        redirect_port: sanitize_port(input.redirect_port),
    };

    write_json_file(&app, CONFIG_FILE_NAME, &config)?;
    write_keyring_secret(CONFIG_SECRET_ENTRY, input.client_secret.trim())
}

#[tauri::command]
fn clear_local_session(app: AppHandle) -> Result<(), String> {
    clear_session_state(&app)
}

#[tauri::command]
fn load_personalized_home(
    app: AppHandle,
    recent_track_urns: Vec<String>,
) -> Result<PersonalizedHome, String> {
    let config_resolution = load_effective_config(&app)?;
    let session = load_session_file(&app, config_resolution.config.as_ref())?
        .ok_or_else(|| "Sign in with SoundCloud before using the desktop app.".to_string())?;
    let client = http_client(Duration::from_secs(20))?;

    let feed_tracks = fetch_tracks(
        &client,
        &session.access_token,
        "/me/feed/tracks?limit=12&linked_partitioning=true",
    )?;
    let liked_tracks = fetch_tracks(
        &client,
        &session.access_token,
        "/me/likes/tracks?limit=12&linked_partitioning=true",
    )?;
    let playlists = fetch_playlists(
        &client,
        &session.access_token,
        "/me/playlists?show_tracks=false&limit=8&linked_partitioning=true",
    )?;
    let recent_tracks = fetch_recent_tracks(&client, &session.access_token, &recent_track_urns)?;

    Ok(PersonalizedHome {
        viewer: session.user,
        featured_track: feed_tracks
            .first()
            .cloned()
            .or_else(|| liked_tracks.first().cloned())
            .or_else(|| recent_tracks.first().cloned()),
        feed_tracks,
        liked_tracks,
        recent_tracks,
        playlists,
    })
}

#[tauri::command]
fn main_window_start_dragging(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Could not resolve the main window.".to_string())?;

    window
        .start_dragging()
        .map_err(|error| format!("Could not start dragging the main window: {error}"))
}

#[tauri::command]
fn main_window_minimize(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Could not resolve the main window.".to_string())?;

    window
        .minimize()
        .map_err(|error| format!("Could not minimize the main window: {error}"))
}

#[tauri::command]
fn main_window_toggle_maximize(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Could not resolve the main window.".to_string())?;

    let is_maximized = window
        .is_maximized()
        .map_err(|error| format!("Could not read the maximize state of the main window: {error}"))?;

    if is_maximized {
        window
            .unmaximize()
            .map_err(|error| format!("Could not restore the main window: {error}"))
    } else {
        window
            .maximize()
            .map_err(|error| format!("Could not maximize the main window: {error}"))
    }
}

#[tauri::command]
fn main_window_close(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Could not resolve the main window.".to_string())?;

    window
        .close()
        .map_err(|error| format!("Could not close the main window: {error}"))
}

#[tauri::command]
fn begin_soundcloud_login(
    app: AppHandle,
    runtime: State<SharedAuthRuntime>,
) -> Result<AuthLaunch, String> {
    let config = load_effective_config(&app)?
        .config
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
    let listener = TcpListener::bind(("127.0.0.1", config.redirect_port)).map_err(|_| {
        format!(
            "Port {} is unavailable for the OAuth callback.",
            config.redirect_port
        )
    })?;
    listener
        .set_nonblocking(true)
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

    thread::spawn(move || {
        let result = complete_browser_flow(
            &app_handle,
            listener,
            &config,
            &callback_redirect_uri,
            &state,
            &code_verifier,
        );

        if let Ok(mut auth_runtime) = runtime_handle.lock() {
            auth_runtime.is_authorizing = false;
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
    let started = Instant::now();
    let mut stream = None;

    while started.elapsed() < AUTH_ACCEPT_TIMEOUT {
        match listener.accept() {
            Ok((accepted_stream, _)) => {
                stream = Some(accepted_stream);
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(AUTH_POLL_INTERVAL);
            }
            Err(error) => {
                return Err(format!("OAuth callback was not received: {error}"));
            }
        }
    }

    let mut stream = stream.ok_or_else(|| {
        "SoundCloud sign-in timed out before the browser returned to the desktop app.".to_string()
    })?;

    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| error.to_string())?;

    let request_target = read_callback_request_target(&mut stream)?;
    let callback_url = Url::parse(&format!("http://127.0.0.1{request_target}"))
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

    let auth_code =
        code.ok_or_else(|| "SoundCloud did not return an authorization code.".to_string())?;
    let client = http_client(Duration::from_secs(30))?;

    let token = exchange_code_for_token(&client, config, redirect_uri, code_verifier, &auth_code)?;
    let user = fetch_authenticated_user(&client, &token.access_token)?;
    save_session_file(
        app,
        PersistedSession {
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            expires_at: current_epoch_seconds().saturating_add(token.expires_in),
            user: user.clone(),
        },
    )?;

    write_browser_response(
        &mut stream,
        "SoundunCloud sign-in is complete. You can close this browser tab and return to the app.",
    )?;

    Ok(user)
}

fn read_callback_request_target(stream: &mut TcpStream) -> Result<String, String> {
    let mut buffer = [0_u8; 8192];
    let bytes_read = stream
        .read(&mut buffer)
        .map_err(|error| format!("Could not read OAuth callback: {error}"))?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let request_line = request
        .lines()
        .next()
        .ok_or_else(|| "OAuth callback request was empty.".to_string())?;

    request_line
        .split_whitespace()
        .nth(1)
        .map(str::to_string)
        .ok_or_else(|| "OAuth callback request line was invalid.".to_string())
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

fn refresh_token(
    client: &Client,
    config: &OAuthConfig,
    refresh_token: &str,
) -> Result<OAuthTokenResponse, String> {
    client
        .post("https://secure.soundcloud.com/oauth/token")
        .header("accept", "application/json; charset=utf-8")
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", config.client_id.as_str()),
            ("client_secret", config.client_secret.as_str()),
            ("refresh_token", refresh_token),
        ])
        .send()
        .map_err(|error| format!("Could not refresh the SoundCloud session: {error}"))?
        .error_for_status()
        .map_err(|error| format!("SoundCloud rejected the stored session refresh: {error}"))?
        .json::<OAuthTokenResponse>()
        .map_err(|error| format!("Could not decode the refreshed SoundCloud token: {error}"))
}

fn fetch_tracks(
    client: &Client,
    access_token: &str,
    path: &str,
) -> Result<Vec<SoundCloudTrack>, String> {
    authorized_get_json::<ApiCollection<SoundCloudTrack>>(client, access_token, path)
        .map(ApiCollection::into_vec)
}

fn fetch_playlists(
    client: &Client,
    access_token: &str,
    path: &str,
) -> Result<Vec<SoundCloudPlaylist>, String> {
    authorized_get_json::<ApiCollection<SoundCloudPlaylist>>(client, access_token, path)
        .map(ApiCollection::into_vec)
}

fn fetch_recent_tracks(
    client: &Client,
    access_token: &str,
    recent_track_urns: &[String],
) -> Result<Vec<SoundCloudTrack>, String> {
    let recent_track_urns: Vec<String> = recent_track_urns
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .take(12)
        .collect();

    if recent_track_urns.is_empty() {
        return Ok(Vec::new());
    }

    let query = recent_track_urns.join(",");
    let mut resolved = fetch_tracks(
        client,
        access_token,
        &format!(
            "/tracks?urns={}&limit={}",
            urlencoding::encode(&query),
            recent_track_urns.len()
        ),
    )?;

    resolved.sort_by_key(|track| {
        recent_track_urns
            .iter()
            .position(|urn| urn == &track.urn)
            .unwrap_or(usize::MAX)
    });

    Ok(resolved)
}

fn fetch_authenticated_user(
    client: &Client,
    access_token: &str,
) -> Result<AuthenticatedUser, String> {
    let me = authorized_get_json::<MeResponse>(client, access_token, "/me").map_err(|error| {
        format!("Could not parse the authenticated SoundCloud profile: {error}")
    })?;

    Ok(AuthenticatedUser {
        username: me.username,
        full_name: me.full_name,
        permalink_url: me.permalink_url,
        avatar_url: me.avatar_url,
    })
}

fn authorized_get_json<T>(client: &Client, access_token: &str, path: &str) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let url = if path.starts_with("http://") || path.starts_with("https://") {
        path.to_string()
    } else {
        format!("https://api.soundcloud.com{path}")
    };

    client
        .get(url)
        .header("accept", "application/json; charset=utf-8")
        .header("Authorization", format!("OAuth {access_token}"))
        .send()
        .map_err(|error| format!("Could not load SoundCloud data: {error}"))?
        .error_for_status()
        .map_err(|error| format!("SoundCloud rejected the request: {error}"))?
        .json::<T>()
        .map_err(|error| format!("Could not decode the SoundCloud response: {error}"))
}

fn write_browser_response(stream: &mut TcpStream, message: &str) -> Result<(), String> {
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>SoundunCloud</title><style>body{{margin:0;font-family:Segoe UI,sans-serif;background:#111315;color:#f3efe7;display:grid;place-items:center;min-height:100vh}}main{{max-width:560px;padding:32px;border:1px solid rgba(255,255,255,.08);border-radius:28px;background:#171b1f;box-shadow:0 20px 60px rgba(0,0,0,.32)}}h1{{margin:0 0 12px;font-size:2rem}}p{{margin:0;color:rgba(243,239,231,.76);line-height:1.7}}</style></head><body><main><h1>SoundunCloud</h1><p>{message}</p></main></body></html>"
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

fn load_effective_config(app: &AppHandle) -> Result<ConfigResolution, String> {
    let local_config = load_local_config_file(app)?;
    let env_config = load_config_from_env();

    if let Some(local) = local_config {
        let secret = load_keyring_secret(CONFIG_SECRET_ENTRY)?;
        return Ok(ConfigResolution {
            config: secret.map(|client_secret| OAuthConfig {
                client_id: local.client_id.clone(),
                client_secret,
                redirect_port: local.redirect_port,
            }),
            config_source: "app-storage".into(),
            stored_client_id: Some(local.client_id),
            redirect_port: local.redirect_port,
        });
    }

    let redirect_port = env_config
        .as_ref()
        .map(|config| config.redirect_port)
        .unwrap_or(DEFAULT_REDIRECT_PORT);

    Ok(ConfigResolution {
        config: env_config.clone(),
        config_source: if env_config.is_some() {
            "environment".into()
        } else {
            "missing".into()
        },
        stored_client_id: env_config.map(|config| config.client_id),
        redirect_port,
    })
}

fn load_local_config_file(app: &AppHandle) -> Result<Option<StoredOAuthConfig>, String> {
    let path = app_file_path(app, CONFIG_FILE_NAME)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;

    if let Ok(legacy) = serde_json::from_str::<LegacyOAuthConfig>(&raw) {
        let migrated = StoredOAuthConfig {
            client_id: legacy.client_id,
            redirect_port: sanitize_port(legacy.redirect_port),
        };
        write_keyring_secret(CONFIG_SECRET_ENTRY, &legacy.client_secret)?;
        write_json_file(app, CONFIG_FILE_NAME, &migrated)?;
        return Ok(Some(migrated));
    }

    let stored =
        serde_json::from_str::<StoredOAuthConfig>(&raw).map_err(|error| error.to_string())?;
    Ok(Some(StoredOAuthConfig {
        client_id: stored.client_id,
        redirect_port: sanitize_port(stored.redirect_port),
    }))
}

fn load_session_file(
    app: &AppHandle,
    config: Option<&OAuthConfig>,
) -> Result<Option<PersistedSession>, String> {
    let metadata = load_session_metadata(app)?;
    let Some(metadata) = metadata else {
        return Ok(None);
    };

    let secrets = load_session_secrets()?;
    let Some(secrets) = secrets else {
        clear_session_state(app)?;
        return Ok(None);
    };

    let mut session = PersistedSession {
        access_token: secrets.access_token,
        refresh_token: secrets.refresh_token,
        expires_at: metadata.expires_at,
        user: metadata.user,
    };

    let now = current_epoch_seconds();
    if session.expires_at <= now.saturating_add(REFRESH_GRACE_SECONDS) {
        let Some(config) = config else {
            clear_session_state(app)?;
            return Ok(None);
        };
        let Some(stored_refresh_token) = session.refresh_token.clone() else {
            clear_session_state(app)?;
            return Ok(None);
        };

        let client = http_client(Duration::from_secs(30))?;
        let refreshed = match refresh_token(&client, config, &stored_refresh_token) {
            Ok(token) => token,
            Err(_) => {
                clear_session_state(app)?;
                return Ok(None);
            }
        };

        let user = fetch_authenticated_user(&client, &refreshed.access_token)?;
        session = PersistedSession {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token.or(Some(stored_refresh_token)),
            expires_at: now.saturating_add(refreshed.expires_in),
            user,
        };
        save_session_file(app, session.clone())?;
    }

    Ok(Some(session))
}

fn load_session_metadata(app: &AppHandle) -> Result<Option<StoredSessionMetadata>, String> {
    let path = app_file_path(app, SESSION_FILE_NAME)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;

    if let Ok(legacy) = serde_json::from_str::<LegacyPersistedSession>(&raw) {
        let session = PersistedSession {
            access_token: legacy.access_token,
            refresh_token: legacy.refresh_token,
            expires_at: legacy.expires_at,
            user: legacy.user,
        };
        save_session_file(app, session.clone())?;
        return Ok(Some(StoredSessionMetadata {
            expires_at: session.expires_at,
            user: session.user,
        }));
    }

    read_json_file(app, SESSION_FILE_NAME)
}

fn save_session_file(app: &AppHandle, session: PersistedSession) -> Result<(), String> {
    let metadata = StoredSessionMetadata {
        expires_at: session.expires_at,
        user: session.user,
    };
    let secrets = SessionSecrets {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
    };

    write_json_file(app, SESSION_FILE_NAME, &metadata)?;
    write_keyring_json(SESSION_SECRET_ENTRY, &secrets)
}

fn load_session_secrets() -> Result<Option<SessionSecrets>, String> {
    let Some(raw) = load_keyring_secret(SESSION_SECRET_ENTRY)? else {
        return Ok(None);
    };

    serde_json::from_str::<SessionSecrets>(&raw)
        .map(Some)
        .map_err(|error| format!("Could not decode the stored session secrets: {error}"))
}

fn clear_session_state(app: &AppHandle) -> Result<(), String> {
    let session_path = app_file_path(app, SESSION_FILE_NAME)?;
    if session_path.exists() {
        fs::remove_file(session_path).map_err(|error| error.to_string())?;
    }
    delete_keyring_secret(SESSION_SECRET_ENTRY)
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

fn http_client(timeout: Duration) -> Result<Client, String> {
    Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|error| error.to_string())
}

fn keyring_entry(key: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, key)
        .map_err(|error| format!("Could not prepare secure storage: {error}"))
}

fn load_keyring_secret(key: &str) -> Result<Option<String>, String> {
    let entry = keyring_entry(key)?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("Could not read secure storage: {error}")),
    }
}

fn write_keyring_secret(key: &str, value: &str) -> Result<(), String> {
    keyring_entry(key)?
        .set_password(value)
        .map_err(|error| format!("Could not save secure storage entry: {error}"))
}

fn write_keyring_json<T>(key: &str, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    let serialized = serde_json::to_string(value).map_err(|error| error.to_string())?;
    write_keyring_secret(key, &serialized)
}

fn delete_keyring_secret(key: &str) -> Result<(), String> {
    let entry = keyring_entry(key)?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not clear secure storage entry: {error}")),
    }
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
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.center();

                let _ = apply_mica(&window, Some(true));

                let _ = window.show();
            }

            Ok(())
        })
        .manage(Arc::new(Mutex::new(AuthRuntime::default())))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            begin_soundcloud_login,
            clear_local_session,
            desktop_context,
            load_personalized_home,
            load_sounduncloud_snapshot,
            main_window_close,
            main_window_minimize,
            main_window_start_dragging,
            main_window_toggle_maximize,
            save_oauth_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
