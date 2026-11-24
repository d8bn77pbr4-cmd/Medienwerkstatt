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

const PROTOCOLS: [&str; 17] = [
    "http", "https", "rtmp", "rtmps", "rtsp", "tcp", "udp", "ftp", "srt", "tls", "crypto", "cache",
    "async", "subfile", "concat", "gopher", "unix",
];

/// Argument spricht ein Netzwerk- oder Hüllprotokoll an (`://`, `movie=`, `proto:` nach Trennzeichen).
/// Filterketten wie `afade=t=in:st=0:d=0.5` oder `concat=n=2:v=1:a=1` bleiben erlaubt.
fn is_network_arg(arg: &str) -> bool {
    let a = arg.to_ascii_lowercase();
    if a.contains("://") || a.contains("movie=") {
        return true;
    }
    let bytes = a.as_bytes();
    (0..bytes.len()).any(|i| {
        let boundary = i == 0 || matches!(bytes[i - 1], b'|' | b',' | b';' | b':' | b'=');
        boundary
            && (PROTOCOLS.iter().chain(["data"].iter()))
                .any(|p| a[i..].strip_prefix(p).is_some_and(|r| r.starts_with(':')))
    })
}

const FORBIDDEN_FORMATS: [&str; 7] = [
    "tee",
    "segment",
    "stream_segment",
    "ssegment",
    "hls",
    "dash",
    "image2",
];
/// Gemeinsame Positivliste (`ffmpeg-options.json`): Rust prüft damit die Argumente, die
/// TypeScript-Tests prüfen den Export-Aufbau gegen dieselbe Datei.
#[derive(serde::Deserialize)]
struct FfmpegOptions {
    flags: Vec<String>,
    #[serde(rename = "valueOptions")]
    value_options: Vec<String>,
}

static FFMPEG_OPTIONS: std::sync::LazyLock<FfmpegOptions> = std::sync::LazyLock::new(|| {
    serde_json::from_str(include_str!("../ffmpeg-options.json"))
        .expect("ffmpeg-options.json ist gültig")
});

/// Erlaubte ffmpeg-Optionen ohne Wert. Alles, was nicht hier oder in `ffmpeg_value_options`
/// steht, lehnt `validate_ffmpeg_args` ab (der Export-Aufbau muss hierin bleiben).
pub fn ffmpeg_flags() -> &'static [String] {
    &FFMPEG_OPTIONS.flags
}

/// Erlaubte ffmpeg-Optionen mit Wert (Grundname ohne `-`; ein Stromwähler wie `:v`, `:a:1`,
/// `:s:v:0` hinter dem Namen ist erlaubt).
pub fn ffmpeg_value_options() -> &'static [String] {
    &FFMPEG_OPTIONS.value_options
}

fn args_error(msg: String) -> CmdError {
    CmdError::new("invalid_args", msg)
}

/// Prüft ffmpeg-Argumente vor dem Start: kein Netzwerk-/Hüllprotokoll, keine dateischreibenden
/// Nebenoptionen oder Mehrfach-Ausgabeformate, und jede Ausgabe (Positionsargument) ist ein
/// absoluter Pfad unter einer der Wurzeln (mindestens eine Ausgabe).
pub fn validate_ffmpeg_args(roots: &[PathBuf], args: &[String]) -> CmdResult<()> {
    if let Some(bad) = args.iter().find(|a| is_network_arg(a)) {
        return Err(args_error(format!("Netzwerkzugriff nicht erlaubt: {bad}")));
    }
    let mut outputs = 0;
    let mut i = 0;
    while i < args.len() {
        let a = &args[i];
        if a.len() > 1 && a.starts_with('-') {
            let name = a.to_ascii_lowercase();
            if ffmpeg_flags().contains(&name) {
                i += 1;
                continue;
            }
            let base = name
                .strip_prefix('-')
                .and_then(|n| n.split(':').next())
                .unwrap_or_default();
            if name.starts_with("--") || !ffmpeg_value_options().iter().any(|o| o == base) {
                return Err(args_error(format!("Option nicht erlaubt: {a}")));
            }
            if base == "f" {
                if let Some(v) = args.get(i + 1) {
                    if FORBIDDEN_FORMATS.contains(&v.to_ascii_lowercase().as_str()) {
                        return Err(args_error(format!("Format nicht erlaubt: {v}")));
                    }
                }
            }
            i += 2;
        } else {
            if !roots.iter().any(|r| is_within(r, Path::new(a))) {
                return Err(CmdError::invalid_path(format!(
                    "Ausgabe außerhalb der Arbeitsordner: {a}"
                )));
            }
            outputs += 1;
            i += 1;
        }
    }
    if outputs == 0 {
        return Err(CmdError::invalid_path("Keine Ausgabedatei angegeben"));
    }
    Ok(())
}

