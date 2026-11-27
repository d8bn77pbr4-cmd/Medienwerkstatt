//! Tauri-Befehle, 1:1 zu den Methoden des TypeScript-Interfaces `Backend`.

use crate::error::{CmdError, CmdResult};
use crate::versions::{self, VersionInfo};
use crate::{keychain, paths};
use base64::Engine;
use mw_media::{
    analyze as mw_analyze, default_h264_encoder, extract_frames as mw_extract_frames, gemini,
    probe, proxy_args, read_with_backup, run_ffmpeg as mw_run_ffmpeg, write_atomic, Measurements,
    MediaInfo, Segment, Tools,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

const BACKUPS: usize = 10;
const PROJECT_FILE: &str = "projekt.mwp";

// ---------- Hilfen ----------

async fn blocking<T, F>(f: F) -> CmdResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> CmdResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| CmdError::io(format!("Hintergrundaufgabe abgebrochen: {e}")))?
}

fn projects_root(app: &AppHandle) -> CmdResult<PathBuf> {
    Ok(app.path().video_dir()?.join("Medienwerkstatt"))
}

fn cache_root(app: &AppHandle) -> CmdResult<PathBuf> {
    Ok(app.path().cache_dir()?.join("Medienwerkstatt"))
}

fn state_path(app: &AppHandle) -> CmdResult<PathBuf> {
    Ok(app
        .path()
        .data_dir()?
        .join("Medienwerkstatt")
        .join("state.json"))
}

fn project_dir_checked(app: &AppHandle, dir: &str) -> CmdResult<PathBuf> {
    paths::validate_project_dir(&projects_root(app)?, dir)
}

/// Erlaubt dem Asset-Protokoll, die Datei zu lesen (Vorschau im Fenster).
fn allow_asset(app: &AppHandle, path: &Path) {
    let _ = app.asset_protocol_scope().allow_file(path);
}

fn emit_progress(app: &AppHandle, job_id: &str, p: f64) {
    let _ = app.emit(
        "mw://progress",
        json!({ "jobId": job_id, "p": p.clamp(0.0, 1.0) }),
    );
}

fn path_string(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Loaded {
    value: Option<Value>,
    restored_from_backup: bool,
}

fn json_has(v: &Value, key: &str, check: impl Fn(&Value) -> bool) -> bool {
    v.get(key).is_some_and(check)
}

fn valid_state_shape(bytes: &[u8]) -> bool {
    let Ok(v) = serde_json::from_slice::<Value>(bytes) else {
        return false;
    };
    v.get("version") == Some(&json!(1))
        && json_has(&v, "installId", Value::is_string)
        && json_has(&v, "createdAt", Value::is_number)
        && json_has(&v, "schedule", Value::is_object)
        && json_has(&v, "assignments", Value::is_array)
        && json_has(&v, "evaluations", Value::is_array)
        && json_has(&v, "settings", Value::is_object)
}

fn valid_project_shape(bytes: &[u8]) -> bool {
    let Ok(v) = serde_json::from_slice::<Value>(bytes) else {
        return false;
    };
    // Auftragsprojekt (`assignmentId`) oder freies Projekt (`freeProjectId`, Phase 1.1).
    v.get("version") == Some(&json!(1))
        && (json_has(&v, "assignmentId", Value::is_string)
            || json_has(&v, "freeProjectId", Value::is_string))
        && json_has(&v, "media", Value::is_array)
        && json_has(&v, "sequences", Value::is_array)
}

fn load_json(path: &Path, validate: fn(&[u8]) -> bool) -> CmdResult<Loaded> {
    match read_with_backup(path, validate) {
        Ok((bytes, restored)) => Ok(Loaded {
            value: Some(
                serde_json::from_slice(&bytes)
                    .map_err(|e| CmdError::new("parse", e.to_string()))?,
            ),
            restored_from_backup: restored,
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Loaded {
            value: None,
            restored_from_backup: false,
        }),
        Err(e) => Err(e.into()),
    }
}

fn save_json(path: &Path, value: &Value) -> CmdResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let bytes =
        serde_json::to_vec_pretty(value).map_err(|e| CmdError::new("parse", e.to_string()))?;
    write_atomic(path, &bytes, BACKUPS)?;
    Ok(())
}

// ---------- Zustand und Projekte ----------

#[tauri::command]
pub async fn load_state(app: AppHandle) -> CmdResult<Loaded> {
    let path = state_path(&app)?;
    blocking(move || load_json(&path, valid_state_shape)).await
}

#[tauri::command]
pub async fn save_state(app: AppHandle, state: Value) -> CmdResult<()> {
    let path = state_path(&app)?;
    blocking(move || save_json(&path, &state)).await
}

#[tauri::command]
pub async fn project_dir(app: AppHandle, folder: String) -> CmdResult<String> {
    paths::validate_folder(&folder)?;
    let dir = projects_root(&app)?.join(&folder);
    let made = dir.clone();
    blocking(move || {
        for sub in paths::PROJECT_SUBDIRS {
            fs::create_dir_all(made.join(sub))?;
        }
        Ok(())
    })
    .await?;
    Ok(path_string(&dir))
}

/// Dateipfade eines Projekts, die das Asset-Protokoll lesen darf:
/// `media[].path`, `media[].proxyPath`, `exports[].path`.
pub fn project_asset_paths(project: &Value) -> Vec<String> {
    let mut out = Vec::new();
    for (list, keys) in [
        ("media", &["path", "proxyPath"][..]),
        ("exports", &["path"][..]),
    ] {
        for item in project
            .get(list)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            for k in keys {
                if let Some(p) = item
                    .get(*k)
                    .and_then(Value::as_str)
                    .filter(|p| !p.is_empty())
                {
                    out.push(p.to_string());
                }
            }
        }
    }
    out
}

