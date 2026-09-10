use crate::workspace::Workspace;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
#[derive(Serialize, Deserialize)]
struct Layout {
    version: u32,
    moves: Vec<String>,
}
fn ordinary(path: &Path) -> Result<()> {
    if fs::symlink_metadata(path)
        .map_err(err)?
        .file_type()
        .is_symlink()
    {
        return Err("Linked workspace folders are not supported.".into());
    }
    Ok(())
}
impl Workspace {
    /// The public note path stays Vault/Folder/Note while files live in home/Vaults.
    pub fn open(home: PathBuf) -> Result<Self> {
        fs::create_dir_all(&home).map_err(err)?;
        ordinary(&home)?;
        let home = home.canonicalize().map_err(err)?;
        let marker = home.join(".lotus-state/layout.json");
        let pending = home.join(".lotus-layout-pending.json");
        let layout: Layout = if marker.exists() {
            ordinary(&home.join(".lotus-state"))?;
            ordinary(&marker)?;
            serde_json::from_slice(&fs::read(&marker).map_err(err)?).map_err(err)?
        } else if pending.exists() {
            ordinary(&pending)?;
            serde_json::from_slice(&fs::read(&pending).map_err(err)?).map_err(err)?
        } else {
            if !home.join(".notus-state").exists()
                && !home.join(".notus-trash").exists()
                && fs::read_dir(&home).map_err(err)?.next().is_some()
            {
                return Err("Choose an empty Lotus storage folder or an existing Lotus workspace. Unrelated folders will not be reorganized.".into());
            }
            if home.join("Vaults").exists() {
                return Err("This folder already contains an unrecognized Vaults directory. Choose an empty Lotus folder or an existing Lotus workspace.".into());
            }
            let legacy = Workspace::new(home.clone())?;
            let moves = legacy
                .snapshot()?
                .entries
                .into_iter()
                .map(|e| e.name)
                .collect();
            let layout = Layout { version: 1, moves };
            let mut temp = tempfile::NamedTempFile::new_in(&home).map_err(err)?;
            use std::io::Write;
            temp.write_all(&serde_json::to_vec(&layout).map_err(err)?)
                .map_err(err)?;
            temp.as_file().sync_all().map_err(err)?;
            temp.persist(&pending).map_err(err)?;
            layout
        };
        if layout.version != 1 {
            return Err("Unsupported Lotus storage layout.".into());
        }
        for (old, new) in [
            (".notus-state", ".lotus-state"),
            (".notus-trash", ".lotus-trash"),
        ] {
            if home.join(old).exists() {
                ordinary(&home.join(old))?;
                if home.join(new).exists() {
                    return Err(format!(
                        "Both {old} and {new} exist. No folders were overwritten."
                    ));
                }
                fs::rename(home.join(old), home.join(new)).map_err(err)?;
            }
        }
        fs::create_dir_all(home.join(".lotus-state")).map_err(err)?;
        if !marker.exists() {
            fs::rename(&pending, &marker).map_err(err)?;
        }
        let vaults = home.join("Vaults");
        fs::create_dir_all(&vaults).map_err(err)?;
        ordinary(&vaults)?;
        for name in layout.moves {
            crate::workspace::valid_name(&name)?;
            let old = home.join(&name);
            let next = vaults.join(&name);
            if old.exists() {
                ordinary(&old)?;
                if next.exists() {
                    return Err(format!(
                        "Storage migration conflict: {name}. Both copies were preserved."
                    ));
                }
                fs::rename(old, next).map_err(err)?;
            }
        }
        let workspace = Self {
            root: vaults.canonicalize().map_err(err)?,
            home: Some(home),
        };
        workspace.internal_dir(".notus-state")?;
        workspace.internal_dir(".notus-trash")?;
        Ok(workspace)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unrelated_folders_are_not_migrated() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join("Personal files")).unwrap();
        assert!(Workspace::open(tmp.path().into()).is_err());
        assert!(tmp.path().join("Personal files").is_dir());
        assert!(!tmp.path().join("Vaults").exists());
    }
    #[test]
    fn unfinished_metadata_move_resumes() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path().join("Lotus");
        let old = Workspace::new(base.clone()).unwrap();
        old.create("", "vault", "V").unwrap();
        fs::write(
            base.join(".lotus-layout-pending.json"),
            br#"{"version":1,"moves":["V"]}"#,
        )
        .unwrap();
        if base.join(".notus-state").exists() {
            fs::rename(base.join(".notus-state"), base.join(".lotus-state")).unwrap();
        }
        assert!(Workspace::open(base.clone())
            .unwrap()
            .root
            .join("V")
            .is_dir());
        assert!(!base.join(".lotus-layout-pending.json").exists());
    }
    #[test]
    fn legacy_layout_preserves_content_and_identity_paths() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path().join("Lotus");
        let old = Workspace::new(base.clone()).unwrap();
        old.create("", "vault", "Research").unwrap();
        old.create("Research", "folder", "Notes").unwrap();
        let note = old.create("Research/Notes", "note", "Hello").unwrap();
        let d = old.read(&note).unwrap();
        old.write(&note, "hello", &d.revision).unwrap();
        let w = Workspace::open(base.clone()).unwrap();
        assert_eq!(w.read(&note).unwrap().content, "hello");
        assert!(base.join("Vaults/Research/Notes/Hello.md").exists());
        assert!(base.join(".lotus-trash").exists());
        assert_eq!(
            Workspace::open(base).unwrap().read(&note).unwrap().content,
            "hello"
        );
    }
}
