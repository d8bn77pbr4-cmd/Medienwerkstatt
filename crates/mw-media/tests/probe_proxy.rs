use mw_media::{
    default_h264_encoder, probe, proxy_args, read_with_backup, run_ffmpeg, write_atomic, MediaKind,
    Tools,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Once;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn fixture(name: &str) -> PathBuf {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let status = Command::new("bash")
            .arg("scripts/make-fixtures.sh")
            .current_dir(repo_root())
            .status()
            .expect("bash startet");
        assert!(status.success(), "make-fixtures.sh fehlgeschlagen");
    });
    repo_root().join("tests/fixtures/media").join(name)
}

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("mw-media-test-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn probe_normal_clip() {
    let t = Tools::from_env();
    let i = probe(&t, &fixture("clip-25p.mp4")).unwrap();
    assert_eq!(i.kind, MediaKind::Video);
    assert_eq!((i.width, i.height), (1920, 1080));
    assert!((i.fps.unwrap() - 25.0).abs() < 1e-6);
    assert!((i.duration_sec - 5.0).abs() < 0.1);
    assert!(i.has_audio && !i.hdr && i.rotation == 0);
    let j = probe(&t, &fixture("clip-30p.mp4")).unwrap();
    assert!((j.fps.unwrap() - 29.97).abs() < 0.01);
}

#[test]
fn probe_rotated_reports_displayed_size() {
    let i = probe(&Tools::from_env(), &fixture("hochformat-rotiert.mov")).unwrap();
    assert_eq!((i.width, i.height), (1080, 1920));
    assert!(
        i.rotation.abs() == 90 || i.rotation == 270,
        "{}",
        i.rotation
    );
}

#[test]
fn probe_hdr_and_silent_and_audio() {
    let t = Tools::from_env();
    assert!(probe(&t, &fixture("hdr-hlg.mov")).unwrap().hdr);
    let s = probe(&t, &fixture("stumm.mp4")).unwrap();
    assert!(!s.has_audio && s.audio_codec.is_none());
    let a = probe(&t, &fixture("zu-laut.wav")).unwrap();
    assert_eq!(a.kind, MediaKind::Audio);
    assert!(a.fps.is_none() && a.video_codec.is_none() && a.has_audio);
}

#[test]
fn probe_missing_file_is_error() {
    assert!(probe(&Tools::from_env(), Path::new("/nicht/da.mp4")).is_err());
}

#[test]
fn tools_check_ok_and_missing() {
    assert!(Tools::from_env().check().is_ok());
    let bad = Tools {
        ffmpeg: "/nope/ffmpeg".into(),
        ffprobe: "/nope/ffprobe".into(),
    };
    assert!(matches!(bad.check(), Err(mw_media::Error::ToolMissing(_))));
}

#[test]
fn proxy_from_hdr_is_sdr_720() {
    let t = Tools::from_env();
    let dir = tmp("hdr");
    let out = dir.join("p.mp4");
    let info = probe(&t, &fixture("hdr-hlg.mov")).unwrap();
    let args = proxy_args(&fixture("hdr-hlg.mov"), &out, &info, "libx264");
    run_ffmpeg(&t, &args, info.duration_sec, |_| {}).unwrap();
    let p = probe(&t, &out).unwrap();
    assert!(!p.hdr);
    assert_eq!(p.height, 720);
}

#[test]
fn proxy_from_rotated_is_upright_portrait() {
    let t = Tools::from_env();
    let dir = tmp("rot");
    let out = dir.join("p.mp4");
    let src = fixture("hochformat-rotiert.mov");
    let info = probe(&t, &src).unwrap();
    run_ffmpeg(
        &t,
        &proxy_args(&src, &out, &info, "libx264"),
        info.duration_sec,
        |_| {},
    )
    .unwrap();
    let p = probe(&t, &out).unwrap();
    assert_eq!((p.width, p.height), (720, 1280));
    assert_eq!(p.rotation, 0);
}

