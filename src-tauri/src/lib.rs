mod auth_backend;

use auth_backend::DESKTOP_CALLBACK_URL;
use keyring::{Entry, Error as KeyringError};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;
#[cfg(target_os = "windows")]
use window_vibrancy::apply_mica;

const CONFIG_FILE_NAME: &str = "sounduncloud-config.json";
const SESSION_FILE_NAME: &str = "sounduncloud-session.json";
const PENDING_AUTH_FILE_NAME: &str = "sounduncloud-pending-auth.json";
const AUTH_EVENT_SUCCESS: &str = "sounduncloud://auth-success";
const AUTH_EVENT_ERROR: &str = "sounduncloud://auth-error";
const KEYRING_SERVICE: &str = "com.yabuku.sounduncloud";
const SESSION_SECRET_ENTRY: &str = "oauth-session";
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
    auth_base_url: Option<String>,
    uses_secure_storage: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthLaunch {
    authorize_url: String,
    redirect_uri: String,
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

#[tauri::command]
fn desktop_context(app: AppHandle) -> DesktopContext {
    build_desktop_context(&app)
}

#[tauri::command]
fn load_sounduncloud_snapshot(app: AppHandle) -> Result<SoundunCloudSnapshot, String> {
    let desktop_context = build_desktop_context(&app);
    let config_resolution = auth_backend::load_effective_config(&app)?;
    let session = auth_backend::load_session_file(&app, config_resolution.config.as_ref())?;

    Ok(SoundunCloudSnapshot {
        desktop_context,
        oauth_configured: config_resolution.config.is_some(),
        redirect_uri: DESKTOP_CALLBACK_URL.into(),
        has_local_session: session.is_some(),
        authenticated_user: session.map(|stored| stored.user),
        config_source: config_resolution.config_source,
        auth_base_url: config_resolution.auth_base_url,
        uses_secure_storage: true,
    })
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
    let config_resolution = auth_backend::load_effective_config(&app)?;
    let session = auth_backend::load_session_file(&app, config_resolution.config.as_ref())?
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

    let is_maximized = window.is_maximized().map_err(|error| {
        format!("Could not read the maximize state of the main window: {error}")
    })?;

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
    auth_backend::begin_soundcloud_login(app, runtime)
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

fn current_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
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
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            #[cfg(desktop)]
            {
                let _ = app.deep_link().register("sounduncloud");

                let app_handle = app.handle().clone();
                if let Some(urls) = app.deep_link().get_current()? {
                    auth_backend::handle_deep_link_urls(&app_handle, &urls);
                }

                let app_handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let urls = event.urls().to_vec();
                    auth_backend::handle_deep_link_urls(&app_handle, &urls);
                });
            }

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
            main_window_toggle_maximize
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
