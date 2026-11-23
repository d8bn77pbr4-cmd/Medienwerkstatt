//! Medien-Eigenschaften über ffprobe.

use crate::error::{Error, Result};
use crate::tools::{spawn_error, Tools};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Video,
    Audio,
    Image,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub kind: MediaKind,
    pub duration_sec: f64,
    /// Angezeigte Breite (nach Rotation).
    pub width: u32,
    /// Angezeigte Höhe (nach Rotation).
    pub height: u32,
    pub fps: Option<f64>,
    pub has_audio: bool,
    /// Transfer `smpte2084` (PQ) oder `arib-std-b67` (HLG).
    pub hdr: bool,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub rotation: i32,
}

/// Liest die Eigenschaften einer Datei mit ffprobe.
pub fn probe(t: &Tools, file: &Path) -> Result<MediaInfo> {
    let out = Command::new(&t.ffprobe)
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            "-i",
        ])
        .arg(file)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| spawn_error(&t.ffprobe, e))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let tail: Vec<&str> = err.lines().rev().take(20).collect();
        let stderr_tail = tail.into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(Error::ToolFailed {
            code: out.status.code(),
            stderr_tail,
        });
    }
    parse_probe(&String::from_utf8_lossy(&out.stdout))
}

fn parse_rate(s: &str) -> Option<f64> {
    let (n, d) = match s.split_once('/') {
        Some((n, d)) => (n.trim().parse::<f64>().ok()?, d.trim().parse::<f64>().ok()?),
        None => (s.trim().parse::<f64>().ok()?, 1.0),
    };
    if d == 0.0 || n <= 0.0 {
        None
    } else {
        Some(n / d)
    }
}

fn str_of<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

fn num_of(v: &Value, key: &str) -> Option<f64> {
    match v.get(key)? {
        Value::String(s) => s.parse().ok(),
        other => other.as_f64(),
    }
}

fn rotation_of(stream: &Value) -> i32 {
    if let Some(list) = stream.get("side_data_list").and_then(Value::as_array) {
        for sd in list {
            if let Some(r) = sd.get("rotation").and_then(Value::as_f64) {
                return r.round() as i32;
            }
        }
    }
    stream
        .get("tags")
        .and_then(|t| str_of(t, "rotate"))
        .and_then(|s| s.trim().parse::<f64>().ok())
        .map(|r| r.round() as i32)
        .unwrap_or(0)
}

