use crate::workspace::{valid_name, Workspace};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, path::Path};
type Result<T> = std::result::Result<T, String>;
#[derive(Serialize, Clone, Debug)]
pub struct Conversion {
    pub source: String,
    pub destination: String,
    pub files: Vec<(String, String)>,
    pub revision: String,
}
fn collect(
    workspace: &Workspace,
    source: &str,
    directory: &Path,
    destination: &str,
    files: &mut Vec<(String, String)>,
    hash: &mut Sha256,
) -> Result<()> {
    let mut entries = fs::read_dir(directory)
        .map_err(|e| e.to_string())?
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() {
            return Err("Conversion does not follow symbolic links.".into());
        }
        if kind.is_dir() {
            collect(workspace, source, &entry.path(), destination, files, hash)?;
        } else {
            let source_root = workspace.resolve(source)?;
            let file_path = entry.path();
            let suffix = file_path
                .strip_prefix(&source_root)
                .map_err(|e| e.to_string())?;
            let name = suffix
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join(" - ");
            valid_name(&name)?;
            let from = format!("{source}/{}", suffix.to_string_lossy().replace('\\', "/"));
            let to = format!("{destination}/{name}");
            hash.update(from.as_bytes());
            hash.update(fs::read(&file_path).map_err(|e| e.to_string())?);
            files.push((from, to));
        }
    }
    Ok(())
}
impl Workspace {
    pub fn conversion_preview(&self, source: &str, parent: &str, name: &str) -> Result<Conversion> {
        if source.is_empty()
            || source.contains('/')
            || parent.is_empty()
            || parent.contains('/')
            || source == parent
        {
            return Err("Choose two different vaults.".into());
        }
        valid_name(name)?;
        let directory = self.resolve(source)?;
        if !directory.is_dir() || !self.resolve(parent)?.is_dir() {
            return Err("Choose existing vaults.".into());
        }
        let destination = format!("{parent}/{name}");
        if self.resolve(&destination)?.exists() {
            return Err(
                "That folder already exists. Choose another name; nothing will be overwritten."
                    .into(),
            );
        }
        let mut files = Vec::new();
        let mut hash = Sha256::new();
        hash.update(source.as_bytes());
        hash.update(destination.as_bytes());
        collect(
            self,
            source,
            &directory,
            &destination,
            &mut files,
            &mut hash,
        )?;
        let mut names = BTreeSet::new();
        for (_, to) in &files {
            if !names.insert(to.to_lowercase()) {
                return Err("Flattening would create duplicate filenames. Rename those files before converting.".into());
            }
        }
        Ok(Conversion {
            source: source.into(),
            destination,
            files,
            revision: format!("{:x}", hash.finalize()),
        })
    }
    pub fn convert_vault(
        &self,
        source: &str,
        parent: &str,
        name: &str,
        revision: &str,
    ) -> Result<Conversion> {
        let plan = self.conversion_preview(source, parent, name)?;
        if plan.revision != revision {
            return Err(
                "The vault changed after the preview. Review a fresh preview before converting."
                    .into(),
            );
        }
        let locks = self.locks()?;
        let staging = tempfile::Builder::new()
            .prefix(".conversion-")
            .tempdir_in(&self.root)
            .map_err(|e| e.to_string())?;
        for (from, to) in &plan.files {
            let target = staging
                .path()
                .join(Path::new(to).file_name().ok_or("Invalid target")?);
            let original = self.resolve(from)?;
            fs::copy(&original, &target).map_err(|e| e.to_string())?;
            if fs::read(original).map_err(|e| e.to_string())?
                != fs::read(&target).map_err(|e| e.to_string())?
            {
                return Err("Copy verification failed; the source is unchanged.".into());
            }
        }
        // Commit the verified copy first. The original is then retained in internal Trash.
        if self.conversion_preview(source, parent, name)?.revision != revision {
            return Err(
                "The source changed during copying. No files were moved; review another preview."
                    .into(),
            );
        }
        // If a later metadata operation fails, neither copy is discarded.
        fs::rename(staging.path(), self.resolve(&plan.destination)?).map_err(|e| e.to_string())?;
        self.remove(source).map_err(|e| {
            format!(
                "The verified copy is in {}. Original could not be archived: {e}",
                plan.destination
            )
        })?;
        for (from, to) in &plan.files {
            if locks.contains(from) {
                let note = self.read(to)?;
                self.set_locked(to, true, &note.revision)?;
            }
        }
        let mut organizer = self.organizer()?;
        organizer.assignments.remove(source);
        self.save_organizer(organizer)?;
        Ok(plan)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn conversion_previews_preserves_bytes_and_rejects_stale_or_collision() {
        let dir = tempfile::tempdir().unwrap();
        let w = Workspace::new(dir.path().into()).unwrap();
        w.create("", "vault", "Source").unwrap();
        w.create("", "vault", "Target").unwrap();
        w.create("Source", "folder", "One").unwrap();
        w.create("Source/One", "note", "Note").unwrap();
        let note = w.read("Source/One/Note.md").unwrap();
        w.write(&note.path, "---\ntags: [a]\n---\nHello", &note.revision)
            .unwrap();
        let plan = w.conversion_preview("Source", "Target", "Source").unwrap();
        assert_eq!(plan.files[0].1, "Target/Source/One - Note.md");
        assert!(w
            .convert_vault("Source", "Target", "Source", "stale")
            .is_err());
        w.convert_vault("Source", "Target", "Source", &plan.revision)
            .unwrap();
        assert_eq!(
            w.read("Target/Source/One - Note.md").unwrap().content,
            "---\ntags: [a]\n---\nHello"
        );
        assert_eq!(w.list_trash().unwrap().len(), 1);
        assert!(!w.resolve("Source").unwrap().exists());
        assert!(w.conversion_preview("Target", "Target", "Source").is_err());
    }
}
