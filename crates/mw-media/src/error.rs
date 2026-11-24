//! Fehlertyp der Bibliothek.

use std::io;

/// Alle Fehler der öffentlichen API.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Ein-/Ausgabefehler: {0}")]
    Io(#[from] io::Error),
    /// ffmpeg/ffprobe wurde nicht gefunden (Pfad im Inhalt).
    #[error("Programm nicht gefunden: {0}")]
    ToolMissing(String),
    /// Das Programm endete mit Fehler; `stderr_tail` enthält die letzten 20 Zeilen.
    #[error("Programm fehlgeschlagen (Code {code:?}): {stderr_tail}")]
    ToolFailed {
        code: Option<i32>,
        stderr_tail: String,
    },
    #[error("Ausgabe nicht lesbar: {0}")]
    Parse(String),
    /// Gemini lehnt den Schlüssel ab (HTTP 401/403).
    #[error("Gemini-Schlüssel ungültig")]
    InvalidKey,
    /// Gemini begrenzt die Anfragen (HTTP 429).
    #[error("Gemini: zu viele Anfragen")]
    RateLimited,
    /// Keine Verbindung zum Netz.
    #[error("Keine Verbindung: {0}")]
    Offline(String),
    /// Anderer HTTP-Fehler.
    #[error("Gemini-Fehler: {0}")]
    Http(String),
}

pub type Result<T> = std::result::Result<T, Error>;
