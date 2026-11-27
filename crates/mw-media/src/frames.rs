//! Standbilder (JPEG) an bestimmten Zeitpunkten.

use crate::error::{Error, Result};
use crate::run::drain_tail;
use crate::tools::{spawn_error, Tools};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Schreibt je Zeitpunkt (Sekunden) ein JPEG `frame-<index>-<ms>.jpg` nach `out_dir`
/// (wird angelegt), höchstens `max_width` Pixel breit (nie hochskaliert). Die Pfade
/// kommen in der Reihenfolge von `times` zurück.
pub fn extract_frames(
    t: &Tools,
    file: &Path,
    times: &[f64],
    max_width: u32,
    out_dir: &Path,
) -> Result<Vec<PathBuf>> {
    fs::create_dir_all(out_dir)?;
    let scale = format!("scale='min({max_width},iw)':-2");
    let mut paths = Vec::with_capacity(times.len());
    for (i, &time) in times.iter().enumerate() {
        let time = if time.is_finite() { time.max(0.0) } else { 0.0 };
        let ms = (time * 1000.0).round() as u64;
        let out = out_dir.join(format!("frame-{i}-{ms}.jpg"));
        let mut child = Command::new(&t.ffmpeg)
            .args(["-hide_banner", "-nostdin", "-y", "-v", "error", "-ss"])
            .arg(format!("{time:.3}"))
            .arg("-i")
            .arg(file)
            .args(["-frames:v", "1", "-vf"])
            .arg(&scale)
            .args(["-q:v", "3"])
            .arg(&out)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| spawn_error(&t.ffmpeg, e))?;
        let err = drain_tail(child.stderr.take().expect("stderr piped"));
        let status = child.wait()?;
        let stderr_tail = err.join().unwrap_or_default();
        if !status.success() {
            return Err(Error::ToolFailed {
                code: status.code(),
                stderr_tail,
            });
        }
        if !out.is_file() {
            // Zeitpunkt hinter dem Ende: ffmpeg meldet Erfolg, schreibt aber nichts.
            return Err(Error::ToolFailed {
                code: None,
                stderr_tail: format!("kein Bild bei {time:.3} s"),
            });
        }
        paths.push(out);
    }
    Ok(paths)
}
