//! Atomares Schreiben mit Sicherungen (`.bak1` … `.bak10`) und Lesen mit Rückfall.

use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

const MAX_BACKUPS: usize = 10;

fn backup_path(path: &Path, n: usize) -> PathBuf {
    let mut s: OsString = path.as_os_str().to_owned();
    s.push(format!(".bak{n}"));
    PathBuf::from(s)
}

/// Schreibt `bytes` atomar nach `path`: Temp-Datei, fsync, Sicherungen rotieren, Umbenennen.
/// Die Hauptdatei fehlt dabei nie (die erste Sicherung ist ein harter Link bzw. eine Kopie).
pub fn write_atomic(path: &Path, bytes: &[u8], keep_backups: usize) -> io::Result<()> {
    let keep = keep_backups.min(MAX_BACKUPS);
    let mut tmp_name: OsString = path.as_os_str().to_owned();
    tmp_name.push(format!(".tmp-{}", std::process::id()));
    let tmp = PathBuf::from(tmp_name);

    let result = (|| {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);

        // Alles jenseits von `keep` entfernen, dann die Kette verschieben.
        for n in (keep + 1)..=MAX_BACKUPS {
            let _ = fs::remove_file(backup_path(path, n));
        }
        for n in (1..keep).rev() {
            let from = backup_path(path, n);
            if from.exists() {
                fs::rename(&from, backup_path(path, n + 1))?;
            }
        }
        if keep >= 1 && path.exists() {
            let b1 = backup_path(path, 1);
            let _ = fs::remove_file(&b1);
            if fs::hard_link(path, &b1).is_err() {
                fs::copy(path, &b1)?;
            }
        }
        fs::rename(&tmp, path)?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&tmp);
        return result;
    }
    #[cfg(unix)]
    if let Some(dir) = path.parent() {
        let dir = if dir.as_os_str().is_empty() {
            Path::new(".")
        } else {
            dir
        };
        if let Ok(d) = File::open(dir) {
            let _ = d.sync_all();
        }
    }
    Ok(())
}

/// Liefert die neueste lesbare Fassung (`path`, dann `.bak1` … `.bak10`), die `validate` besteht.
/// Der Wahrheitswert ist `true`, wenn nicht `path` selbst genommen wurde.
pub fn read_with_backup(
    path: &Path,
    validate: impl Fn(&[u8]) -> bool,
) -> io::Result<(Vec<u8>, bool)> {
    let candidates =
        std::iter::once(path.to_path_buf()).chain((1..=MAX_BACKUPS).map(|n| backup_path(path, n)));
    for (i, p) in candidates.enumerate() {
        if let Ok(bytes) = fs::read(&p) {
            if validate(&bytes) {
                return Ok((bytes, i != 0));
            }
        }
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        format!("keine gültige Fassung von {}", path.display()),
    ))
}
