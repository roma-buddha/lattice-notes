use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
};

type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Serialize, Clone)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub children: Vec<Entry>,
}
#[derive(Serialize)]
pub struct Snapshot {
    pub root: String,
    pub entries: Vec<Entry>,
}
#[derive(Serialize, Debug)]
pub struct Document {
    pub path: String,
    pub content: String,
    pub revision: String,
}

pub struct Workspace {
    pub root: PathBuf,
}
pub fn valid_name(name: &str) -> Result<()> {
    let stem = name.split('.').next().unwrap_or("").to_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if name.is_empty()
        || name.starts_with('.')
        || name.ends_with(['.', ' '])
        || name.len() > 180
        || reserved.contains(&stem.as_str())
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err(
            "Choose a name without Windows reserved characters, trailing dots, or spaces.".into(),
        );
    }
    Ok(())
}
fn depth(p: &str) -> usize {
    p.split('/').filter(|s| !s.is_empty()).count()
}
fn is_note(p: &Path) -> bool {
    p.extension()
        .is_some_and(|s| s.eq_ignore_ascii_case("md") || s.eq_ignore_ascii_case("markdown"))
}
fn revision(content: &str) -> String {
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

impl Workspace {
    pub fn new(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root).map_err(err)?;
        Ok(Self {
            root: root.canonicalize().map_err(err)?,
        })
    }
    pub fn resolve(&self, relative: &str) -> Result<PathBuf> {
        if relative.contains('\\') || relative.contains(':') || relative.starts_with('/') {
            return Err("Invalid workspace path.".into());
        }
        let mut path = self.root.clone();
        for component in Path::new(relative).components() {
            let Component::Normal(part) = component else {
                return Err("Path leaves the workspace.".into());
            };
            path.push(part);
            if path.exists() {
                let canonical = path.canonicalize().map_err(err)?;
                if fs::symlink_metadata(&path)
                    .map_err(err)?
                    .file_type()
                    .is_symlink()
                    || !canonical.starts_with(&self.root)
                {
                    return Err("Linked folders are not supported inside the workspace.".into());
                }
            }
        }
        Ok(path)
    }
    fn walk(&self, relative: &str) -> Result<Vec<Entry>> {
        let mut entries = Vec::new();
        for child in fs::read_dir(self.resolve(relative)?).map_err(err)? {
            let child = child.map_err(err)?;
            let name = child.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name.ends_with(".lattice-tmp") {
                continue;
            }
            let kind = child.file_type().map_err(err)?;
            if kind.is_symlink() {
                continue;
            }
            let path = if relative.is_empty() {
                name.clone()
            } else {
                format!("{relative}/{name}")
            };
            if self.resolve(&path).is_err() {
                continue;
            }
            if kind.is_dir() {
                entries.push(Entry {
                    name,
                    path: path.clone(),
                    kind: if relative.is_empty() {
                        "vault"
                    } else {
                        "folder"
                    }
                    .into(),
                    children: self.walk(&path)?,
                });
            } else if !relative.is_empty() && is_note(&child.path()) {
                entries.push(Entry {
                    name,
                    path,
                    kind: "note".into(),
                    children: vec![],
                });
            }
        }
        entries.sort_by(|a, b| {
            (a.kind == "note")
                .cmp(&(b.kind == "note"))
                .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(entries)
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        Ok(Snapshot {
            root: self
                .root
                .to_string_lossy()
                .trim_start_matches("\\\\?\\")
                .into(),
            entries: self.walk("")?,
        })
    }
    pub fn read(&self, relative: &str) -> Result<Document> {
        let path = self.resolve(relative)?;
        if !is_note(&path) {
            return Err("Only Markdown notes can be opened.".into());
        }
        let content = fs::read_to_string(path).map_err(err)?;
        Ok(Document {
            path: relative.into(),
            revision: revision(&content),
            content,
        })
    }
    pub fn write(&self, relative: &str, content: &str, expected: &str) -> Result<Document> {
        let current = self.read(relative)?;
        if current.revision != expected {
            return Err(
                "CONFLICT: This note changed outside Notus. Your draft has been kept.".into(),
            );
        }
        let path = self.resolve(relative)?;
        let mut temp = tempfile::NamedTempFile::new_in(path.parent().unwrap()).map_err(err)?;
        temp.write_all(content.as_bytes()).map_err(err)?;
        temp.as_file().sync_all().map_err(err)?;
        // Keep the old contents until the atomic replacement completes.
        temp.persist(&path).map_err(err)?;
        self.read(relative)
    }
    pub fn create(&self, parent: &str, kind: &str, name: &str) -> Result<String> {
        valid_name(name)?;
        let parent_path = self.resolve(parent)?;
        if !parent_path.is_dir() {
            return Err("Select an existing folder.".into());
        }
        match kind {
            "vault" if parent.is_empty() => {}
            "folder" if depth(parent) >= 1 => {}
            "note" if depth(parent) >= 1 => {}
            _ => return Err("Select a vault or a folder inside a vault first.".into()),
        }
        let name = if kind == "note" && !is_note(Path::new(name)) {
            format!("{name}.md")
        } else {
            name.into()
        };
        let relative = if parent.is_empty() {
            name.clone()
        } else {
            format!("{parent}/{name}")
        };
        let target = self.resolve(&relative)?;
        if target.exists() {
            return Err("An item with this name already exists. Choose another name.".into());
        }
        if kind == "note" {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(err)?;
            file.write_all(
                format!(
                    "# {}\n\n",
                    Path::new(&name).file_stem().unwrap().to_string_lossy()
                )
                .as_bytes(),
            )
            .map_err(err)?;
        } else {
            fs::create_dir(&target).map_err(err)?;
        }
        Ok(relative)
    }
    pub fn relocate(&self, relative: &str, parent: &str, name: &str) -> Result<String> {
        valid_name(name)?;
        if relative.is_empty() {
            return Err("The workspace root cannot be moved.".into());
        }
        let source = self.resolve(relative)?;
        let destination_parent = self.resolve(parent)?;
        if !destination_parent.is_dir() {
            return Err("Select an existing destination folder.".into());
        }
        let file = source.is_file();
        if file && (!is_note(&source) || depth(parent) < 1) {
            return Err("Notes must be moved into a vault or one of its folders.".into());
        }
        if !file
            && ((depth(relative) == 1 && !parent.is_empty())
                || (depth(relative) > 1 && parent.is_empty()))
        {
            return Err("Keep vaults at the workspace root and subfolders inside vaults.".into());
        }
        let name = if file && !is_note(Path::new(name)) {
            format!("{name}.md")
        } else {
            name.into()
        };
        let next = if parent.is_empty() {
            name.clone()
        } else {
            format!("{parent}/{name}")
        };
        let destination = self.resolve(&next)?;
        if source == destination {
            return Ok(relative.into());
        }
        if destination.exists() {
            return Err("An item with this name already exists. Rename it first.".into());
        }
        if destination.starts_with(&source) {
            return Err("A folder cannot be moved inside itself.".into());
        }
        fs::rename(source, destination).map_err(err)?;
        Ok(next)
    }
    pub fn remove(&self, relative: &str) -> Result<()> {
        if relative.is_empty() {
            return Err("The workspace root cannot be deleted.".into());
        }
        trash::delete(self.resolve(relative)?).map_err(err)
    }
    pub fn import(&self, source: &Path) -> Result<String> {
        let source = source.canonicalize().map_err(err)?;
        if source.starts_with(&self.root) || self.root.starts_with(&source) {
            return Err("Choose a folder outside the current workspace.".into());
        }
        let original = source
            .file_name()
            .ok_or("Choose a vault folder.")?
            .to_string_lossy()
            .to_string();
        valid_name(&original)?;
        let mut name = original.clone();
        let mut n = 2;
        while self.root.join(&name).exists() {
            name = format!("{original} {n}");
            n += 1;
        }
        let staging = tempfile::tempdir_in(&self.root).map_err(err)?;
        copy_folder(&source, staging.path(), true)?;
        fs::rename(staging.path(), self.root.join(&name)).map_err(err)?;
        Ok(name)
    }
}
fn copy_folder(source: &Path, dest: &Path, root: bool) -> Result<()> {
    for entry in fs::read_dir(source).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let kind = entry.file_type().map_err(err)?;
        if kind.is_symlink() {
            return Err("Import contains a symbolic link. Import ordinary folders instead.".into());
        }
        let mut target = dest.join(&name);
        if kind.is_dir() {
            fs::create_dir_all(&target).map_err(err)?;
            copy_folder(&entry.path(), &target, false)?;
        } else {
            if root && is_note(&entry.path()) {
                let mut imported = "Imported root notes".to_string();
                while source.join(&imported).exists() {
                    imported.push('_');
                }
                target = dest.join(imported).join(&name);
                fs::create_dir_all(target.parent().unwrap()).map_err(err)?;
            }
            fs::copy(entry.path(), target).map_err(err)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hierarchy_and_cross_vault_moves() {
        let temp = tempfile::tempdir().unwrap();
        let w = Workspace::new(temp.path().into()).unwrap();
        w.create("", "vault", "Work").unwrap();
        w.create("", "vault", "Personal").unwrap();
        assert!(w.create("", "note", "Rogue").is_err());
        let root_note = w.create("Work", "note", "Overview").unwrap();
        assert_eq!(root_note, "Work/Overview.md");
        assert_eq!(
            w.relocate(&root_note, "Personal", "Overview").unwrap(),
            "Personal/Overview.md"
        );
        w.create("Work", "folder", "Ideas").unwrap();
        w.create("Personal", "folder", "Journal").unwrap();
        let note = w.create("Work/Ideas", "note", "First").unwrap();
        let original = w.read(&note).unwrap();
        let saved = w.write(&note, "# Changed", &original.revision).unwrap();
        assert!(w
            .write(&note, "stale", &original.revision)
            .unwrap_err()
            .contains("CONFLICT"));
        let moved = w.relocate(&note, "Personal/Journal", "First.md").unwrap();
        assert_eq!(w.read(&moved).unwrap().content, saved.content);
        assert!(!w.resolve(&note).unwrap().exists());
        assert!(w.relocate("Work/Ideas", "Work/Ideas", "Child").is_err());
        assert!(w.create("Personal/Journal", "note", "First").is_err());
    }
    #[test]
    fn validates_boundaries_and_names() {
        let temp = tempfile::tempdir().unwrap();
        let w = Workspace::new(temp.path().into()).unwrap();
        for path in [
            "../secret",
            "C:/secret",
            "/secret",
            "a/../../secret",
            "a\\b",
        ] {
            assert!(w.resolve(path).is_err());
        }
        for name in ["CON", "NUL.md", "bad:name", "trailing.", ".hidden", "a/b"] {
            assert!(valid_name(name).is_err());
        }
        assert!(w.remove("").is_err());
    }
    #[test]
    fn import_copies_without_touching_source() {
        let temp = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let source = outside.path().join("Existing vault");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("Existing.md"), "my writing").unwrap();
        let w = Workspace::new(temp.path().into()).unwrap();
        let vault = w.import(&source).unwrap();
        assert_eq!(
            w.read(&format!("{vault}/Imported root notes/Existing.md"))
                .unwrap()
                .content,
            "my writing"
        );
        assert_eq!(
            fs::read_to_string(source.join("Existing.md")).unwrap(),
            "my writing"
        );
    }
}
