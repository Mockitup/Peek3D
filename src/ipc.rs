use serde::Deserialize;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tao::window::Window;
use wry::WebView;

use crate::file_ops;
use crate::state::AppState;

#[derive(Deserialize)]
struct IpcMessage {
    command: String,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    title: Option<String>,
}

pub fn handle_ipc_message(
    msg: &str,
    webview: &WebView,
    window: &Window,
    state: &Arc<Mutex<AppState>>,
) {
    let parsed: IpcMessage = match serde_json::from_str(msg) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("IPC parse error: {e}");
            return;
        }
    };

    match parsed.command.as_str() {
        "open_model" => {
            let path = parsed.path.or_else(file_ops::pick_open_model);
            if let Some(p) = path {
                update_dir_cache(&p, state);
                let cache = state.lock().unwrap().cached_dir.clone();
                let pos = file_ops::get_model_position(&p, cache.as_ref());
                load_and_send_model(webview, &p, Some(pos), state);
            }
        }
        "next_model" => {
            if let Some(ref current) = parsed.path {
                let cache = state.lock().unwrap().cached_dir.clone();
                if let Some((next, idx, total)) =
                    file_ops::get_sibling_model(current, 1, cache.as_ref())
                {
                    update_dir_cache(&next, state);
                    load_and_send_model(webview, &next, Some((idx, total)), state);
                }
            }
        }
        "prev_model" => {
            if let Some(ref current) = parsed.path {
                let cache = state.lock().unwrap().cached_dir.clone();
                if let Some((prev, idx, total)) =
                    file_ops::get_sibling_model(current, -1, cache.as_ref())
                {
                    update_dir_cache(&prev, state);
                    load_and_send_model(webview, &prev, Some((idx, total)), state);
                }
            }
        }
        "set_title" => {
            if let Some(title) = parsed.title {
                window.set_title(&title);
            }
        }
        "window_minimize" => window.set_minimized(true),
        "window_maximize" => window.set_maximized(!window.is_maximized()),
        "window_close" => {
            let inner_size = window.inner_size();
            let outer_pos = window.outer_position().unwrap_or_default();
            crate::window_state::save_window_state(
                (outer_pos.x, outer_pos.y),
                (inner_size.width, inner_size.height),
            );
            std::process::exit(0);
        }
        "drag_enter" => {
            let _ = webview.evaluate_script(
                "document.getElementById('drop-overlay').classList.add('visible')",
            );
        }
        "drag_leave" => {
            let _ = webview.evaluate_script(
                "document.getElementById('drop-overlay').classList.remove('visible')",
            );
        }
        "ready" => {
            let pending = state.lock().unwrap().pending_file.take();
            if let Some(p) = pending {
                update_dir_cache(&p, state);
                let cache = state.lock().unwrap().cached_dir.clone();
                let pos = file_ops::get_model_position(&p, cache.as_ref());
                load_and_send_model(webview, &p, Some(pos), state);
            }
        }
        _ => eprintln!("Unknown IPC command: {}", parsed.command),
    }
}

fn update_dir_cache(path: &str, state: &Arc<Mutex<AppState>>) {
    let file_dir = Path::new(path).parent().map(|d| d.to_path_buf());
    let needs_update = {
        let st = state.lock().unwrap();
        match (&st.cached_dir, &file_dir) {
            (Some((cached, _)), Some(dir)) => cached != dir,
            (None, Some(_)) => true,
            _ => false,
        }
    };
    if needs_update {
        let list = file_ops::get_model_list(path, None);
        if let Some(dir) = file_dir {
            state.lock().unwrap().cached_dir = Some((dir, list));
        }
    }
}

fn load_and_send_model(
    webview: &WebView,
    path: &str,
    position: Option<(usize, usize)>,
    state: &Arc<Mutex<AppState>>,
) {
    match std::fs::read(path) {
        Ok(bytes) => {
            let file_size = bytes.len() as u64;
            let ext = Path::new(path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            {
                let mut st = state.lock().unwrap();
                st.model_bytes = Some(Arc::new(bytes));
                st.model_type = Some(ext.clone());
                st.current_path = Some(path.to_string());
            }

            let (index, total) = position.unwrap_or_else(|| {
                let cache = state.lock().unwrap().cached_dir.clone();
                file_ops::get_model_position(path, cache.as_ref())
            });
            let filename = Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown");

            send_to_js(
                webview,
                "model_ready",
                &serde_json::json!({
                    "path": path,
                    "filename": filename,
                    "file_size": file_size,
                    "model_type": ext,
                    "index": index,
                    "total": total,
                }),
            );
        }
        Err(e) => {
            send_to_js(
                webview,
                "error",
                &serde_json::json!({
                    "message": format!("Failed to read model: {}", e)
                }),
            );
        }
    }
}

fn send_to_js(webview: &WebView, event: &str, data: &serde_json::Value) {
    let script = format!(
        "window.__fromRust({}, {})",
        serde_json::to_string(event).unwrap(),
        serde_json::to_string(data).unwrap(),
    );
    let _ = webview.evaluate_script(&script);
}
