//! Fehler der Tauri-Befehle: erscheinen im Frontend als `{ code, message }`.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CmdError {
    /// tool_missing, tool_failed, io, parse, invalid_key, rate_limited, offline, invalid_path, invalid_args
    pub code: &'static str,
    pub message: String,
}

pub type CmdResult<T> = Result<T, CmdError>;

impl CmdError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        CmdError {
            code,
            message: message.into(),
        }
    }
    pub fn invalid_path(message: impl Into<String>) -> Self {
        CmdError::new("invalid_path", message)
    }
    pub fn io(message: impl Into<String>) -> Self {
        CmdError::new("io", message)
    }
}

impl From<mw_media::Error> for CmdError {
    fn from(e: mw_media::Error) -> Self {
        use mw_media::Error as E;
        let code = match &e {
            E::Io(_) | E::Http(_) => "io",
            E::ToolMissing(_) => "tool_missing",
            E::ToolFailed { .. } => "tool_failed",
            E::Parse(_) => "parse",
            E::InvalidKey => "invalid_key",
            E::RateLimited => "rate_limited",
            E::Offline(_) => "offline",
        };
        CmdError::new(code, e.to_string())
    }
}

impl From<std::io::Error> for CmdError {
    fn from(e: std::io::Error) -> Self {
        CmdError::io(e.to_string())
    }
}

impl From<tauri::Error> for CmdError {
    fn from(e: tauri::Error) -> Self {
        CmdError::io(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_code_and_message() {
        let v = serde_json::to_value(CmdError::new("rate_limited", "zu viele")).unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "code": "rate_limited", "message": "zu viele" })
        );
    }

    #[test]
    fn library_errors_map_to_codes() {
        let code = |e: mw_media::Error| CmdError::from(e).code;
        assert_eq!(code(mw_media::Error::InvalidKey), "invalid_key");
        assert_eq!(code(mw_media::Error::RateLimited), "rate_limited");
        assert_eq!(code(mw_media::Error::Offline("x".into())), "offline");
        assert_eq!(
            code(mw_media::Error::ToolMissing("ffmpeg".into())),
            "tool_missing"
        );
        assert_eq!(code(mw_media::Error::Parse("x".into())), "parse");
        assert_eq!(
            code(mw_media::Error::ToolFailed {
                code: Some(1),
                stderr_tail: String::new()
            }),
            "tool_failed"
        );
    }
}
