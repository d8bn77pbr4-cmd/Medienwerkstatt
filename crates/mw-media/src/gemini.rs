//! Gemini-Anbindung: Anfragekörper bauen, Antworten lesen, HTTP (blockierend, ureq).
//! Nichts hier läuft von selbst; jede Funktion wird nur auf ausdrücklichen Aufruf tätig.

use crate::error::{Error, Result};
use serde_json::{json, Value};
use std::time::Duration;

const BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

/// Art eines HTTP-Fehlers der Gemini-Schnittstelle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GeminiErrorKind {
    RateLimited,
    InvalidKey,
    Other,
}

/// Ordnet einen HTTP-Status zu: 429 → Begrenzung, 401/403 und 400 mit `API_KEY_INVALID`
/// im Körper → Schlüssel ungültig.
pub fn status_error(status: u16, body: &str) -> GeminiErrorKind {
    match status {
        429 => GeminiErrorKind::RateLimited,
        401 | 403 => GeminiErrorKind::InvalidKey,
        400 if body.contains("API_KEY_INVALID") => GeminiErrorKind::InvalidKey,
        _ => GeminiErrorKind::Other,
    }
}

/// Anfragekörper: Text, dann je Bild ein `inline_data`-Teil (JPEG, Base64); Antwort als JSON
/// nach `schema`. Der Schlüssel gehört nie in den Körper (er reist im Header).
pub fn gemini_request_body(prompt: &str, images_b64_jpeg: &[String], schema: &Value) -> Value {
    let mut parts = vec![json!({ "text": prompt })];
    for img in images_b64_jpeg {
        parts.push(json!({ "inline_data": { "mime_type": "image/jpeg", "data": img } }));
    }
    json!({
        "contents": [{ "parts": parts }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    })
}

/// Fügt die Textteile des ersten Kandidaten zusammen.
pub fn extract_text(resp: &Value) -> Result<String> {
    let parts = resp["candidates"][0]["content"]["parts"]
        .as_array()
        .ok_or_else(|| Error::Parse("Gemini-Antwort ohne Text".into()))?;
    let text: String = parts.iter().filter_map(|p| p["text"].as_str()).collect();
    if text.is_empty() {
        return Err(Error::Parse("Gemini-Antwort ohne Text".into()));
    }
    Ok(text)
}

/// Namen (ohne `models/`) aller Modelle, die `generateContent` können, sortiert.
pub fn model_names(resp: &Value) -> Vec<String> {
    let mut names: Vec<String> = resp["models"]
        .as_array()
        .map(|a| a.as_slice())
        .unwrap_or_default()
        .iter()
        .filter(|m| {
            m["supportedGenerationMethods"]
                .as_array()
                .is_some_and(|g| g.iter().any(|x| x == "generateContent"))
        })
        .filter_map(|m| m["name"].as_str())
        .map(|n| n.strip_prefix("models/").unwrap_or(n).to_string())
        .collect();
    names.sort();
    names
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .build()
}

pub(crate) fn map_http(e: ureq::Error) -> Error {
    match e {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            match status_error(code, &body) {
                GeminiErrorKind::RateLimited => Error::RateLimited,
                GeminiErrorKind::InvalidKey => Error::InvalidKey,
                GeminiErrorKind::Other => Error::Http(format!(
                    "HTTP {code}: {}",
                    body.chars().take(300).collect::<String>()
                )),
            }
        }
        ureq::Error::Transport(t) => Error::Offline(t.to_string()),
    }
}

/// POST `…/models/{model}:generateContent`; liefert den zusammengefügten Antworttext.
pub fn gemini_generate(key: &str, model: &str, body: &Value) -> Result<String> {
    if model.is_empty()
        || !model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_'))
    {
        return Err(Error::Parse(format!("Ungültiger Modellname: {model}")));
    }
    let url = format!("{BASE}/models/{model}:generateContent");
    let resp: Value = agent()
        .post(&url)
        .set("x-goog-api-key", key)
        .send_json(body)
        .map_err(map_http)?
        .into_json()
        .map_err(|e| Error::Parse(e.to_string()))?;
    extract_text(&resp)
}

/// GET `…/models`; nur Modelle mit `generateContent`, Namen ohne `models/`, sortiert.
pub fn gemini_models(key: &str) -> Result<Vec<String>> {
    let resp: Value = agent()
        .get(&format!("{BASE}/models?pageSize=1000"))
        .set("x-goog-api-key", key)
        .call()
        .map_err(map_http)?
        .into_json()
        .map_err(|e| Error::Parse(e.to_string()))?;
    Ok(model_names(&resp))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(code: u16, body: &str) -> Error {
        map_http(ureq::Error::Status(
            code,
            ureq::Response::new(code, "x", body).unwrap(),
        ))
    }

    #[test]
    fn http_errors_map_to_library_errors() {
        let bad_key = r#"{"error":{"code":400,"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}"#;
        assert!(matches!(status(400, bad_key), Error::InvalidKey));
        assert!(matches!(
            status(400, "{\"error\":\"anderes\"}"),
            Error::Http(_)
        ));
        assert!(matches!(status(401, ""), Error::InvalidKey));
        assert!(matches!(status(403, ""), Error::InvalidKey));
        assert!(matches!(status(429, ""), Error::RateLimited));
        assert!(matches!(status(500, "boom"), Error::Http(_)));
    }

    #[test]
    fn status_error_checks_body_only_for_400() {
        assert_eq!(
            status_error(400, "API_KEY_INVALID"),
            GeminiErrorKind::InvalidKey
        );
        assert_eq!(status_error(400, "nope"), GeminiErrorKind::Other);
        assert_eq!(status_error(500, "API_KEY_INVALID"), GeminiErrorKind::Other);
    }
}
