use rfd::FileDialog;
use std::path::{Path, PathBuf};

const MODEL_EXTENSIONS: &[&str] = &["stl", "obj"];

pub fn pick_open_model() -> Option<String> {
    FileDialog::new()
        .add_filter("3D Models", MODEL_EXTENSIONS)
        .add_filter("All files", &["*"])
        .pick_file()
        .map(|p| p.to_string_lossy().to_string())
}

pub fn get_model_list(
    current_path: &str,
    cache: Option<&(PathBuf, Vec<PathBuf>)>,
) -> Vec<PathBuf> {
    let path = Path::new(current_path);
    let dir = match path.parent() {
        Some(d) => d,
        None => return vec![path.to_path_buf()],
    };

    if let Some((cached_dir, cached_list)) = cache {
        if cached_dir == dir {
            return cached_list.clone();
        }
    }

    let mut models: Vec<PathBuf> = match std::fs::read_dir(dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.is_file()
                    && p.extension()
                        .and_then(|e| e.to_str())
                        .map(|e| {
                            let lower = e.to_lowercase();
                            MODEL_EXTENSIONS.contains(&lower.as_str())
                        })
                        .unwrap_or(false)
            })
            .collect(),
        Err(_) => return vec![path.to_path_buf()],
    };

    models.sort_by(|a, b| {
        a.file_name()
            .unwrap_or_default()
            .to_ascii_lowercase()
            .cmp(&b.file_name().unwrap_or_default().to_ascii_lowercase())
    });

    models
}

fn find_index(models: &[PathBuf], current_path: &str) -> Option<usize> {
    let current = Path::new(current_path);
    models.iter().position(|p| p == current)
}

pub fn get_sibling_model(
    current_path: &str,
    direction: i32,
    cache: Option<&(PathBuf, Vec<PathBuf>)>,
) -> Option<(String, usize, usize)> {
    let models = get_model_list(current_path, cache);
    let current_idx = find_index(&models, current_path)?;
    let new_idx = if direction > 0 {
        (current_idx + 1) % models.len()
    } else {
        (current_idx + models.len() - 1) % models.len()
    };

    Some((
        models[new_idx].to_string_lossy().to_string(),
        new_idx + 1,
        models.len(),
    ))
}

pub fn get_model_position(
    current_path: &str,
    cache: Option<&(PathBuf, Vec<PathBuf>)>,
) -> (usize, usize) {
    let models = get_model_list(current_path, cache);
    let idx = find_index(&models, current_path).unwrap_or(0);
    (idx + 1, models.len())
}
