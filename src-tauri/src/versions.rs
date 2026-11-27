//! Sicherungsversionen („Auto-Save“): benannte Kopien von `projekt.mwp` bzw. `state.json`,
//! die neuesten `KEEP_VERSIONS` bleiben. Die Namen legt die Oberfläche fest (Ortszeit) und werden hier streng geprüft.

use crate::error::{CmdError, CmdResult};
use mw_media::write_atomic;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

/// Ordnername unter Projekt- bzw. App-Datenordner.
pub const VERSION_DIR: &str = "Auto-Save";
/// So viele Versionen bleiben erhalten (die neuesten nach Name).
pub const KEEP_VERSIONS: usize = 20;

/// `^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.json$`
pub fn valid_version_name(name: &str) -> bool {
    const PATTERN: &[u8] = b"dddd-dd-dd dd-dd-dd.json";
    let b = name.as_bytes();
    b.len() == PATTERN.len()
        && b.iter().zip(PATTERN).all(|(c, p)| match p {
            b'd' => c.is_ascii_digit(),
            _ => c == p,
        })
}

fn checked_name(name: &str) -> CmdResult<&str> {
    if valid_version_name(name) {
        Ok(name)
    } else {
        Err(CmdError::invalid_path(format!(
            "Ungültiger Versionsname: {name}"
        )))
    }
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub name: String,
    /// Änderungszeit der Datei in Millisekunden seit 1970.
    pub saved_at: u64,
    pub bytes: u64,
}

/// Kopiert `src` atomar nach `<versions_dir>/<name>` und behält danach nur die neuesten `keep` Versionen.
pub fn save_version(src: &Path, versions_dir: &Path, name: &str, keep: usize) -> CmdResult<()> {
    let name = checked_name(name)?;
    let bytes = fs::read(src)?;
    fs::create_dir_all(versions_dir)?;
    write_atomic(&versions_dir.join(name), &bytes, 0)?;
    prune(versions_dir, keep);
    Ok(())
}

/// Entfernt alle gültig benannten Versionen bis auf die neuesten `keep` (nach Name). Fehler beim Löschen sind nicht fatal.
pub fn prune(versions_dir: &Path, keep: usize) {
    let mut names = version_names(versions_dir);
    names.sort_unstable_by(|a, b| b.cmp(a));
    for old in names.into_iter().skip(keep) {
        let _ = fs::remove_file(versions_dir.join(old));
    }
}

fn version_names(versions_dir: &Path) -> Vec<String> {
    let Ok(rd) = fs::read_dir(versions_dir) else {
        return Vec::new();
    };
    rd.filter_map(Result::ok)
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| valid_version_name(n))
        .collect()
}

/// Gültig benannte Versionen, neueste zuerst. Fehlt der Ordner, ist die Liste leer.
pub fn list_versions(versions_dir: &Path) -> Vec<VersionInfo> {
    let mut names = version_names(versions_dir);
    names.sort_unstable_by(|a, b| b.cmp(a));
    names
        .into_iter()
        .filter_map(|name| {
            let meta = fs::metadata(versions_dir.join(&name)).ok()?;
            let saved_at = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as u64);
            Some(VersionInfo {
                name,
                saved_at,
                bytes: meta.len(),
            })
        })
        .collect()
}

/// Inhalt einer Version (Name wird geprüft).
pub fn read_version(versions_dir: &Path, name: &str) -> CmdResult<Vec<u8>> {
    let name = checked_name(name)?;
    Ok(fs::read(versions_dir.join(name))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("mw-ver-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn name(i: usize) -> String {
        format!("2026-11-24 10-{:02}-00.json", i)
    }

    #[test]
    fn names_are_validated_strictly() {
        assert!(valid_version_name("2026-11-24 18-42-07.json"));
        for bad in [
            "",
            "2026-11-24 18-42-07",
            "2026-11-24 18-42-07.json ",
            "2026-11-24_18-42-07.json",
            "2026-11-24 18:42:07.json",
            "2026-11-24 18-42-7.json",
            "x026-11-24 18-42-07.json",
            "../2026-11-24 18-42-07.json",
            "2026-11-24 18-42-07.jsonx",
            "2026-11-24 18-42-07.JSON",
            "２０２６-11-24 18-42-07.json",
            "2026-11-24 18-42-07.json\n",
            "a/b",
        ] {
            assert!(!valid_version_name(bad), "{bad:?}");
        }
    }

    #[test]
    fn save_rejects_bad_names_and_writes_nothing() {
        let d = tmp();
        let src = d.join("projekt.mwp");
        fs::write(&src, b"{}").unwrap();
        let dir = d.join(VERSION_DIR);
        assert!(save_version(&src, &dir, "../evil.json", 20).is_err());
        assert!(!dir.exists());
        assert!(read_version(&dir, "../evil.json").is_err());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn save_copies_content_and_leaves_no_temp_files() {
        let d = tmp();
        let src = d.join("projekt.mwp");
        fs::write(&src, b"{\"a\":1}").unwrap();
        let dir = d.join(VERSION_DIR);
        save_version(&src, &dir, &name(1), 20).unwrap();
        assert_eq!(read_version(&dir, &name(1)).unwrap(), b"{\"a\":1}");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        // gleicher Name noch einmal (⌘S zweimal in einer Sekunde) überschreibt
        fs::write(&src, b"{\"a\":2}").unwrap();
        save_version(&src, &dir, &name(1), 20).unwrap();
        assert_eq!(read_version(&dir, &name(1)).unwrap(), b"{\"a\":2}");
        assert!(save_version(&d.join("fehlt"), &dir, &name(2), 20).is_err());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn prunes_to_newest_and_ignores_foreign_files() {
        let d = tmp();
        let src = d.join("projekt.mwp");
        fs::write(&src, b"{}").unwrap();
        let dir = d.join(VERSION_DIR);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("notizen.txt"), b"x").unwrap();
        for i in 0..25 {
            save_version(&src, &dir, &name(i), KEEP_VERSIONS).unwrap();
        }
        let names: Vec<String> = list_versions(&dir).into_iter().map(|v| v.name).collect();
        assert_eq!(names.len(), KEEP_VERSIONS);
        assert_eq!(names.first().unwrap(), &name(24));
        assert_eq!(names.last().unwrap(), &name(5));
        assert!(dir.join("notizen.txt").exists());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn list_is_newest_first_with_size_and_time_and_empty_when_missing() {
        let d = tmp();
        assert!(list_versions(&d.join("nope")).is_empty());
        let src = d.join("projekt.mwp");
        fs::write(&src, b"12345").unwrap();
        let dir = d.join(VERSION_DIR);
        save_version(&src, &dir, &name(3), 20).unwrap();
        save_version(&src, &dir, &name(9), 20).unwrap();
        fs::write(dir.join("2026-11-24 10-30-00.json.bak1"), b"x").unwrap();
        fs::create_dir(dir.join("2026-11-24 10-31-00.json")).unwrap();
        let list = list_versions(&dir);
        assert_eq!(
            list.iter().map(|v| v.name.as_str()).collect::<Vec<_>>(),
            [name(9), name(3)]
        );
        assert!(list.iter().all(|v| v.bytes == 5 && v.saved_at > 0));
        fs::remove_dir_all(&d).unwrap();
    }
}
