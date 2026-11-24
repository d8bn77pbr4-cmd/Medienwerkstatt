//! ffmpeg ohne Shell starten, Fortschritt melden, Fehlerausgabe sammeln.

use crate::error::{Error, Result};
use crate::tools::{spawn_error, Tools};
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::thread::{self, JoinHandle};

const STDERR_LINES: usize = 20;

/// Parst eine `-progress`-Zeile `out_time_us=…`/`out_time_ms=…` (beides Mikrosekunden) in Sekunden.
fn progress_seconds(line: &str) -> Option<f64> {
    let v = line
        .strip_prefix("out_time_us=")
        .or_else(|| line.strip_prefix("out_time_ms="))?;
    let us: i64 = v.trim().parse().ok()?;
    Some((us.max(0) as f64) / 1_000_000.0)
}

/// Liest stderr in einem eigenen Thread leer (Pipe läuft nie voll) und liefert die letzten
/// 20 Zeilen. Bytes werden verlustbehaftet als UTF-8 gelesen, nie als Fehler abgebrochen.
pub(crate) fn drain_tail(stderr: impl Read + Send + 'static) -> JoinHandle<String> {
    thread::spawn(move || {
        let mut tail: VecDeque<String> = VecDeque::with_capacity(STDERR_LINES + 1);
        for line in BufReader::new(stderr).split(b'\n').map_while(|l| l.ok()) {
            if tail.len() == STDERR_LINES {
                tail.pop_front();
            }
            tail.push_back(String::from_utf8_lossy(&line).trim_end().to_string());
        }
        tail.into_iter().collect::<Vec<_>>().join("\n")
    })
}

/// Führt ffmpeg mit `args` aus (Argument-Array, keine Shell). `on_progress` bekommt
/// monoton steigende Werte in 0…1; am Ende 1.0. Bei `duration_sec <= 0` nur das Ende.
pub fn run_ffmpeg(
    t: &Tools,
    args: &[String],
    duration_sec: f64,
    mut on_progress: impl FnMut(f64),
) -> Result<()> {
    let mut child = Command::new(&t.ffmpeg)
        .args([
            "-hide_banner",
            "-nostdin",
            "-y",
            "-progress",
            "pipe:1",
            "-nostats",
        ])
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| spawn_error(&t.ffmpeg, e))?;

    let err_thread = drain_tail(child.stderr.take().expect("stderr piped"));

    let stdout = child.stdout.take().expect("stdout piped");
    let mut last = 0.0f64;
    let mut done = false;
    for line in BufReader::new(stdout).lines().map_while(|l| l.ok()) {
        if line == "progress=end" {
            if !done {
                done = true;
                last = 1.0;
                on_progress(1.0);
            }
        } else if let Some(sec) = progress_seconds(&line) {
            if duration_sec > 0.0 {
                let f = (sec / duration_sec).min(1.0);
                if f > last && !done {
                    last = f;
                    on_progress(f);
                }
            }
        }
    }

    let status = child.wait()?;
    let stderr_tail = err_thread.join().unwrap_or_default();
    if !status.success() {
        return Err(Error::ToolFailed {
            code: status.code(),
            stderr_tail,
        });
    }
    if !done {
        on_progress(1.0);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_progress_lines() {
        assert_eq!(progress_seconds("out_time_us=1500000"), Some(1.5));
        assert_eq!(progress_seconds("out_time_ms=2000000"), Some(2.0));
        assert_eq!(progress_seconds("out_time_us=N/A"), None);
        assert_eq!(progress_seconds("out_time_us=-5"), Some(0.0));
        assert_eq!(progress_seconds("frame=3"), None);
    }
}
