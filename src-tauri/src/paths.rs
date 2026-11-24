//! Reine Pfadprüfungen (ohne Dateizugriff, daher einfach zu testen).

use crate::error::{CmdError, CmdResult};
use std::path::{Component, Path, PathBuf};

/// Unterordner eines Projekts.
pub const PROJECT_SUBDIRS: [&str; 5] = ["Medien", "Proxies", "Cache", "Export", "Recherche"];

fn has_parent_component(p: &Path) -> bool {
    p.components().any(|c| matches!(c, Component::ParentDir))
}

/// Projektordnername: ein Name, kein Pfad (`/`, `\`, `..`, führender Punkt, NUL verboten).
pub fn validate_folder(folder: &str) -> CmdResult<()> {
    if folder.is_empty()
        || folder.contains(['/', '\\', '\0'])
        || folder.contains("..")
        || folder.starts_with('.')
    {
        return Err(CmdError::invalid_path(format!(
            "Ungültiger Ordnername: {folder}"
        )));
    }
    Ok(())
}

/// Relativer Pfad innerhalb eines Projekts: nicht absolut, kein `..`.
pub fn validate_rel(rel: &str) -> CmdResult<PathBuf> {
    let p = Path::new(rel);
    if rel.is_empty() || rel.contains('\0') || p.is_absolute() || has_parent_component(p) {
        return Err(CmdError::invalid_path(format!("Ungültiger Pfad: {rel}")));
    }
    Ok(p.to_path_buf())
}

/// Einfache Kennung (Dateiname ohne Endung): Buchstaben, Ziffern, `-`, `_`.
pub fn validate_id(id: &str) -> CmdResult<()> {
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(CmdError::invalid_path(format!("Ungültige Kennung: {id}")));
    }
    Ok(())
}

/// `p` ist absolut, enthält kein `..` und liegt unter `root`.
pub fn is_within(root: &Path, p: &Path) -> bool {
    p.is_absolute() && !has_parent_component(p) && p.starts_with(root)
}

/// Prüft, dass `dir` ein Ordner unter der Projektwurzel ist.
pub fn validate_project_dir(root: &Path, dir: &str) -> CmdResult<PathBuf> {
    let p = PathBuf::from(dir);
    if !is_within(root, &p) {
        return Err(CmdError::invalid_path(format!("Kein Projektordner: {dir}")));
    }
    Ok(p)
}

fn is_network_arg(arg: &str) -> bool {
    let a = arg.trim_start().to_ascii_lowercase();
    let scheme_url = a.split_once("://").is_some_and(|(scheme, _)| {
        scheme
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic())
            && scheme
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
    });
    scheme_url
        || [
            "http:", "https:", "rtmp:", "rtsp:", "tcp:", "udp:", "ftp:", "srt:", "tls:",
        ]
        .iter()
        .any(|p| a.starts_with(p))
}

/// Prüft ffmpeg-Argumente vor dem Start: kein Netzwerkprotokoll in irgendeinem Argument,
/// und das letzte Argument (Ausgabedatei) ist ein absoluter Pfad unter einer der Wurzeln.
pub fn validate_ffmpeg_args(roots: &[PathBuf], args: &[String]) -> CmdResult<()> {
    if let Some(bad) = args.iter().find(|a| is_network_arg(a)) {
        return Err(CmdError::new(
            "invalid_args",
            format!("Netzwerkzugriff nicht erlaubt: {bad}"),
        ));
    }
    let out = args
        .last()
        .ok_or_else(|| CmdError::invalid_path("Keine Ausgabedatei angegeben"))?;
    if !roots.iter().any(|r| is_within(r, Path::new(out))) {
        return Err(CmdError::invalid_path(format!(
            "Ausgabe außerhalb der Arbeitsordner: {out}"
        )));
    }
    Ok(())
}

