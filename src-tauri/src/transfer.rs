use crate::workspace::Workspace;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
const MAX_TOTAL: u64 = 10 * 1024 * 1024 * 1024;
const MAX_FILE: u64 = 2 * 1024 * 1024 * 1024;
#[derive(Serialize, Deserialize, Clone)]
pub struct FileRecord {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}
#[derive(Serialize, Deserialize, Clone)]
pub struct Manifest {
    pub format: String,
    pub version: u32,
    pub app_version: String,
    pub source_root: String,
    pub include_vaults: bool,
    pub include_trash: bool,
    #[serde(default)]
    pub directories: Vec<String>,
    pub settings: BTreeMap<String, String>,
    pub files: Vec<FileRecord>,
}
#[derive(Serialize, Deserialize, Clone)]
pub struct Preview {
    pub archive: String,
    pub revision: String,
    pub manifest: Manifest,
}
#[derive(Serialize)]
pub struct Restored {
    pub root: String,
    pub source_root: String,
    pub settings: BTreeMap<String, String>,
}
fn digest(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path).map_err(err)?;
    let mut h = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf).map_err(err)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}
fn safe_name(name: &str) -> Result<()> {
    if name.contains('\\') || name.starts_with('/') || name.contains(':') {
        return Err("Unsafe archive path.".into());
    }
    let parts: Vec<_> = name.split('/').collect();
    if parts.len() < 2 || !["Vaults", ".lotus-state", ".lotus-trash"].contains(&parts[0]) {
        return Err("Unexpected archive entry.".into());
    }
    for p in &parts[1..] {
        if p.is_empty()
            || *p == "."
            || *p == ".."
            || p.ends_with(['.', ' '])
            || p.chars()
                .any(|c| c.is_control() || "<>:\"\\|?*".contains(c))
        {
            return Err("Unsafe archive filename.".into());
        }
        let first = p.split('.').next().unwrap_or("").to_uppercase();
        if [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ]
        .contains(&first.as_str())
        {
            return Err("Reserved archive filename.".into());
        }
    }
    if parts[0] == ".lotus-state"
        && (parts.len() != 2 || !["organizer.json", "locks.json"].contains(&parts[1]))
    {
        return Err("Unexpected metadata entry.".into());
    }
    Ok(())
}
fn collect(
    base: &Path,
    prefix: &str,
    out: &mut Vec<(String, PathBuf)>,
    dirs: &mut Vec<String>,
) -> Result<()> {
    for item in fs::read_dir(base).map_err(err)? {
        let item = item.map_err(err)?;
        let path = item.path();
        let kind = item.file_type().map_err(err)?;
        if kind.is_symlink() {
            return Err(format!(
                "Export cannot follow linked files: {}",
                path.display()
            ));
        }
        let name = item.file_name().to_string_lossy().into_owned();
        if prefix == "Vaults" && (name.starts_with(".notus-") || name.starts_with(".lotus-")) {
            continue;
        }
        if name == ".DS_Store" || name == "Thumbs.db" {
            continue;
        }
        let key = format!("{prefix}/{name}");
        if kind.is_dir() {
            safe_name(&format!("{key}/placeholder"))?;
            dirs.push(key.clone());
            collect(&path, &key, out, dirs)?
        } else if kind.is_file() {
            safe_name(&key)?;
            out.push((key, path));
        }
    }
    Ok(())
}
pub fn export(
    workspace: &Workspace,
    destination: &Path,
    settings: BTreeMap<String, String>,
    vaults: bool,
    trash: bool,
) -> Result<()> {
    if destination.exists() {
        return Err("Choose a new ZIP filename; existing backups are never overwritten.".into());
    }
    if destination.starts_with(&workspace.root) {
        return Err("Save the backup outside the vaults folder.".into());
    }
    let mut files = vec![];
    let mut directories = vec![];
    if vaults {
        collect(&workspace.root, "Vaults", &mut files, &mut directories)?;
        files.retain(|(p, _)| !p.starts_with("Vaults/.notus-"));
    }
    let state = workspace.internal_dir(".notus-state")?;
    for name in ["organizer.json", "locks.json"] {
        if state.join(name).is_file() {
            if fs::symlink_metadata(state.join(name))
                .map_err(err)?
                .file_type()
                .is_symlink()
            {
                return Err("Cannot export linked metadata.".into());
            }
            files.push((format!(".lotus-state/{name}"), state.join(name)));
        }
    }
    if trash {
        collect(
            &workspace.internal_dir(".notus-trash")?,
            ".lotus-trash",
            &mut files,
            &mut directories,
        )?;
    }
    let mut records = vec![];
    let mut total = 0;
    for (name, path) in &files {
        let size = fs::metadata(path).map_err(err)?.len();
        total += size;
        if size > MAX_FILE || total > MAX_TOTAL || files.len() > 100000 {
            return Err("Backup exceeds the supported size limit (2 GB per file, 10 GB total, 100,000 files).".into());
        }
        records.push(FileRecord {
            path: name.clone(),
            size,
            sha256: digest(path)?,
        });
    }
    let manifest = Manifest {
        format: "lotus-backup".into(),
        version: 1,
        app_version: env!("CARGO_PKG_VERSION").into(),
        source_root: workspace.snapshot()?.root,
        include_vaults: vaults,
        include_trash: trash,
        directories,
        settings,
        files: records,
    };
    let mut temp =
        tempfile::NamedTempFile::new_in(destination.parent().ok_or("Choose a backup folder.")?)
            .map_err(err)?;
    {
        let mut zip = ZipWriter::new(temp.as_file_mut());
        let opts =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("manifest.json", opts).map_err(err)?;
        zip.write_all(&serde_json::to_vec_pretty(&manifest).map_err(err)?)
            .map_err(err)?;
        for ((name, path), record) in files.iter().zip(&manifest.files) {
            zip.start_file(name, opts).map_err(err)?;
            let mut source = fs::File::open(path).map_err(err)?;
            std::io::copy(&mut source, &mut zip).map_err(err)?;
            if digest(path)? != record.sha256 {
                return Err("A file changed while exporting. Please try again.".into());
            }
        }
        zip.finish().map_err(err)?;
    }
    temp.as_file().sync_all().map_err(err)?;
    temp.persist_noclobber(destination).map_err(err)?;
    Ok(())
}
pub fn preview(path: &Path) -> Result<Preview> {
    let mut zip = ZipArchive::new(fs::File::open(path).map_err(err)?).map_err(err)?;
    if zip.len() > 100001 {
        return Err("Too many archive entries.".into());
    }
    let manifest: Manifest = {
        let file = zip.by_name("manifest.json").map_err(err)?;
        if file.size() > 16 * 1024 * 1024 {
            return Err("Manifest is too large.".into());
        }
        serde_json::from_reader(file).map_err(err)?
    };
    if manifest.format != "lotus-backup" || manifest.version != 1 {
        return Err("Unsupported Lotus backup format.".into());
    }
    if manifest.directories.len() > 100000 {
        return Err("Too many folders.".into());
    }
    for dir in &manifest.directories {
        safe_name(&format!("{dir}/placeholder"))?;
        if !dir.starts_with("Vaults/") && !dir.starts_with(".lotus-trash/") {
            return Err("Unexpected archive directory.".into());
        }
    }
    let mut names = BTreeSet::new();
    let mut total = 0;
    for record in &manifest.files {
        safe_name(&record.path)?;
        if !names.insert(record.path.to_lowercase()) {
            return Err("Duplicate archive filename.".into());
        }
        total += record.size;
        if record.size > MAX_FILE || total > MAX_TOTAL {
            return Err("Archive exceeds the supported size limit.".into());
        }
        let file = zip.by_name(&record.path).map_err(err)?;
        if file.size() != record.size || file.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
        {
            return Err("Invalid archive file.".into());
        }
        if record.path.starts_with("Vaults/") && !manifest.include_vaults {
            return Err("Vault contents disagree with the manifest.".into());
        }
        if record.path.starts_with(".lotus-trash/") && !manifest.include_trash {
            return Err("Trash contents disagree with the manifest.".into());
        }
    }
    if zip.len() != manifest.files.len() + 1 {
        return Err("Archive contains unlisted entries.".into());
    }
    Ok(Preview {
        archive: path.to_string_lossy().into(),
        revision: digest(path)?,
        manifest,
    })
}
pub fn restore(plan: &Preview, parent: &Path, settings: bool) -> Result<Restored> {
    let checked = preview(Path::new(&plan.archive))?;
    if checked.revision != plan.revision {
        return Err("The archive changed. Preview it again.".into());
    }
    fs::create_dir_all(parent).map_err(err)?;
    let parent = parent.canonicalize().map_err(err)?;
    let stage = tempfile::Builder::new()
        .prefix(".lotus-import-")
        .tempdir_in(&parent)
        .map_err(err)?;
    let mut zip = ZipArchive::new(fs::File::open(&plan.archive).map_err(err)?).map_err(err)?;
    for dir in &checked.manifest.directories {
        fs::create_dir_all(stage.path().join(dir)).map_err(err)?;
    }
    for record in &checked.manifest.files {
        if record.path.starts_with(".lotus-state/") && !settings {
            continue;
        }
        let target = stage.path().join(&record.path);
        fs::create_dir_all(target.parent().unwrap()).map_err(err)?;
        let mut out = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(err)?;
        let mut file = zip.by_name(&record.path).map_err(err)?;
        let size =
            std::io::copy(&mut file.by_ref().take(record.size + 1), &mut out).map_err(err)?;
        out.sync_all().map_err(err)?;
        if size != record.size || digest(&target)? != record.sha256 {
            return Err("Backup integrity check failed; nothing was imported.".into());
        }
    }
    fs::create_dir_all(stage.path().join("Vaults")).map_err(err)?;
    fs::create_dir_all(stage.path().join(".lotus-state")).map_err(err)?;
    fs::write(
        stage.path().join(".lotus-state/layout.json"),
        br#"{"version":1,"moves":[]}"#,
    )
    .map_err(err)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(err)?
        .as_millis();
    let final_path = parent.join(format!("Lotus Imported {stamp}"));
    if final_path.exists() {
        return Err("Import destination already exists. Try again.".into());
    }
    fs::rename(stage.path(), &final_path).map_err(err)?;
    let w = Workspace::open(final_path)?;
    Ok(Restored {
        root: w.snapshot()?.root,
        source_root: checked.manifest.source_root,
        settings: if settings {
            checked.manifest.settings
        } else {
            BTreeMap::new()
        },
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_roundtrip_and_settings_only() {
        let t = tempfile::tempdir().unwrap();
        let w = Workspace::open(t.path().join("Original")).unwrap();
        w.create("", "vault", "Work").unwrap();
        w.create("", "vault", "Empty").unwrap();
        w.create("Work", "folder", "Notes").unwrap();
        let p = w.create("Work/Notes", "note", "Hello").unwrap();
        let d = w.read(&p).unwrap();
        w.write(&p, "preserve me", &d.revision).unwrap();
        fs::write(w.root.join("Work/Notes/file.pdf"), [0, 1, 2, 3]).unwrap();
        for full in [true, false] {
            let out = t.path().join(format!("{full}.zip"));
            export(
                &w,
                &out,
                BTreeMap::from([("notus-theme".into(), "dark".into())]),
                full,
                false,
            )
            .unwrap();
            let plan = preview(&out).unwrap();
            let imported = restore(&plan, t.path(), true).unwrap();
            assert_eq!(imported.settings["notus-theme"], "dark");
            assert_eq!(Path::new(&imported.root).join(&p).exists(), full);
            assert_eq!(Path::new(&imported.root).join("Empty").is_dir(), full);
            if full {
                assert_eq!(
                    fs::read(Path::new(&imported.root).join("Work/Notes/file.pdf")).unwrap(),
                    [0, 1, 2, 3]
                );
            }
            assert!(export(&w, &out, BTreeMap::new(), full, false).is_err());
        }
    }
    #[test]
    fn corrupted_payload_is_rejected_without_publishing() {
        let t = tempfile::tempdir().unwrap();
        let zip_path = t.path().join("bad.zip");
        let mut writer = ZipWriter::new(fs::File::create(&zip_path).unwrap());
        let manifest = Manifest {
            format: "lotus-backup".into(),
            version: 1,
            app_version: "test".into(),
            source_root: "old".into(),
            include_vaults: true,
            include_trash: false,
            directories: vec![],
            settings: BTreeMap::new(),
            files: vec![FileRecord {
                path: "Vaults/V/F/N.md".into(),
                size: 3,
                sha256: "wrong".into(),
            }],
        };
        writer
            .start_file("manifest.json", SimpleFileOptions::default())
            .unwrap();
        writer
            .write_all(&serde_json::to_vec(&manifest).unwrap())
            .unwrap();
        writer
            .start_file("Vaults/V/F/N.md", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"bad").unwrap();
        writer.finish().unwrap();
        let plan = preview(&zip_path).unwrap();
        assert!(restore(&plan, t.path(), true).is_err());
        assert!(!fs::read_dir(t.path()).unwrap().any(|e| e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("Lotus Imported")));
    }
    #[test]
    fn rejects_unsafe_names() {
        for p in [
            "Vaults/../escape",
            "Vaults/C:/escape",
            "Vaults/CON",
            "Vaults/a\\b",
            "other/file",
            ".lotus-state/evil.json",
        ] {
            assert!(safe_name(p).is_err(), "{p}");
        }
    }
}
