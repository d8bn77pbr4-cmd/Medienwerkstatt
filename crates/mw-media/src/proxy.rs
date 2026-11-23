//! ffmpeg-Argumente für 720p-Proxies.

use crate::probe::MediaInfo;
use std::path::Path;

const HDR_CHAIN: &str = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";

/// `h264_videotoolbox` auf macOS, sonst `libx264`.
pub fn default_h264_encoder() -> &'static str {
    if cfg!(target_os = "macos") {
        "h264_videotoolbox"
    } else {
        "libx264"
    }
}

/// Argumente (ohne globale Optionen) für einen aufrechten 720p-SDR-Proxy.
pub fn proxy_args(input: &Path, output: &Path, info: &MediaInfo, encoder: &str) -> Vec<String> {
    let scale = if info.height > info.width {
        "scale=720:-2"
    } else {
        "scale=-2:720"
    };
    let vf = if info.hdr {
        format!("{HDR_CHAIN},{scale}")
    } else {
        scale.to_string()
    };
    let mut a: Vec<String> = Vec::new();
    let mut push = |s: &str| a.push(s.to_string());
    push("-i");
    a.push(input.to_string_lossy().into_owned());
    let mut push = |s: &str| a.push(s.to_string());
    push("-map");
    push("0:v:0");
    if info.has_audio {
        push("-map");
        push("0:a:0?");
    }
    push("-vf");
    push(&vf);
    push("-c:v");
    push(encoder);
    push("-g");
    push("12");
    match encoder {
        "libx264" => {
            for s in ["-preset", "veryfast", "-crf", "23"] {
                push(s);
            }
        }
        "h264_videotoolbox" => {
            push("-b:v");
            push("5M");
        }
        _ => {}
    }
    push("-pix_fmt");
    push("yuv420p");
    if info.has_audio {
        for s in ["-c:a", "aac", "-b:a", "160k", "-ar", "48000"] {
            push(s);
        }
    } else {
        push("-an");
    }
    push("-movflags");
    push("+faststart");
    a.push(output.to_string_lossy().into_owned());
    a
}