#[tauri::command]
pub async fn load_project(app: AppHandle, dir: String) -> CmdResult<Loaded> {
    let path = project_dir_checked(&app, &dir)?.join(PROJECT_FILE);
    let loaded = blocking(move || load_json(&path, valid_project_shape)).await?;
    // Das Asset-Protokoll vergisst Laufzeit-Freigaben beim Neustart: verknüpfte Medien neu freigeben.
    if let Some(v) = &loaded.value {
        for p in project_asset_paths(v) {
            let p = PathBuf::from(p);
            if p.is_absolute() && p.is_file() {
                allow_asset(&app, &p);
            }
        }
    }
    Ok(loaded)
}

#[tauri::command]
pub async fn save_project(app: AppHandle, dir: String, project: Value) -> CmdResult<()> {
    let path = project_dir_checked(&app, &dir)?.join(PROJECT_FILE);
    blocking(move || save_json(&path, &project)).await
}

// ---------- Sicherungsversionen ----------

fn project_versions_dir(app: &AppHandle, dir: &str) -> CmdResult<PathBuf> {
    Ok(project_dir_checked(app, dir)?.join(versions::VERSION_DIR))
}

/// Kopiert das aktuelle `projekt.mwp` (nur, wenn es lesbar und gültig ist) nach `Auto-Save/<name>`.
#[tauri::command]
pub async fn save_project_version(app: AppHandle, dir: String, name: String) -> CmdResult<()> {
    let project = project_dir_checked(&app, &dir)?.join(PROJECT_FILE);
    let target = project_versions_dir(&app, &dir)?;
    blocking(move || {
        if !valid_project_shape(&fs::read(&project)?) {
            return Err(CmdError::new("parse", "Projektdatei ist nicht gültig"));
        }
        versions::save_version(&project, &target, &name, versions::KEEP_VERSIONS)
    })
    .await
}

#[tauri::command]
pub async fn list_project_versions(app: AppHandle, dir: String) -> CmdResult<Vec<VersionInfo>> {
    let target = project_versions_dir(&app, &dir)?;
    blocking(move || Ok(versions::list_versions(&target))).await
}

/// Liest eine Version und gibt sie zurück; geschrieben wird nichts (das Sichern als aktueller Stand übernimmt die Oberfläche).
#[tauri::command]
pub async fn restore_project_version(
    app: AppHandle,
    dir: String,
    name: String,
) -> CmdResult<Value> {
    let target = project_versions_dir(&app, &dir)?;
    let value = blocking(move || {
        let bytes = versions::read_version(&target, &name)?;
        if !valid_project_shape(&bytes) {
            return Err(CmdError::new("parse", "Diese Version ist beschädigt"));
        }
        serde_json::from_slice::<Value>(&bytes).map_err(|e| CmdError::new("parse", e.to_string()))
    })
    .await?;
    for p in project_asset_paths(&value) {
        let p = PathBuf::from(p);
        if p.is_absolute() && p.is_file() {
            allow_asset(&app, &p);
        }
    }
    Ok(value)
}

