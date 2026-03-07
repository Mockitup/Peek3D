use std::path::PathBuf;
use std::sync::Arc;

pub struct AppState {
    pub model_bytes: Option<Arc<Vec<u8>>>,
    pub model_type: Option<String>,
    pub current_path: Option<String>,
    pub html: String,
    pub pending_file: Option<String>,
    pub cached_dir: Option<(PathBuf, Vec<PathBuf>)>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            model_bytes: None,
            model_type: None,
            current_path: None,
            html: String::new(),
            pending_file: None,
            cached_dir: None,
        }
    }
}