/// Setzt vor jedes `-i` die Eingabe-Einschränkung `-protocol_whitelist file,pipe`
/// (zweite Verteidigungslinie gegen Netzwerk-Eingaben).
pub fn with_protocol_whitelist(args: &[String]) -> Vec<String> {
    let mut out = Vec::with_capacity(args.len() + 4);
    for a in args {
        if a == "-i" {
            out.extend(["-protocol_whitelist".to_string(), "file,pipe".to_string()]);
        }
        out.push(a.clone());
    }
    out
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
    const OUT: &str = "/Users/x/Movies/Medienwerkstatt/A01_X/Export/out.mp4";

    fn code(a: &[&str]) -> &'static str {
        validate_ffmpeg_args(&roots(), &args(a)).unwrap_err().code
    }

    #[test]
    fn ffmpeg_args_allow_realistic_export_and_lavfi() {
        let a = args(&[
            "-y", "-i", "/Users/x/Movies/Medienwerkstatt/A01_X/Medien/a.mov",
            "-f", "lavfi", "-i", "color=black:s=1920x1080:r=25:d=10",
            "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
            "-filter_complex",
            "[0:v]scale=1920:1080,lut3d=file=/Users/x/Movies/Medienwerkstatt/A01_X/Cache/x.cube[a];[1:v]null[b];[a][b]xfade=transition=fade:duration=1:offset=4[c];[c]overlay=enable='between(t,1,2)'[v];[0:a]afade=t=in:st=0:d=0.5[a1];[a1][2:a]amix=inputs=2[m];[v][m]concat=n=1:v=1:a=1[ov][oa]",
            "-map", "[ov]", "-map", "[oa]", "-c:v", "h264_videotoolbox", "-c:v", "libx264",
            "-r", "25", "-s", "1920x1080", "-shortest", OUT,
        ]);
        assert!(validate_ffmpeg_args(&roots(), &a).is_ok());
        let cache_out = args(&["-i", "x", "/Users/x/Library/Caches/Medienwerkstatt/t.mp4"]);
        assert!(validate_ffmpeg_args(&roots(), &cache_out).is_ok());
    }

    #[test]
    fn ffmpeg_args_reject_outside_or_missing_outputs() {
        for out in [
            "/Users/x/anything.mp4",
            "relativ.mp4",
            "/Users/x/Movies/Medienwerkstatt/../x.mp4",
            "-",
        ] {
            assert_eq!(code(&["-i", "a", out]), "invalid_path", "{out}");
        }
        assert_eq!(code(&["-i", "a"]), "invalid_path");
        assert_eq!(code(&[]), "invalid_path");
        // Jede Ausgabe zählt, nicht nur die letzte.
        assert_eq!(code(&["-i", "a", "/tmp/evil.mp4", OUT]), "invalid_path");
    }

    #[test]
    fn ffmpeg_args_reject_network_and_wrapper_inputs() {
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
            "concat:http://x/a|http://x/b",
            "concat:a|b",
            "subfile,,start,0:::http://x",
            "crypto:http://x",
            "crypto:file",
            "data:text/plain,x",
            "movie=http://x",
            "movie=/etc/x",
            "[0:v]x,amovie=/etc/x",
            "a=b:udp:x",
        ] {
            assert_eq!(code(&["-i", bad, OUT]), "invalid_args", "{bad}");
        }
        assert_eq!(
            code(&["-f", "lavfi", "-i", "movie=http://x", OUT]),
            "invalid_args"
        );
        assert_eq!(
            code(&["-filter_complex", "amovie=/etc/x", OUT]),
            "invalid_args"
        );
    }

    #[test]
    fn ffmpeg_args_reject_side_effect_options_and_formats() {
        assert_eq!(
            code(&["-i", "a", "-progress", "/tmp/x", OUT]),
            "invalid_args"
        );
        for o in [
            "-report",
            "-passlogfile",
            "-vstats_file",
            "-sdp_file",
            "-dump_attachment",
        ] {
            assert_eq!(code(&["-i", "a", o, "x", OUT]), "invalid_args", "{o}");
        }
        for f in [
            "tee",
            "segment",
            "stream_segment",
            "ssegment",
            "hls",
            "dash",
            "image2",
            "SEGMENT",
        ] {
            assert_eq!(code(&["-i", "a", "-f", f, OUT]), "invalid_args", "{f}");
        }
        assert!(validate_ffmpeg_args(&roots(), &args(&["-i", "a", "-f", "mp4", OUT])).is_ok());
    }

    #[test]
    fn ffmpeg_args_use_an_option_allowlist() {
        let o = "/Users/x/Movies/Medienwerkstatt/A01_X/Export/out.mp4";
        assert_eq!(
            code(&["-i", "a", "-re", "/tmp/evil.mp4", o]),
            "invalid_args"
        );
        for bad in [
            "-stats",
            "-vstats",
            "--progress",
            "-protocol_whitelist",
            "-foo",
            "-re",
        ] {
            let a: &[&str] = &["-i", "a", bad, "x", o];
            assert_eq!(code(a), "invalid_args", "{bad}");
        }
        assert_eq!(code(&["--progress", "x", o]), "invalid_args");
        assert_eq!(
            code(&["-protocol_whitelist", "http", "-i", "a", o]),
            "invalid_args"
        );
        let ok = args(&[
            "-i",
            "a",
            "-c:v",
            "h264_videotoolbox",
            "-allow_sw",
            "1",
            "-b:v",
            "10M",
            "-tag:v",
            "hvc1",
            "-metadata:s:v:0",
            "rotate=0",
            "-disposition:a:0",
            "default",
            "-frames:v",
            "1",
            "-q:v",
            "3",
            "-an",
            "-vn",
            "-sn",
            "-dn",
            "-n",
            "-hide_banner",
            "-nostdin",
            "-nostats",
            o,
        ]);
        assert!(validate_ffmpeg_args(&roots(), &ok).is_ok());
    }

    #[test]
    fn whitelist_is_inserted_before_every_input() {
        let a = with_protocol_whitelist(&args(&["-i", "a", "-f", "lavfi", "-i", "b", OUT]));
        assert_eq!(
            a,
            args(&[
                "-protocol_whitelist",
                "file,pipe",
                "-i",
                "a",
                "-f",
                "lavfi",
                "-protocol_whitelist",
                "file,pipe",
                "-i",
                "b",
                OUT
            ])
        );
    }

    #[test]
    fn unique_names_count_up() {
        let taken = ["a.mov", "a (2).mov"];
        assert_eq!(unique_name(|n| taken.contains(&n), "a.mov"), "a (3).mov");
        assert_eq!(unique_name(|n| taken.contains(&n), "b.mov"), "b.mov");
        assert_eq!(unique_name(|n| n == "x", "x"), "x (2)");
    }
}