#[test]
fn proxy_with_umlaut_and_spaces_path() {
    let t = Tools::from_env();
    let dir = tmp("umlaut dir ä");
    let out = dir.join("Bäckerei Proxy 1.mp4");
    let src = fixture("Bäckerei Clip 1.mov");
    let info = probe(&t, &src).unwrap();
    run_ffmpeg(
        &t,
        &proxy_args(&src, &out, &info, default_h264_encoder()),
        info.duration_sec,
        |_| {},
    )
    .unwrap();
    let p = probe(&t, &out).unwrap();
    assert_eq!(p.height, 720);
    assert!(p.has_audio);
}

#[test]
fn write_atomic_keeps_ten_backups() {
    let dir = tmp("bak");
    let f = dir.join("state.json");
    for i in 0..12 {
        write_atomic(&f, format!("v{i}").as_bytes(), 10).unwrap();
    }
    assert_eq!(fs::read_to_string(&f).unwrap(), "v11");
    for n in 1..=10 {
        let b = dir.join(format!("state.json.bak{n}"));
        assert_eq!(
            fs::read_to_string(&b).unwrap(),
            format!("v{}", 11 - n),
            "bak{n}"
        );
    }
    assert!(!dir.join("state.json.bak11").exists());
    let leftovers: Vec<_> = fs::read_dir(&dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().contains(".tmp-"))
        .collect();
    assert!(leftovers.is_empty());
}

#[test]
fn read_with_backup_restores_from_bak1() {
    let dir = tmp("restore");
    let f = dir.join("projekt.mwp");
    write_atomic(&f, b"{\"ok\":1}", 10).unwrap();
    write_atomic(&f, b"{\"ok\":2}", 10).unwrap();
    fs::write(&f, b"{kaputt").unwrap();
    let valid = |b: &[u8]| serde_json::from_slice::<serde_json::Value>(b).is_ok();
    let (bytes, restored) = read_with_backup(&f, valid).unwrap();
    assert!(restored);
    assert_eq!(bytes, b"{\"ok\":1}");
    // intakte Hauptdatei: nicht restored
    write_atomic(&f, b"{\"ok\":3}", 10).unwrap();
    let (bytes, restored) = read_with_backup(&f, valid).unwrap();
    assert!(!restored);
    assert_eq!(bytes, b"{\"ok\":3}");
}

#[test]
fn read_with_backup_nothing_valid_is_not_found() {
    let dir = tmp("none");
    let f = dir.join("x.json");
    fs::write(&f, b"muell").unwrap();
    let e = read_with_backup(&f, |_| false).unwrap_err();
    assert_eq!(e.kind(), std::io::ErrorKind::NotFound);
}

#[test]
fn run_ffmpeg_progress_is_monotonic_and_completes() {
    let t = Tools::from_env();
    let dir = tmp("prog");
    let out = dir.join("o.mp4");
    let src = fixture("clip-25p.mp4");
    let args: Vec<String> = [
        "-i",
        src.to_str().unwrap(),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-an",
        out.to_str().unwrap(),
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    let mut seen = Vec::new();
    run_ffmpeg(&t, &args, 5.0, |p| seen.push(p)).unwrap();
    assert!(!seen.is_empty());
    assert!(seen.windows(2).all(|w| w[1] >= w[0]), "{seen:?}");
    assert!(*seen.last().unwrap() >= 0.99);
    assert!(seen.iter().all(|p| (0.0..=1.0).contains(p)));
}

#[test]
fn run_ffmpeg_failure_has_stderr_tail() {
    let t = Tools::from_env();
    let args: Vec<String> = ["-i", "/nicht/da.mp4", "/tmp/x.mp4"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    match run_ffmpeg(&t, &args, 1.0, |_| {}) {
        Err(mw_media::Error::ToolFailed { code, stderr_tail }) => {
            assert_ne!(code, Some(0));
            assert!(stderr_tail.contains("nicht/da.mp4"), "{stderr_tail}");
        }
        other => panic!("{other:?}"),
    }
}