/// Wie `save_project_version` für den App-Zustand: `<App-Daten>/Auto-Save/<name>`.
#[tauri::command]
pub async fn save_state_version(app: AppHandle, name: String) -> CmdResult<()> {
    let state = state_path(&app)?;
    let target = state
        .parent()
        .map(|p| p.join(versions::VERSION_DIR))
        .ok_or_else(|| CmdError::io("Kein App-Datenordner"))?;
    blocking(move || {
        if !valid_state_shape(&fs::read(&state)?) {
            return Err(CmdError::new("parse", "Zustandsdatei ist nicht gültig"));
        }
        versions::save_version(&state, &target, &name, versions::KEEP_VERSIONS)
    })
    .await
}

// ---------- Medien ----------

#[tauri::command]
pub async fn pick_media_files(app: AppHandle) -> CmdResult<Vec<String>> {
    blocking(move || {
        let picked = app
            .dialog()
            .file()
            .add_filter(
                "Medien",
                &[
                    "mov", "mp4", "m4v", "mxf", "wav", "mp3", "aac", "m4a", "aif", "aiff", "png",
                    "jpg", "jpeg", "heic",
                ],
            )
            .blocking_pick_files()
            .unwrap_or_default();
        picked
            .into_iter()
            .map(|p| {
                p.into_path()
                    .map(|p| path_string(&p))
                    .map_err(|e| CmdError::io(e.to_string()))
            })
            .collect()
    })
    .await
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ImportMode {
    Copy,
    Link,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    #[serde(flatten)]
    info: MediaInfo,
    id: String,
    name: String,
    path: String,
    proxy_path: Option<String>,
    shot_size: Option<String>,
}

#[tauri::command]
pub async fn import_media(
    app: AppHandle,
    dir: String,
    paths: Vec<String>,
    mode: ImportMode,
) -> CmdResult<Vec<MediaItem>> {
    let dir = project_dir_checked(&app, &dir)?;
    let items = blocking(move || {
        let tools = Tools::from_env();
        // Erst alles prüfen, dann kopieren: ein kaputter Eintrag lässt keine halben Importe zurück.
        let mut probed = Vec::with_capacity(paths.len());
        for p in &paths {
            let src = PathBuf::from(p);
            let info = probe(&tools, &src)?;
            probed.push((src, info));
        }
        let mut items = Vec::with_capacity(probed.len());
        for (src, info) in probed {
            let file_name = src
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| {
                    CmdError::invalid_path(format!("Kein Dateiname: {}", src.display()))
                })?
                .to_string();
            let (name, path) = match mode {
                ImportMode::Link => (file_name, src),
                ImportMode::Copy => {
                    let target_dir = dir.join("Medien");
                    fs::create_dir_all(&target_dir)?;
                    let name = paths::unique_name(|n| target_dir.join(n).exists(), &file_name);
                    let dest = target_dir.join(&name);
                    fs::copy(&src, &dest)?;
                    (name, dest)
                }
            };
            items.push(MediaItem {
                info,
                id: uuid::Uuid::new_v4().to_string(),
                name,
                path: path_string(&path),
                proxy_path: None,
                shot_size: None,
            });
        }
        Ok(items)
    })
    .await?;
    for i in &items {
        allow_asset(&app, Path::new(&i.path));
    }
    Ok(items)
}

#[tauri::command]
pub async fn create_proxy(
    app: AppHandle,
    dir: String,
    media_id: String,
    path: String,
    job_id: String,
) -> CmdResult<String> {
    paths::validate_id(&media_id)?;
    let out = project_dir_checked(&app, &dir)?
        .join("Proxies")
        .join(format!("{media_id}.mp4"));
    let out_for_job = out.clone();
    let handle = app.clone();
    blocking(move || {
        let tools = Tools::from_env();
        let input = PathBuf::from(&path);
        let info = probe(&tools, &input)?;
        if let Some(parent) = out_for_job.parent() {
            fs::create_dir_all(parent)?;
        }
        let args = proxy_args(&input, &out_for_job, &info, default_h264_encoder());
        mw_run_ffmpeg(&tools, &args, info.duration_sec, |p| {
            emit_progress(&handle, &job_id, p)
        })?;
        Ok(())
    })
    .await?;
    allow_asset(&app, &out);
    Ok(path_string(&out))
}

