use rand::Rng;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::{fs, thread, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State};
use url::Url;

use crate::{
    current_epoch_seconds, http_client, write_json_file, AuthLaunch, AuthenticatedUser,
    LegacyOAuthConfig, PersistedSession, SharedAuthRuntime, AUTH_EVENT_ERROR, AUTH_EVENT_SUCCESS,
    CONFIG_FILE_NAME, PENDING_AUTH_FILE_NAME, REFRESH_GRACE_SECONDS,
};

pub(super) const DESKTOP_CALLBACK_URL: &str = "sounduncloud://auth/callback";
const AUTH_BASE_URL_ENV: &str = "SOUNDUNCLOUD_AUTH_BASE_URL";
const PENDING_AUTH_TTL_SECONDS: u64 = 10 * 60;

#[derive(Debug, Clone)]
pub(super) struct AuthServiceConfig {
    pub auth_base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAppConfig {
    auth_base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingBrowserAuth {
    desktop_state: String,
    created_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrokeredSession {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: u64,
    user: AuthenticatedUser,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExchangeTicketRequest {
    ticket: String,
    desktop_state: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RefreshRequest {
    refresh_token: String,
}

#[derive(Debug, Deserialize)]
struct ErrorPayload {
    error: String,
}

pub(super) struct ConfigResolution {
    pub config: Option<AuthServiceConfig>,
    pub config_source: String,
    pub auth_base_url: Option<String>,
}

pub(super) fn load_effective_config(app: &AppHandle) -> Result<ConfigResolution, String> {
    let local_config = load_local_config_file(app)?;
    let env_config = load_config_from_env();

    if let Some(local) = local_config {
        return Ok(ConfigResolution {
            auth_base_url: Some(local.auth_base_url.clone()),
            config: Some(AuthServiceConfig {
                auth_base_url: local.auth_base_url,
            }),
            config_source: "app-storage".into(),
        });
    }

    Ok(ConfigResolution {
        auth_base_url: env_config
            .as_ref()
            .map(|config| config.auth_base_url.clone()),
        config: env_config.clone(),
        config_source: if env_config.is_some() {
            "environment".into()
        } else {
            "missing".into()
        },
    })
}

pub(super) fn begin_soundcloud_login(
    app: AppHandle,
    runtime: State<SharedAuthRuntime>,
) -> Result<AuthLaunch, String> {
    let config = load_effective_config(&app)?
        .config
        .ok_or_else(|| {
            "This install is missing the SoundunCloud auth service URL, so browser sign-in cannot start yet."
                .to_string()
        })?;

    clear_expired_pending_auth(&app)?;

    if let Some(pending) = load_pending_auth(&app)? {
        if !is_pending_auth_expired(&pending) {
            return Err("SoundCloud sign-in is already in progress.".into());
        }
        clear_pending_auth(&app)?;
    }

    {
        let mut guard = runtime
            .lock()
            .map_err(|_| "Could not lock OAuth runtime.".to_string())?;
        if guard.is_authorizing {
            return Err("SoundCloud sign-in is already in progress.".into());
        }
        guard.is_authorizing = true;
    }

    let client = http_client(Duration::from_secs(8))?;
    if let Err(error) = ensure_auth_service_reachable(&client, &config) {
        set_authorizing(&app, false);
        return Err(error);
    }

    let pending = PendingBrowserAuth {
        desktop_state: random_url_safe(48),
        created_at: current_epoch_seconds(),
    };
    write_json_file(&app, PENDING_AUTH_FILE_NAME, &pending)?;

    Ok(AuthLaunch {
        authorize_url: build_browser_auth_start_url(&config, &pending.desktop_state)?,
        redirect_uri: DESKTOP_CALLBACK_URL.into(),
    })
}

pub(super) fn handle_deep_link_urls(app: &AppHandle, urls: &[Url]) {
    for url in urls {
        if url.scheme() != "sounduncloud" {
            continue;
        }

        if url.host_str() != Some("auth") || url.path() != "/callback" {
            continue;
        }

        let mut ticket = None;
        let mut state = None;
        let mut error_message = None;

        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "ticket" => ticket = Some(value.to_string()),
                "state" => state = Some(value.to_string()),
                "error" => error_message = Some(value.to_string()),
                _ => {}
            }
        }

        if let Some(message) = error_message {
            let _ = clear_pending_auth(app);
            set_authorizing(app, false);
            let _ = app.emit(AUTH_EVENT_ERROR, message);
            continue;
        }

        let Some(ticket) = ticket else {
            let _ = app.emit(
                AUTH_EVENT_ERROR,
                "SoundunCloud received a sign-in callback without a ticket.".to_string(),
            );
            continue;
        };

        let Some(desktop_state) = state else {
            let _ = app.emit(
                AUTH_EVENT_ERROR,
                "SoundunCloud received a sign-in callback without state verification.".to_string(),
            );
            continue;
        };

        let app_handle = app.clone();
        thread::spawn(move || {
            let result = complete_browser_flow(&app_handle, &ticket, &desktop_state);
            set_authorizing(&app_handle, false);

            match result {
                Ok(user) => {
                    let _ = app_handle.emit(AUTH_EVENT_SUCCESS, user);
                }
                Err(message) => {
                    let _ = clear_pending_auth(&app_handle);
                    let _ = app_handle.emit(AUTH_EVENT_ERROR, message);
                }
            }
        });
    }
}

pub(super) fn load_session_file(
    app: &AppHandle,
    config: Option<&AuthServiceConfig>,
) -> Result<Option<PersistedSession>, String> {
    let metadata = super::load_session_metadata(app)?;
    let Some(metadata) = metadata else {
        return Ok(None);
    };

    let secrets = super::load_session_secrets()?;
    let Some(secrets) = secrets else {
        super::clear_session_state(app)?;
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
            super::clear_session_state(app)?;
            return Ok(None);
        };
        let Some(stored_refresh_token) = session.refresh_token.clone() else {
            super::clear_session_state(app)?;
            return Ok(None);
        };

        let client = http_client(Duration::from_secs(30))?;
        let refreshed =
            match refresh_session_via_auth_service(&client, config, &stored_refresh_token) {
                Ok(token) => token,
                Err(_) => {
                    super::clear_session_state(app)?;
                    return Ok(None);
                }
            };

        session = PersistedSession {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token.or(Some(stored_refresh_token)),
            expires_at: refreshed.expires_at,
            user: refreshed.user,
        };
        super::save_session_file(app, session.clone())?;
    }

    Ok(Some(session))
}

fn complete_browser_flow(
    app: &AppHandle,
    ticket: &str,
    desktop_state: &str,
) -> Result<AuthenticatedUser, String> {
    let config = load_effective_config(app)?.config.ok_or_else(|| {
        "This install is missing the SoundunCloud auth service URL, so sign-in cannot finish."
            .to_string()
    })?;

    let pending = load_pending_auth(app)?
        .ok_or_else(|| "The pending SoundCloud sign-in session could not be found.".to_string())?;

    if is_pending_auth_expired(&pending) {
        clear_pending_auth(app)?;
        return Err(
            "The pending SoundCloud sign-in session expired. Start the sign-in flow again.".into(),
        );
    }

    if pending.desktop_state != desktop_state {
        clear_pending_auth(app)?;
        return Err("SoundunCloud could not verify the sign-in return link.".into());
    }

    let client = http_client(Duration::from_secs(30))?;
    let brokered_session =
        exchange_ticket_for_session(&client, &config, ticket, &pending.desktop_state)?;

    super::save_session_file(
        app,
        PersistedSession {
            access_token: brokered_session.access_token,
            refresh_token: brokered_session.refresh_token,
            expires_at: brokered_session.expires_at,
            user: brokered_session.user.clone(),
        },
    )?;
    clear_pending_auth(app)?;

    Ok(brokered_session.user)
}

fn load_local_config_file(app: &AppHandle) -> Result<Option<StoredAppConfig>, String> {
    let path = super::app_file_path(app, CONFIG_FILE_NAME)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;

    if serde_json::from_str::<LegacyOAuthConfig>(&raw).is_ok() {
        return Ok(None);
    }

    let stored =
        serde_json::from_str::<StoredAppConfig>(&raw).map_err(|error| error.to_string())?;
    Ok(Some(StoredAppConfig {
        auth_base_url: normalize_auth_base_url(&stored.auth_base_url)?,
    }))
}

fn load_config_from_env() -> Option<AuthServiceConfig> {
    let auth_base_url = std::env::var(AUTH_BASE_URL_ENV)
        .ok()
        .or_else(|| option_env!("SOUNDUNCLOUD_AUTH_BASE_URL").map(str::to_string))?;
    normalize_auth_base_url(&auth_base_url)
        .ok()
        .map(|auth_base_url| AuthServiceConfig { auth_base_url })
}

fn load_pending_auth(app: &AppHandle) -> Result<Option<PendingBrowserAuth>, String> {
    super::read_json_file(app, PENDING_AUTH_FILE_NAME)
}

fn clear_pending_auth(app: &AppHandle) -> Result<(), String> {
    let path = super::app_file_path(app, PENDING_AUTH_FILE_NAME)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn clear_expired_pending_auth(app: &AppHandle) -> Result<(), String> {
    if let Some(pending) = load_pending_auth(app)? {
        if is_pending_auth_expired(&pending) {
            clear_pending_auth(app)?;
        }
    }
    Ok(())
}

fn is_pending_auth_expired(pending: &PendingBrowserAuth) -> bool {
    current_epoch_seconds().saturating_sub(pending.created_at) > PENDING_AUTH_TTL_SECONDS
}

fn ensure_auth_service_reachable(
    client: &Client,
    config: &AuthServiceConfig,
) -> Result<(), String> {
    let url = service_url(&config.auth_base_url, "/health")?;
    let response = client
        .get(url)
        .header("accept", "application/json")
        .send()
        .map_err(|error| format!("Could not reach the SoundunCloud auth service: {error}"))?;

    if response.status().is_success() {
        return Ok(());
    }

    Err(format!(
        "The SoundunCloud auth service is unavailable right now ({}).",
        response.status()
    ))
}

fn build_browser_auth_start_url(
    config: &AuthServiceConfig,
    desktop_state: &str,
) -> Result<String, String> {
    let url = service_url(&config.auth_base_url, "/oauth/start")?;
    let mut parsed = Url::parse(&url)
        .map_err(|error| format!("Could not build the auth service URL: {error}"))?;
    parsed
        .query_pairs_mut()
        .append_pair("desktop_state", desktop_state);
    Ok(parsed.to_string())
}

fn exchange_ticket_for_session(
    client: &Client,
    config: &AuthServiceConfig,
    ticket: &str,
    desktop_state: &str,
) -> Result<BrokeredSession, String> {
    let response = client
        .post(service_url(
            &config.auth_base_url,
            "/api/auth/exchange-ticket",
        )?)
        .header("accept", "application/json")
        .json(&ExchangeTicketRequest {
            ticket: ticket.to_string(),
            desktop_state: desktop_state.to_string(),
        })
        .send()
        .map_err(|error| format!("Could not complete SoundCloud sign-in: {error}"))?;

    decode_service_response(
        response,
        "SoundunCloud could not exchange the sign-in ticket.",
    )
}

fn refresh_session_via_auth_service(
    client: &Client,
    config: &AuthServiceConfig,
    refresh_token: &str,
) -> Result<BrokeredSession, String> {
    let response = client
        .post(service_url(&config.auth_base_url, "/api/auth/refresh")?)
        .header("accept", "application/json")
        .json(&RefreshRequest {
            refresh_token: refresh_token.to_string(),
        })
        .send()
        .map_err(|error| format!("Could not refresh the SoundCloud session: {error}"))?;

    decode_service_response(
        response,
        "SoundunCloud could not refresh the SoundCloud session.",
    )
}

fn decode_service_response<T>(
    response: reqwest::blocking::Response,
    fallback: &str,
) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let status = response.status();

    if status.is_success() {
        return response
            .json::<T>()
            .map_err(|error| format!("Could not decode the auth service response: {error}"));
    }

    let body = response.text().unwrap_or_default();
    let detail = serde_json::from_str::<ErrorPayload>(&body)
        .ok()
        .map(|payload| payload.error)
        .filter(|message| !message.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string());

    Err(format!("{detail} ({status})"))
}

fn normalize_auth_base_url(value: &str) -> Result<String, String> {
    Url::parse(value.trim())
        .map(|url| url.to_string().trim_end_matches('/').to_string())
        .map_err(|error| format!("Could not parse the auth service URL: {error}"))
}

fn service_url(base_url: &str, path: &str) -> Result<String, String> {
    let normalized = if base_url.ends_with('/') {
        base_url.to_string()
    } else {
        format!("{base_url}/")
    };

    Url::parse(&normalized)
        .and_then(|base| base.join(path.trim_start_matches('/')))
        .map(|url| url.to_string())
        .map_err(|error| format!("Could not build the auth service URL: {error}"))
}

fn set_authorizing(app: &AppHandle, value: bool) {
    if let Some(runtime) = app.try_state::<SharedAuthRuntime>() {
        let shared_runtime = runtime.inner().clone();
        let lock_result = shared_runtime.lock();
        if let Ok(mut guard) = lock_result {
            guard.is_authorizing = value;
        }
    }
}

fn random_url_safe(length: usize) -> String {
    rand::rng()
        .sample_iter(&rand::distr::Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}
