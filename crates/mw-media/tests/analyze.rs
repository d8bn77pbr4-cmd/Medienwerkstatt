use mw_media::{analyze, extract_frames, Measurements, Segment, Tools};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Once;

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("mw-analyze-test-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

fn ffmpeg(args: &[&str]) {
    let out = Command::new("ffmpeg")
        .args(["-hide_banner", "-nostdin", "-y", "-v", "error"])
        .args(args)
        .output()
        .expect("ffmpeg startet");
    assert!(
        out.status.success(),
        "ffmpeg: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

/// 3 s normal + 1 s Schwarz + 3 s überbelichtet, Ton 0 dBFS (PCM, exakte Pegel).
fn export_fixture() -> &'static Path {
    static ONCE: Once = Once::new();
    static DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
    let dir = DIR.get_or_init(|| tmp("fixtures"));
    ONCE.call_once(|| {
        let out = dir.join("export.mov");
        let silent = dir.join("stumm.mp4");
        ffmpeg(&[
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=320x240:r=25:d=3",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=320x240:r=25:d=1",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=320x240:r=25:d=3,eq=brightness=0.6",
            "-f",
            "lavfi",
            "-i",
            "aevalsrc=sin(2*PI*440*t):s=48000:d=7",
            "-filter_complex",
            "[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p[v]",
            "-map",
            "[v]",
            "-map",
            "3:a",
            "-c:v",
            "libx264",
            "-c:a",
            "pcm_s16le",
            out.to_str().unwrap(),
        ]);
        ffmpeg(&[
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=320x240:r=25:d=2",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            silent.to_str().unwrap(),
        ]);
    });
    dir
}

fn export_file() -> PathBuf {
    export_fixture().join("export.mov")
}

#[test]
fn measures_export_fixture() {
    let t = Tools::from_env();
    let seg = [Segment {
        start: 4.0,
        end: 7.0,
    }];
    let m = analyze(&t, &export_file(), &seg).unwrap();

    assert_eq!((m.format.width, m.format.height), (320, 240));
    assert!((m.format.fps - 25.0).abs() < 0.01);
    assert!((m.format.duration_sec - 7.0).abs() < 0.1);
    assert_eq!(m.format.audio_codec.as_deref(), Some("pcm_s16le"));

    assert!(m.audio.true_peak_dbtp.unwrap() > -1.0, "{:?}", m.audio);
    assert!(m.audio.clipped_samples > 0);
    assert!(m.audio.integrated_lufs.is_some());
    assert!(m.audio.silences.is_empty());

    assert_eq!(m.video.black.len(), 1, "{:?}", m.video.black);
    let b = &m.video.black[0];
    assert!(
        (b.start - 3.0).abs() <= 0.25 && (b.end - 4.0).abs() <= 0.25,
        "{b:?}"
    );

    assert_eq!(m.video.segments.len(), 1);
    let s = &m.video.segments[0];
    assert_eq!((s.start, s.end), (4.0, 7.0));
    assert!(s.highlights_pct > 5.0, "{s:?}");
    assert!(s.mean_luma > 0.0 && s.mean_luma <= 1.0);

    let cuts = &m.video.detected_cuts;
    assert!(
        cuts.iter().any(|c| (c - 3.0).abs() <= 0.25)
            && cuts.iter().any(|c| (c - 4.0).abs() <= 0.25),
        "{cuts:?}"
    );
}

#[test]
fn empty_segments_means_whole_file() {
    let m = analyze(&Tools::from_env(), &export_file(), &[]).unwrap();
    assert_eq!(m.video.segments.len(), 1);
    assert_eq!(m.video.segments[0].start, 0.0);
    assert!((m.video.segments[0].end - 7.0).abs() < 0.1);
}

#[test]
fn file_without_audio_reports_null_loudness() {
    let f = export_fixture().join("stumm.mp4");
    let m = analyze(&Tools::from_env(), &f, &[]).unwrap();
    assert_eq!(m.audio.integrated_lufs, None);
    assert_eq!(m.audio.true_peak_dbtp, None);
    assert_eq!(m.audio.clipped_samples, 0);
    assert!(m.audio.silences.is_empty());
    assert_eq!(m.format.audio_codec, None);
    let json = serde_json::to_value(&m).unwrap();
    assert!(json["audio"]["integratedLufs"].is_null());
    assert!(json["audio"]["truePeakDbtp"].is_null());
}

#[test]
fn digital_silence_reports_null_and_silence_interval() {
    let f = export_fixture().join("leise.wav");
    ffmpeg(&[
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=48000:cl=stereo",
        "-t",
        "3",
        f.to_str().unwrap(),
    ]);
    let m = analyze(&Tools::from_env(), &f, &[]).unwrap();
    assert_eq!(m.audio.integrated_lufs, None);
    assert_eq!(m.audio.true_peak_dbtp, None);
    assert_eq!(m.audio.silences.len(), 1, "{:?}", m.audio.silences);
    assert!(m.audio.silences[0].start.abs() < 0.1 && (m.audio.silences[0].end - 3.0).abs() < 0.1);
    assert!(m.video.segments.iter().all(|s| s.mean_luma == 0.0));
}

#[test]
fn extract_frames_writes_small_jpegs() {
    let t = Tools::from_env();
    let out = tmp("frames").join("neu/unterordner");
    let paths = extract_frames(&t, &export_file(), &[0.5, 2.5], 160, &out).unwrap();
    assert_eq!(paths.len(), 2);
    assert!(paths[0]
        .file_name()
        .unwrap()
        .to_str()
        .unwrap()
        .starts_with("frame-0-500"));
    assert!(paths[1]
        .file_name()
        .unwrap()
        .to_str()
        .unwrap()
        .starts_with("frame-1-2500"));
    for p in &paths {
        assert!(p.is_file() && p.extension().unwrap() == "jpg");
        let info = mw_media::probe(&t, p).unwrap();
        assert!(info.width <= 160 && info.width > 0, "{}", info.width);
    }
    let wide = extract_frames(&t, &export_file(), &[1.0], 768, &tmp("frames2")).unwrap();
    let info = mw_media::probe(&t, &wide[0]).unwrap();
    assert_eq!(info.width, 320, "nicht hochskalieren");
}

#[test]
fn measurements_json_uses_exact_camel_case_keys() {
    let m: Measurements = serde_json::from_value(serde_json::json!({
        "format": {"width": 1, "height": 2, "fps": 25.0, "durationSec": 3.0, "videoCodec": "h264", "audioCodec": null},
        "audio": {"integratedLufs": null, "truePeakDbtp": -1.5, "clippedSamples": 4, "silences": [{"start": 0.0, "end": 1.0}]},
        "video": {"black": [], "freeze": [], "detectedCuts": [3.0], "segments": [
            {"start": 0.0, "end": 1.0, "meanLuma": 0.5, "highlightsPct": 1.0, "shadowsPct": 2.0, "meanU": 0.0, "meanV": 0.1}]}
    }))
    .unwrap();
    let v = serde_json::to_value(&m).unwrap();
    let keys = |p: &str| -> Vec<String> {
        let mut k: Vec<String> = v
            .pointer(p)
            .unwrap()
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        k.sort();
        k
    };
    assert_eq!(keys(""), ["audio", "format", "video"]);
    assert_eq!(
        keys("/format"),
        [
            "audioCodec",
            "durationSec",
            "fps",
            "height",
            "videoCodec",
            "width"
        ]
    );
    assert_eq!(
        keys("/audio"),
        [
            "clippedSamples",
            "integratedLufs",
            "silences",
            "truePeakDbtp"
        ]
    );
    assert_eq!(
        keys("/video"),
        ["black", "detectedCuts", "freeze", "segments"]
    );
    assert_eq!(
        keys("/video/segments/0"),
        [
            "end",
            "highlightsPct",
            "meanLuma",
            "meanU",
            "meanV",
            "shadowsPct",
            "start"
        ]
    );
    assert_eq!(keys("/audio/silences/0"), ["end", "start"]);
    assert!(v["format"]["audioCodec"].is_null());
}