/// Wertet die ffprobe-JSON-Ausgabe aus.
pub(crate) fn parse_probe(json: &str) -> Result<MediaInfo> {
    let v: Value = serde_json::from_str(json).map_err(|e| Error::Parse(e.to_string()))?;
    let streams = v
        .get("streams")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let is_type = |s: &Value, ty: &str| str_of(s, "codec_type") == Some(ty);
    let attached = |s: &Value| {
        s.get("disposition")
            .and_then(|d| d.get("attached_pic"))
            .and_then(Value::as_i64)
            == Some(1)
    };
    let video = streams.iter().find(|s| is_type(s, "video") && !attached(s));
    let audio = streams.iter().find(|s| is_type(s, "audio"));
    let format = v.get("format").cloned().unwrap_or(Value::Null);
    let format_name = str_of(&format, "format_name").unwrap_or("");

    if video.is_none() && audio.is_none() {
        return Err(Error::Parse("weder Bild- noch Tonspur gefunden".into()));
    }

    let duration_sec = num_of(&format, "duration")
        .or_else(|| video.and_then(|s| num_of(s, "duration")))
        .or_else(|| audio.and_then(|s| num_of(s, "duration")))
        .unwrap_or(0.0);

    let mut info = MediaInfo {
        kind: MediaKind::Audio,
        duration_sec,
        width: 0,
        height: 0,
        fps: None,
        has_audio: audio.is_some(),
        hdr: false,
        video_codec: None,
        audio_codec: audio
            .and_then(|s| str_of(s, "codec_name"))
            .map(String::from),
        rotation: 0,
    };

    if let Some(vs) = video {
        let w = num_of(vs, "width").unwrap_or(0.0) as u32;
        let h = num_of(vs, "height").unwrap_or(0.0) as u32;
        let rotation = rotation_of(vs);
        let swap = rotation.rem_euclid(180) == 90;
        (info.width, info.height) = if swap { (h, w) } else { (w, h) };
        info.rotation = rotation;
        info.video_codec = str_of(vs, "codec_name").map(String::from);
        info.hdr = matches!(
            str_of(vs, "color_transfer"),
            Some("smpte2084" | "arib-std-b67")
        );
        let nb_frames = num_of(vs, "nb_frames");
        let image_format = format_name.starts_with("image2")
            || format_name.contains("_pipe")
            || matches!(format_name, "gif_pipe" | "webp_pipe");
        let is_image = image_format && audio.is_none() && (nb_frames.is_none_or(|n| n <= 1.0));
        if is_image {
            info.kind = MediaKind::Image;
        } else {
            info.kind = MediaKind::Video;
            info.fps = str_of(vs, "avg_frame_rate")
                .and_then(parse_rate)
                .or_else(|| str_of(vs, "r_frame_rate").and_then(parse_rate));
        }
    }
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotation_from_display_matrix_swaps_size() {
        let j = r#"{"streams":[{"codec_type":"video","codec_name":"hevc","width":1920,"height":1080,
          "avg_frame_rate":"30000/1001","color_transfer":"arib-std-b67",
          "side_data_list":[{"side_data_type":"Display Matrix","rotation":-90}]},
          {"codec_type":"audio","codec_name":"aac"}],"format":{"format_name":"mov,mp4","duration":"4.5"}}"#;
        let i = parse_probe(j).unwrap();
        assert_eq!((i.width, i.height, i.rotation), (1080, 1920, -90));
        assert!(i.hdr && i.has_audio);
        assert!((i.fps.unwrap() - 29.97002997).abs() < 1e-6);
        assert_eq!(i.duration_sec, 4.5);
    }

    #[test]
    fn rotation_from_legacy_tag_and_270() {
        let j = r#"{"streams":[{"codec_type":"video","width":1280,"height":720,"avg_frame_rate":"25/1","tags":{"rotate":"270"}}],
          "format":{"format_name":"mov,mp4","duration":"1"}}"#;
        let i = parse_probe(j).unwrap();
        assert_eq!((i.width, i.height, i.rotation), (720, 1280, 270));
        let j180 = j.replace("270", "180");
        let i = parse_probe(&j180).unwrap();
        assert_eq!((i.width, i.height), (1280, 720));
    }

    #[test]
    fn fps_falls_back_to_r_frame_rate() {
        let j = r#"{"streams":[{"codec_type":"video","width":4,"height":4,"avg_frame_rate":"0/0","r_frame_rate":"24/1"}],
          "format":{"format_name":"matroska,webm","duration":"1"}}"#;
        assert_eq!(parse_probe(j).unwrap().fps, Some(24.0));
    }

    #[test]
    fn single_frame_png_is_image() {
        let j = r#"{"streams":[{"codec_type":"video","codec_name":"png","width":10,"height":20,"avg_frame_rate":"25/1","nb_frames":"1"}],
          "format":{"format_name":"png_pipe"}}"#;
        let i = parse_probe(j).unwrap();
        assert_eq!(i.kind, MediaKind::Image);
        assert!(i.fps.is_none());
        assert_eq!(i.duration_sec, 0.0);
    }

    #[test]
    fn cover_art_does_not_make_audio_a_video() {
        let j = r#"{"streams":[{"codec_type":"audio","codec_name":"mp3"},
          {"codec_type":"video","codec_name":"mjpeg","width":5,"height":5,"disposition":{"attached_pic":1}}],
          "format":{"format_name":"mp3","duration":"3"}}"#;
        let i = parse_probe(j).unwrap();
        assert_eq!(i.kind, MediaKind::Audio);
        assert!(i.video_codec.is_none());
    }

    #[test]
    fn kind_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&MediaKind::Video).unwrap(),
            "\"video\""
        );
    }
}
