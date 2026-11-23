//! Medien-Bibliothek der Medienwerkstatt: Probe, Dateien, ffmpeg-Läufe und Proxies.
//! Spätere Tasks ergänzen Analyse und Standbilder.

pub mod error;
pub mod fsx;
pub mod probe;
pub mod proxy;
pub mod run;
pub mod tools;

pub use error::{Error, Result};
pub use fsx::{read_with_backup, write_atomic};
pub use probe::{probe, MediaInfo, MediaKind};
pub use proxy::{default_h264_encoder, proxy_args};
pub use run::run_ffmpeg;
pub use tools::Tools;

/// Name der Bibliothek, für Diagnose und Tests.
pub const NAME: &str = "mw-media";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn library_is_named() {
        assert_eq!(NAME, "mw-media");
    }
}