#[tauri::command]
pub async fn write_file(
    app: AppHandle,
    dir: String,
    rel: String,
    bytes: String,
) -> CmdResult<String> {
    let rel = paths::validate_rel(&rel)?;
    let target = project_dir_checked(&app, &dir)?.join(rel);
    let data = base64::engine::general_purpose::STANDARD
        .decode(bytes.as_bytes())
        .map_err(|e| CmdError::new("parse", format!("Base64: {e}")))?;
    let written = target.clone();
    blocking(move || {
        if let Some(parent) = written.parent() {
            fs::create_dir_all(parent)?;
        }
        write_atomic(&written, &data, 0)?;
        Ok(())
    })
    .await?;
    allow_asset(&app, &target);
    Ok(path_string(&target))
}

#[tauri::command]
pub async fn run_ffmpeg(
    app: AppHandle,
    args: Vec<String>,
    duration_sec: f64,
    job_id: String,
) -> CmdResult<()> {
    paths::validate_ffmpeg_args(&[projects_root(&app)?, cache_root(&app)?], &args)?;
    let args = paths::with_protocol_whitelist(&args);
    blocking(move || {
        mw_run_ffmpeg(&Tools::from_env(), &args, duration_sec, |p| {
            emit_progress(&app, &job_id, p)
        })?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn analyze(path: String, segments: Vec<Segment>) -> CmdResult<Measurements> {
    blocking(move || Ok(mw_analyze(&Tools::from_env(), Path::new(&path), &segments)?)).await
}

#[tauri::command]
pub async fn extract_frames(
    app: AppHandle,
    path: String,
    times: Vec<f64>,
    max_width: u32,
) -> CmdResult<Vec<String>> {
    let out_dir = cache_root(&app)?
        .join("frames")
        .join(uuid::Uuid::new_v4().to_string());
    let frames = blocking(move || {
        Ok(mw_extract_frames(
            &Tools::from_env(),
            Path::new(&path),
            &times,
            max_width,
            &out_dir,
        )?)
    })
    .await?;
    for f in &frames {
        allow_asset(&app, f);
    }
    Ok(frames.iter().map(|p| path_string(p)).collect())
}

// ---------- Gemini (läuft nur auf ausdrücklichen Aufruf) ----------

#[tauri::command]
pub async fn has_gemini_key() -> CmdResult<bool> {
    blocking(|| Ok(keychain::get_key()?.is_some())).await
}

#[tauri::command]
pub async fn set_gemini_key(key: Option<String>) -> CmdResult<()> {
    blocking(move || keychain::set_key(key.as_deref())).await
}

fn require_key() -> CmdResult<String> {
    keychain::get_key()?
        .ok_or_else(|| CmdError::new("invalid_key", "Kein Gemini-Schlüssel gespeichert"))
}

#[tauri::command]
pub async fn gemini_list_models() -> CmdResult<Vec<String>> {
    blocking(|| Ok(gemini::gemini_models(&require_key()?)?)).await
}

#[tauri::command]
pub async fn gemini_generate(
    app: AppHandle,
    model: String,
    prompt: String,
    image_paths: Vec<String>,
    schema: Value,
) -> CmdResult<String> {
    // Bilder nur aus Zwischenspeicher oder Projektordnern lesen.
    let roots = [cache_root(&app)?, projects_root(&app)?];
    blocking(move || {
        let mut images = Vec::with_capacity(image_paths.len());
        for p in &image_paths {
            let path = PathBuf::from(p);
            if !roots.iter().any(|r| paths::is_within(r, &path)) {
                return Err(CmdError::invalid_path(format!(
                    "Bild außerhalb der Arbeitsordner: {p}"
                )));
            }
            images.push(base64::engine::general_purpose::STANDARD.encode(fs::read(&path)?));
        }
        let body = gemini::gemini_request_body(&prompt, &images, &schema);
        Ok(gemini::gemini_generate(&require_key()?, &model, &body)?)
    })
    .await
}

// ---------- Finder ----------

#[tauri::command]
pub async fn reveal_in_finder(path: String) -> CmdResult<()> {
    blocking(move || {
        tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| CmdError::io(e.to_string()))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitelisted_export_like_command_runs_with_real_ffmpeg() {
        let d = std::env::temp_dir().join(format!("mw-ff-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        let tools = Tools::from_env();
        let s = |p: &Path| path_string(p);
        let src = d.join("src.mp4");
        let make: Vec<String> = [
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=320x240:r=25:d=1",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=stereo",
            "-t",
            "1",
            "-c:v",
            "mpeg4",
            "-c:a",
            "aac",
            "-shortest",
        ]
        .iter()
        .map(|x| x.to_string())
        .chain([s(&src)])
        .collect();
        mw_run_ffmpeg(&tools, &make, 1.0, |_| {}).unwrap();
        let out = d.join("out.mp4");
        let args: Vec<String> = [
            "-i", &s(&src), "-f", "lavfi", "-i", "color=black:s=320x240:r=25:d=1", "-f", "lavfi",
            "-i", "anullsrc=r=48000:cl=stereo", "-filter_complex",
            "[0:v][1:v]overlay=enable='between(t,0,1)'[v];[0:a][2:a]amix=inputs=2:duration=first[a]",
            "-map", "[v]", "-map", "[a]", "-t", "1", "-c:v", "mpeg4", "-c:a", "aac", "-r", "25",
        ].iter().map(|x| x.to_string()).chain([s(&out)]).collect();
        paths::validate_ffmpeg_args(std::slice::from_ref(&d), &args).unwrap();
        let guarded = paths::with_protocol_whitelist(&args);
        assert_eq!(
            guarded
                .iter()
                .filter(|a| *a == "-protocol_whitelist")
                .count(),
            3
        );
        mw_run_ffmpeg(&tools, &guarded, 1.0, |_| {}).unwrap();
        assert!(out.metadata().unwrap().len() > 0);
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn state_shape_needs_all_core_fields() {
        let ok = json!({"version":1,"installId":"i","createdAt":1,"schedule":{},"assignments":[],"evaluations":[],"settings":{}});
        assert!(valid_state_shape(ok.to_string().as_bytes()));
        let mut bad = ok.clone();
        bad["version"] = json!(2);
        assert!(!valid_state_shape(bad.to_string().as_bytes()));
        let mut bad = ok;
        bad.as_object_mut().unwrap().remove("settings");
        assert!(!valid_state_shape(bad.to_string().as_bytes()));
        assert!(!valid_state_shape(b"{kaputt"));
    }

    #[test]
    fn asset_paths_are_collected_from_project() {
        let p = json!({
            "version": 1, "assignmentId": "a", "sequences": [],
            "media": [
                {"id": "1", "path": "/v/a.mov", "proxyPath": "/p/1.mp4"},
                {"id": "2", "path": "/v/b.wav", "proxyPath": null},
                {"id": "3"}
            ],
            "exports": [{"path": "/e/out.mp4"}, {"path": ""}, {"name": "x"}]
        });
        assert_eq!(
            project_asset_paths(&p),
            vec!["/v/a.mov", "/p/1.mp4", "/v/b.wav", "/e/out.mp4"]
        );
        assert!(project_asset_paths(&json!({"version": 1})).is_empty());
    }

    #[test]
    fn project_shape_needs_media_and_sequences() {
        let ok = json!({"version":1,"assignmentId":"a","media":[],"sequences":[]});
        assert!(valid_project_shape(ok.to_string().as_bytes()));
        let free = json!({"version":1,"freeProjectId":"p-1","media":[],"sequences":[]});
        assert!(valid_project_shape(free.to_string().as_bytes()));
        assert!(!valid_project_shape(
            json!({"version":1,"media":[],"sequences":[]})
                .to_string()
                .as_bytes()
        ));
        assert!(!valid_project_shape(
            json!({"version":1}).to_string().as_bytes()
        ));
    }

    #[test]
    fn missing_file_loads_as_null_and_backup_is_reported() {
        let d = std::env::temp_dir().join(format!("mw-cmd-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        let f = d.join("state.json");
        let none = load_json(&f, valid_state_shape).unwrap();
        assert!(none.value.is_none() && !none.restored_from_backup);
        let v = json!({"version":1,"installId":"i","createdAt":1,"schedule":{},"assignments":[],"evaluations":[],"settings":{}});
        save_json(&f, &v).unwrap();
        save_json(&f, &v).unwrap();
        fs::write(&f, b"kaputt").unwrap();
        let r = load_json(&f, valid_state_shape).unwrap();
        assert!(r.value.is_some() && r.restored_from_backup);
        fs::remove_dir_all(&d).unwrap();
    }
}
