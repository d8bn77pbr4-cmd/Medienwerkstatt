//! Fundorte von ffmpeg und ffprobe.

use crate::error::{Error, Result};
use std::io;
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[derive(Debug, Clone)]
pub struct Tools {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
}

fn locate(env_name: &str, bin: &str) -> PathBuf {
    if let Some(v) = std::env::var_os(env_name).filter(|v| !v.is_empty()) {
        return PathBuf::from(v);
    }
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    {
        let sibling = dir.join(bin);
        if sibling.is_file() {
            return sibling;
        }
    }
    PathBuf::from(bin)
}

impl Tools {
    /// `MW_FFMPEG`/`MW_FFPROBE`, sonst neben der ausführbaren Datei, sonst `PATH`.
    pub fn from_env() -> Tools {
        Tools {
            ffmpeg: locate("MW_FFMPEG", "ffmpeg"),
            ffprobe: locate("MW_FFPROBE", "ffprobe"),
        }
    }

    /// Startet beide Programme mit `-version`.
    pub fn check(&self) -> Result<()> {
        for exe in [&self.ffmpeg, &self.ffprobe] {
            let st = Command::new(exe)
                .arg("-version")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map_err(|e| spawn_error(exe, e))?;
            if !st.success() {
                return Err(Error::ToolFailed {
                    code: st.code(),
                    stderr_tail: format!("{} -version", exe.display()),
                });
            }
        }
        Ok(())
    }
}

pub(crate) fn spawn_error(exe: &std::path::Path, e: io::Error) -> Error {
    if e.kind() == io::ErrorKind::NotFound {
        Error::ToolMissing(exe.display().to_string())
    } else {
        Error::Io(e)
    }
}
