//! Medien-Bibliothek der Medienwerkstatt: Probe, Dateien, ffmpeg-Läufe und Proxies.
//! Außerdem Analyse (Lautheit, Belichtung, Schnitte) und Standbilder.

pub mod analyze;
pub mod error;
pub mod frames;
pub mod fsx;
pub mod gemini;
pub mod probe;
pub mod proxy;
pub mod run;
pub mod tools;

pub use analyze::{
    analyze, AudioStats, Format, Interval, Measurements, Segment, SegmentStats, VideoStats,
};
pub use error::{Error, Result};
pub use frames::extract_frames;
pub use fsx::{read_with_backup, write_atomic};
pub use gemini::{gemini_generate, gemini_models, gemini_request_body};
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
