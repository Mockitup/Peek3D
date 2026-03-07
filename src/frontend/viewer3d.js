var Viewer3D = (function() {
  var renderer, scene, camera, controls;
  var currentMesh = null;
  var gridHelper = null;
  var container;
  var animFrameId = null;

  // Settings
  var showWireframe = false;
  var showGrid = true;
  var defaultColor = 0x909090;

  // Lights
  var ambientLight, keyLight, fillLight;

  function init() {
    container = document.getElementById('viewer-container');

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 10000);
    camera.position.set(0, 1, 3);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.8;
    controls.panSpeed = 0.6;
    controls.zoomSpeed = 1.2;

    // Lights: ambient + key + fill
    ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(1, 1.5, 1);
    scene.add(keyLight);

    fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-1, 0.5, -0.5);
    scene.add(fillLight);

    // Grid
    gridHelper = new THREE.GridHelper(10, 20, 0x444444, 0x2a2a2a);
    scene.add(gridHelper);

    animate();
  }

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  function loadModel(type) {
    var url = 'http://peek3d.localhost/model?t=' + Date.now();

    document.getElementById('loading-spinner').classList.add('visible');

    if (type === 'stl') {
      loadSTL(url);
    } else if (type === 'obj') {
      loadOBJ(url);
    }
  }

  function loadSTL(url) {
    fetch(url)
      .then(function(r) { return r.arrayBuffer(); })
      .then(function(buffer) {
        var loader = new THREE.STLLoader();
        var geometry = loader.parse(buffer);
        geometry.computeVertexNormals();
        var material = createMaterial();
        var mesh = new THREE.Mesh(geometry, material);
        setModel(mesh);
        updateModelInfo(geometry);
      })
      .catch(function(e) {
        document.getElementById('loading-spinner').classList.remove('visible');
        if (window.App) App.showError('Failed to load STL: ' + e.message);
      });
  }

  function loadOBJ(url) {
    fetch(url)
      .then(function(r) { return r.text(); })
      .then(function(text) {
        var loader = new THREE.OBJLoader();
        var group = loader.parse(text);
        // Apply default material to all meshes
        var material = createMaterial();
        group.traverse(function(child) {
          if (child.isMesh) {
            child.material = material;
            if (child.geometry) child.geometry.computeVertexNormals();
          }
        });
        setModel(group);
        updateModelInfoGroup(group);
      })
      .catch(function(e) {
        document.getElementById('loading-spinner').classList.remove('visible');
        if (window.App) App.showError('Failed to load OBJ: ' + e.message);
      });
  }

  function createMaterial() {
    return new THREE.MeshPhongMaterial({
      color: defaultColor,
      specular: 0x222222,
      shininess: 60,
      wireframe: showWireframe,
      side: THREE.DoubleSide
    });
  }

  function setModel(object) {
    // Remove previous
    if (currentMesh) {
      scene.remove(currentMesh);
      disposeObject(currentMesh);
    }

    currentMesh = object;
    scene.add(currentMesh);

    // Auto-fit camera
    fitCamera(currentMesh);

    // Adjust grid to model size
    var box = new THREE.Box3().setFromObject(currentMesh);
    var size = new THREE.Vector3();
    box.getSize(size);
    var maxDim = Math.max(size.x, size.y, size.z);
    var gridSize = Math.ceil(maxDim * 2);
    if (gridSize < 2) gridSize = 2;
    scene.remove(gridHelper);
    gridHelper = new THREE.GridHelper(gridSize, gridSize, 0x444444, 0x2a2a2a);
    gridHelper.visible = showGrid;
    scene.add(gridHelper);

    // Hide welcome, show canvas
    document.getElementById('welcome-panel').style.display = 'none';
    document.getElementById('loading-spinner').classList.remove('visible');
  }

  function fitCamera(object) {
    var box = new THREE.Box3().setFromObject(object);
    var center = new THREE.Vector3();
    var size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    var maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) maxDim = 1;

    var fov = camera.fov * (Math.PI / 180);
    var distance = (maxDim / 2) / Math.tan(fov / 2);
    distance *= 1.6;

    // Position camera at an angle
    camera.position.set(
      center.x + distance * 0.5,
      center.y + distance * 0.4,
      center.z + distance * 0.7
    );
    camera.near = distance * 0.001;
    camera.far = distance * 100;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
  }

  function updateModelInfo(geometry) {
    var verts = geometry.attributes.position ? geometry.attributes.position.count : 0;
    var faces = geometry.index ? geometry.index.count / 3 : verts / 3;
    if (window.App) App.updateModelInfo(verts, Math.floor(faces));
  }

  function updateModelInfoGroup(group) {
    var totalVerts = 0;
    var totalFaces = 0;
    group.traverse(function(child) {
      if (child.isMesh && child.geometry) {
        var g = child.geometry;
        var v = g.attributes.position ? g.attributes.position.count : 0;
        var f = g.index ? g.index.count / 3 : v / 3;
        totalVerts += v;
        totalFaces += f;
      }
    });
    if (window.App) App.updateModelInfo(totalVerts, Math.floor(totalFaces));
  }

  function toggleWireframe() {
    showWireframe = !showWireframe;
    if (currentMesh) {
      currentMesh.traverse(function(child) {
        if (child.isMesh && child.material) {
          child.material.wireframe = showWireframe;
        }
      });
    }
    return showWireframe;
  }

  function toggleGrid() {
    showGrid = !showGrid;
    if (gridHelper) gridHelper.visible = showGrid;
    return showGrid;
  }

  function resetCamera() {
    if (currentMesh) fitCamera(currentMesh);
  }

  function onResize() {
    if (!container || !renderer || !camera) return;
    var w = container.clientWidth;
    var h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function updateTheme(isDark) {
    if (renderer) {
      renderer.setClearColor(0x000000, 0);
    }
    if (gridHelper) {
      var primary = isDark ? 0x444444 : 0xaaaaaa;
      var secondary = isDark ? 0x2a2a2a : 0xcccccc;
      scene.remove(gridHelper);
      var size = gridHelper.geometry.parameters;
      // Recreate grid with new colors
      var oldGrid = gridHelper;
      var box = currentMesh ? new THREE.Box3().setFromObject(currentMesh) : null;
      var gridSize = 10;
      if (box) {
        var s = new THREE.Vector3();
        box.getSize(s);
        gridSize = Math.ceil(Math.max(s.x, s.y, s.z) * 2);
        if (gridSize < 2) gridSize = 2;
      }
      gridHelper = new THREE.GridHelper(gridSize, gridSize, primary, secondary);
      gridHelper.visible = showGrid;
      scene.add(gridHelper);
      disposeObject(oldGrid);
    }
  }

  function disposeObject(obj) {
    if (!obj) return;
    obj.traverse(function(child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(function(m) { m.dispose(); });
        } else {
          child.material.dispose();
        }
      }
    });
  }

  return {
    init: init,
    loadModel: loadModel,
    toggleWireframe: toggleWireframe,
    toggleGrid: toggleGrid,
    resetCamera: resetCamera,
    onResize: onResize,
    updateTheme: updateTheme
  };
})();
