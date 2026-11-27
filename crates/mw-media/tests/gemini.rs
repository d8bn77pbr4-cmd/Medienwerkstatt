use mw_media::gemini::{
    extract_text, gemini_request_body, model_names, status_error, GeminiErrorKind,
};
use serde_json::json;

#[test]
fn body_has_one_inline_part_per_image() {
    let schema = json!({"type": "OBJECT", "properties": {"a": {"type": "STRING"}}});
    let imgs = vec!["QUJD".to_string(), "REVG".to_string()];
    let body = gemini_request_body("Beschreibe", &imgs, &schema);
    let parts = body["contents"][0]["parts"].as_array().unwrap();
    assert_eq!(parts.len(), 3);
    assert_eq!(parts[0]["text"], "Beschreibe");
    let inline: Vec<_> = parts
        .iter()
        .filter(|p| p.get("inline_data").is_some())
        .collect();
    assert_eq!(inline.len(), 2);
    assert_eq!(inline[0]["inline_data"]["mime_type"], "image/jpeg");
    assert_eq!(inline[1]["inline_data"]["data"], "REVG");
}

#[test]
fn body_requests_json_with_schema_and_contains_no_key() {
    let schema = json!({"type": "OBJECT"});
    let body = gemini_request_body("x", &[], &schema);
    assert_eq!(
        body["generationConfig"]["responseMimeType"],
        "application/json"
    );
    assert_eq!(body["generationConfig"]["responseSchema"], schema);
    let s = body.to_string().to_lowercase();
    assert!(!s.contains("key"));
    assert!(!s.contains("x-goog"));
}

#[test]
fn text_is_concatenated_from_first_candidate() {
    let resp =
        json!({"candidates": [{"content": {"parts": [{"text": "{\"a\":"}, {"text": "1}"}]}}]});
    assert_eq!(extract_text(&resp).unwrap(), "{\"a\":1}");
    assert!(extract_text(&json!({"candidates": []})).is_err());
}

#[test]
fn models_are_filtered_stripped_and_sorted() {
    let resp = json!({"models": [
        {"name": "models/gemini-2.5-pro", "supportedGenerationMethods": ["generateContent", "countTokens"]},
        {"name": "models/embedding-001", "supportedGenerationMethods": ["embedContent"]},
        {"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]}
    ]});
    assert_eq!(
        model_names(&resp),
        vec!["gemini-2.5-flash", "gemini-2.5-pro"]
    );
}

#[test]
fn http_status_maps_to_error_kind() {
    assert_eq!(status_error(429, ""), GeminiErrorKind::RateLimited);
    assert_eq!(status_error(401, ""), GeminiErrorKind::InvalidKey);
    assert_eq!(status_error(403, ""), GeminiErrorKind::InvalidKey);
    assert_eq!(status_error(500, ""), GeminiErrorKind::Other);
}
