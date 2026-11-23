//! Medien-Bibliothek der Medienwerkstatt. Spätere Tasks ergänzen Probe, Dateien,
//! Prozesse, Proxies, Analyse und Standbilder.

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
