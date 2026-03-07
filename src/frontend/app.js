// IPC Bridge
function sendToRust(command, data) {
  var msg = JSON.stringify(Object.assign({ command: command }, data || {}));
  window.ipc.postMessage(msg);
}

// State
var currentPath = null;

// Rust -> JS
window.__fromRust = function(event, data) {
  switch (event) {
    case 'model_ready':
      currentPath = data.path;
      Viewer3D.loadModel(data.model_type);
      updateStatusBar(data);
      setTitle(data.filename);
      sendToRust('set_title', { title: 'Peek3D - ' + data.filename });
      break;
    case 'error':
      document.getElementById('loading-spinner').classList.remove('visible');
      showError(data.message);
      break;
  }
};

// App namespace (used by viewer3d.js)
var App = {
  updateModelInfo: function(verts, faces) {
    document.getElementById('status-vertices').textContent = formatNumber(verts) + ' verts';
    document.getElementById('status-faces').textContent = formatNumber(faces) + ' faces';
  },
  showError: function(msg) { showError(msg); },
  onOrientDone: function() {
    document.getElementById('btn-orient').classList.remove('active');
  }
};

function setTitle(title) {
  document.getElementById('titlebar-title').textContent = title;
}

function updateStatusBar(data) {
  clearError();
  document.getElementById('status-filename').textContent = data.filename;
  document.getElementById('status-filesize').textContent = formatFileSize(data.file_size);
  document.getElementById('status-vertices').textContent = '';
  document.getElementById('status-faces').textContent = '';
  lastNavText = data.total > 1 ? data.index + ' / ' + data.total : '';
  document.getElementById('status-nav').textContent = lastNavText;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return '' + n;
}

var errorTimer = null;
function showError(message) {
  var el = document.getElementById('status-filename');
  el.textContent = 'Error: ' + message;
  el.style.color = 'var(--danger)';
  clearTimeout(errorTimer);
  errorTimer = setTimeout(function() { el.style.color = ''; }, 5000);
}

function clearError() {
  var el = document.getElementById('status-filename');
  el.style.color = '';
  clearTimeout(errorTimer);
}

var lastNavText = '';

// Zoom Toast
function showZoomToast(text) {
  var toast = document.getElementById('zoom-toast');
  toast.textContent = text;
  toast.classList.add('visible');
  clearTimeout(showZoomToast._timer);
  showZoomToast._timer = setTimeout(function() {
    toast.classList.remove('visible');
  }, 800);
}

// Toolbar Buttons
document.getElementById('btn-open').addEventListener('click', function() {
  sendToRust('open_model');
});
document.getElementById('btn-prev').addEventListener('click', function() {
  if (currentPath) sendToRust('prev_model', { path: currentPath });
});
document.getElementById('btn-next').addEventListener('click', function() {
  if (currentPath) sendToRust('next_model', { path: currentPath });
});
document.getElementById('btn-wireframe').addEventListener('click', function() {
  var active = Viewer3D.toggleWireframe();
  this.classList.toggle('active', active);
  showZoomToast(active ? 'Wireframe ON' : 'Wireframe OFF');
});
document.getElementById('btn-grid').addEventListener('click', function() {
  var active = Viewer3D.toggleGrid();
  this.classList.toggle('active', active);
  showZoomToast(active ? 'Grid ON' : 'Grid OFF');
});
document.getElementById('btn-reset').addEventListener('click', function() {
  Viewer3D.resetCamera();
});
document.getElementById('btn-orient').addEventListener('click', function() {
  var active = Viewer3D.toggleOrientMode();
  this.classList.toggle('active', active);
  showZoomToast(active ? 'Click a face to orient to ground' : 'Orient cancelled');
});

// Window Controls
document.getElementById('btn-minimize').addEventListener('click', function() { sendToRust('window_minimize'); });
document.getElementById('btn-maximize').addEventListener('click', function() { sendToRust('window_maximize'); });
document.getElementById('btn-close').addEventListener('click', function() { sendToRust('window_close'); });

// Theme
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('icon-sun').style.display = theme === 'light' ? '' : 'none';
  document.getElementById('icon-moon').style.display = theme === 'light' ? 'none' : '';
  Viewer3D.updateTheme(theme === 'dark');
  try { localStorage.setItem('peek3d-theme', theme); } catch(e) {}
}

document.getElementById('btn-theme').addEventListener('click', function() {
  var current = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(current === 'dark' ? 'light' : 'dark');
});

// Keyboard Shortcuts
document.addEventListener('keydown', function(e) {
  // Escape cancels orient mode
  if (e.key === 'Escape' && Viewer3D.isOrientMode()) {
    e.preventDefault();
    Viewer3D.toggleOrientMode();
    document.getElementById('btn-orient').classList.remove('active');
    showZoomToast('Orient cancelled');
    return;
  }

  if (e.ctrlKey && e.key === 'o' && !e.shiftKey) {
    e.preventDefault();
    sendToRust('open_model');
  } else if (!e.ctrlKey && !e.altKey) {
    // Block other shortcuts while in orient mode
    if (Viewer3D.isOrientMode()) return;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (currentPath) sendToRust('prev_model', { path: currentPath });
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (currentPath) sendToRust('next_model', { path: currentPath });
        break;
      case 'w':
      case 'W':
        e.preventDefault();
        var wf = Viewer3D.toggleWireframe();
        document.getElementById('btn-wireframe').classList.toggle('active', wf);
        showZoomToast(wf ? 'Wireframe ON' : 'Wireframe OFF');
        break;
      case 'e':
      case 'E':
        e.preventDefault();
        var orient = Viewer3D.toggleOrientMode();
        document.getElementById('btn-orient').classList.toggle('active', orient);
        showZoomToast(orient ? 'Click a face to orient to ground' : 'Orient cancelled');
        break;
      case 'g':
      case 'G':
        e.preventDefault();
        var gr = Viewer3D.toggleGrid();
        document.getElementById('btn-grid').classList.toggle('active', gr);
        showZoomToast(gr ? 'Grid ON' : 'Grid OFF');
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        Viewer3D.resetCamera();
        break;
    }
  }
});

// Resize handling
var resizeTimer = null;
window.addEventListener('resize', function() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function() {
    Viewer3D.onResize();
  }, 50);
});

// Init
document.addEventListener('DOMContentLoaded', function() {
  Viewer3D.init();
  var saved = null;
  try { saved = localStorage.getItem('peek3d-theme'); } catch(e) {}
  if (saved) setTheme(saved);
  sendToRust('ready');
});