/// Freier Zielname in `dir`: `name`, sonst `name (2).ext`, `name (3).ext` …
pub fn unique_name(exists: impl Fn(&str) -> bool, file_name: &str) -> String {
    if !exists(file_name) {
        return file_name.to_string();
    }
    let p = Path::new(file_name);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or(file_name);
    let ext = p.extension().and_then(|s| s.to_str());
    (2..)
        .map(|n| match ext {
            Some(e) => format!("{stem} ({n}).{e}"),
            None => format!("{stem} ({n})"),
        })
        .find(|c| !exists(c))
        .expect("endlose Folge")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_names_reject_paths_and_dots() {
        assert!(validate_folder("A07_Baeckerei-Korn").is_ok());
        for bad in ["", "..", "a/b", "a\\b", ".versteckt", "a..b", "/abs"] {
            assert_eq!(
                validate_folder(bad).unwrap_err().code,
                "invalid_path",
                "{bad}"
            );
        }
    }

    #[test]
    fn rel_paths_reject_absolute_and_parent() {
        assert!(validate_rel("Recherche/notiz.txt").is_ok());
        for bad in ["/etc/passwd", "../x", "a/../../x", "a/..", ""] {
            assert_eq!(validate_rel(bad).unwrap_err().code, "invalid_path", "{bad}");
        }
    }

    #[test]
    fn ids_are_simple() {
        assert!(validate_id("3f2a-b_1").is_ok());
        assert!(validate_id("../x").is_err());
        assert!(validate_id("a/b").is_err());
        assert!(validate_id("").is_err());
    }

    #[test]
    fn project_dir_must_be_under_root() {
        let root = Path::new("/home/u/Movies/Medienwerkstatt");
        assert!(validate_project_dir(root, "/home/u/Movies/Medienwerkstatt/A01_X").is_ok());
        assert!(validate_project_dir(root, "/home/u/Movies/Medienwerkstatt/../x").is_err());
        assert!(validate_project_dir(root, "/etc").is_err());
        assert!(validate_project_dir(root, "relativ").is_err());
        assert!(validate_project_dir(root, "/home/u/Movies/MedienwerkstattX/a").is_err());
    }

    fn args(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }
    fn roots() -> Vec<PathBuf> {
        vec![
            PathBuf::from("/Users/x/Movies/Medienwerkstatt"),
            PathBuf::from("/Users/x/Library/Caches/Medienwerkstatt"),
        ]
    }

    #[test]
    fn ffmpeg_args_allow_realistic_export_and_lavfi() {
        let a = args(&[
            "-i",
            "/Users/x/Movies/Medienwerkstatt/A01_X/Medien/a.mov",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=1920x1080:r=25",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=stereo",
            "-filter_complex",
            "[0:v]scale=1920:-2,lut3d=file=/Users/x/Movies/Medienwerkstatt/A01_X/Cache/x.cube[v]",
            "-c:v",
            "libx264",
            "/Users/x/Movies/Medienwerkstatt/A01_X/Export/out.mp4",
        ]);
        assert!(validate_ffmpeg_args(&roots(), &a).is_ok());
        let cache_out = args(&["-i", "x", "/Users/x/Library/Caches/Medienwerkstatt/t.mp4"]);
        assert!(validate_ffmpeg_args(&roots(), &cache_out).is_ok());
    }

    #[test]
    fn ffmpeg_args_reject_outside_output() {
        for out in [
            "/Users/x/anything.mp4",
            "relativ.mp4",
            "/Users/x/Movies/Medienwerkstatt/../x.mp4",
        ] {
            let e = validate_ffmpeg_args(&roots(), &args(&["-i", "a", out])).unwrap_err();
            assert_eq!(e.code, "invalid_path", "{out}");
        }
        assert_eq!(
            validate_ffmpeg_args(&roots(), &[]).unwrap_err().code,
            "invalid_path"
        );
    }

    #[test]
    fn ffmpeg_args_reject_network_inputs() {
        let ok_out = "/Users/x/Movies/Medienwerkstatt/A/Export/o.mp4";
        for bad in [
            "http://x",
            "https://x/y",
            "rtmp://x",
            "RTSP://x",
            "tcp:x",
            "udp:1.2.3.4:5",
            "ftp://h",
            "srt://h",
            "tls:h",
            "gopher://h",
        ] {
            let e = validate_ffmpeg_args(&roots(), &args(&["-i", bad, ok_out])).unwrap_err();
            assert_eq!(e.code, "invalid_args", "{bad}");
        }
    }

    #[test]
    fn unique_names_count_up() {
        let taken = ["a.mov", "a (2).mov"];
        assert_eq!(unique_name(|n| taken.contains(&n), "a.mov"), "a (3).mov");
        assert_eq!(unique_name(|n| taken.contains(&n), "b.mov"), "b.mov");
        assert_eq!(unique_name(|n| n == "x", "x"), "x (2)");
    }
}
