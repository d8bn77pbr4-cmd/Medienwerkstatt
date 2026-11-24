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
///
/// Bei HDR wird zuerst verkleinert und erst dann in Gleitkomma tongemappt: Die `gbrpf32le`-Kette
/// auf 720p statt auf 4K-Vollbildern spart grob das Neunfache an Speicher und Rechenzeit.
pub fn proxy_args(input: &Path, output: &Path, info: &MediaInfo, encoder: &str) -> Vec<String> {
    let scale = if info.height > info.width {
        "scale=720:-2:flags=bicubic"
    } else {
        "scale=-2:720:flags=bicubic"
    };
    let vf = if info.hdr {
        format!("{scale},{HDR_CHAIN}")
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::probe::MediaKind;

    fn info(width: u32, height: u32, hdr: bool) -> MediaInfo {
        MediaInfo {
            kind: MediaKind::Video,
            duration_sec: 2.0,
            width,
            height,
            fps: Some(25.0),
            has_audio: false,
            hdr,
            video_codec: Some("hevc".into()),
            audio_codec: None,
            rotation: 0,
        }
    }

    fn vf(i: &MediaInfo) -> String {
        let a = proxy_args(Path::new("/in.mov"), Path::new("/out.mp4"), i, "libx264");
        let k = a.iter().position(|x| x == "-vf").unwrap();
        a[k + 1].clone()
    }

    #[test]
    fn hdr_scales_down_before_the_float_tonemap_chain() {
        let land = vf(&info(3840, 2160, true));
        assert!(land.starts_with("scale=-2:720:flags=bicubic,zscale=t=linear"), "{land}");
        assert!(land.ends_with("format=yuv420p"), "{land}");
        let port = vf(&info(2160, 3840, true));
        assert!(port.starts_with("scale=720:-2:flags=bicubic,zscale="), "{port}");
    }

    #[test]
    fn sdr_only_scales() {
        assert_eq!(vf(&info(1920, 1080, false)), "scale=-2:720:flags=bicubic");
        assert_eq!(vf(&info(1080, 1920, false)), "scale=720:-2:flags=bicubic");
    }
}
