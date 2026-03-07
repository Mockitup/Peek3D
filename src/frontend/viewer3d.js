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

  // Orient mode
  var orientMode = false;
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var highlightMesh = null;

  // Lights
  var ambientLight, keyLight, fillLight, cameraLight;

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

    // Lights: ambient + key + fill + camera-attached
    ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
    keyLight.position.set(1, 1.5, 1);
    scene.add(keyLight);

    fillLight = new THREE.DirectionalLight(0xffffff, 0.2);
    fillLight.position.set(-1, 0.5, -0.5);
    scene.add(fillLight);

    // Subtle light that follows the camera so the viewed side always has definition
    cameraLight = new THREE.DirectionalLight(0xffffff, 0.35);
    camera.add(cameraLight);
    cameraLight.position.set(0, 0.5, 1);
    scene.add(camera);

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

    // Center model at origin with bottom on grid (Y=0)
    centerModel(currentMesh);

    scene.add(currentMesh);

    // Adjust grid to model size
    var box = new THREE.Box3().setFromObject(currentMesh);
    var size = new THREE.Vector3();
    box.getSize(size);
    var maxDim = Math.max(size.x, size.y, size.z);
    var gridSize = Math.ceil(maxDim * 2);
    if (gridSize < 2) gridSize = 2;
    scene.remove(gridHelper);
    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    gridHelper = new THREE.GridHelper(gridSize, gridSize,
      isDark ? 0x444444 : 0xaaaaaa, isDark ? 0x2a2a2a : 0xcccccc);
    gridHelper.visible = showGrid;
    scene.add(gridHelper);

    // Fit camera to centered model
    fitCamera();

    // Hide welcome, show canvas
    document.getElementById('welcome-panel').style.display = 'none';
    document.getElementById('loading-spinner').classList.remove('visible');
  }

  function centerModel(object) {
    // Reset position so bounding box reflects only geometry + rotation
    object.position.set(0, 0, 0);

    // Precise bounding box (iterates actual vertices, not transformed AABB)
    // Needed because a rotated AABB overestimates and causes hovering
    var box = new THREE.Box3().setFromObject(object, true);
    var center = new THREE.Vector3();
    box.getCenter(center);

    // Offset: center X/Z at origin, bottom of bounding box at Y=0
    object.position.set(
      -center.x,
      -box.min.y,
      -center.z
    );
  }

  function fitCamera() {
    if (!currentMesh) return;
    var box = new THREE.Box3().setFromObject(currentMesh);
    var center = new THREE.Vector3();
    var size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    var maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) maxDim = 1;

    var fov = camera.fov * (Math.PI / 180);
    var distance = (maxDim / 2) / Math.tan(fov / 2);
    distance *= 1.6;

    // Position camera at an angle, looking at center of the placed model
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
    fitCamera();
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

  // ==========================================
  // Orient mode: click a face to make it the ground
  // ==========================================

  function toggleOrientMode() {
    if (!currentMesh) return false;
    orientMode = !orientMode;
    if (orientMode) {
      controls.enabled = false;
      renderer.domElement.style.cursor = 'crosshair';
      renderer.domElement.addEventListener('mousemove', onOrientMouseMove);
      renderer.domElement.addEventListener('click', onOrientClick);
    } else {
      exitOrientMode();
    }
    return orientMode;
  }

  function exitOrientMode() {
    orientMode = false;
    controls.enabled = true;
    renderer.domElement.style.cursor = '';
    renderer.domElement.removeEventListener('mousemove', onOrientMouseMove);
    renderer.domElement.removeEventListener('click', onOrientClick);
    clearHighlight();
  }

  function onOrientMouseMove(e) {
    if (!orientMode || !currentMesh) return;
    updateMouse(e);
    raycaster.setFromCamera(mouse, camera);

    var meshes = [];
    currentMesh.traverse(function(c) { if (c.isMesh) meshes.push(c); });
    var hits = raycaster.intersectObjects(meshes, false);

    if (hits.length > 0) {
      highlightFace(hits[0]);
      renderer.domElement.style.cursor = 'crosshair';
    } else {
      clearHighlight();
    }
  }

  function onOrientClick(e) {
    if (!orientMode || !currentMesh) return;
    updateMouse(e);
    raycaster.setFromCamera(mouse, camera);

    var meshes = [];
    currentMesh.traverse(function(c) { if (c.isMesh) meshes.push(c); });
    var hits = raycaster.intersectObjects(meshes, false);

    if (hits.length > 0) {
      var faceNormal = hits[0].face.normal.clone();
      // Transform normal from object local space to world space
      var normalMatrix = new THREE.Matrix3().getNormalMatrix(hits[0].object.matrixWorld);
      faceNormal.applyMatrix3(normalMatrix).normalize();

      orientToGround(faceNormal);
    }
    exitOrientMode();
    if (window.App) App.onOrientDone();
  }

  function updateMouse(e) {
    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function highlightFace(hit) {
    clearHighlight();
    var face = hit.face;
    var geo = hit.object.geometry;
    var posAttr = geo.attributes.position;

    // Build a small triangle mesh to highlight the picked face
    var indices;
    if (geo.index) {
      var idx = hit.faceIndex * 3;
      indices = [geo.index.getX(idx), geo.index.getX(idx + 1), geo.index.getX(idx + 2)];
    } else {
      var idx = hit.faceIndex * 3;
      indices = [idx, idx + 1, idx + 2];
    }

    var positions = new Float32Array(9);
    for (var i = 0; i < 3; i++) {
      positions[i * 3]     = posAttr.getX(indices[i]);
      positions[i * 3 + 1] = posAttr.getY(indices[i]);
      positions[i * 3 + 2] = posAttr.getZ(indices[i]);
    }

    var hlGeo = new THREE.BufferGeometry();
    hlGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var hlMat = new THREE.MeshBasicMaterial({
      color: 0xe0a47a,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthTest: false
    });
    highlightMesh = new THREE.Mesh(hlGeo, hlMat);
    highlightMesh.renderOrder = 999;
    // Place highlight in the same transform as the hit object
    highlightMesh.matrixAutoUpdate = false;
    highlightMesh.matrix.copy(hit.object.matrixWorld);
    scene.add(highlightMesh);
  }

  function clearHighlight() {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh.geometry.dispose();
      highlightMesh.material.dispose();
      highlightMesh = null;
    }
  }

  function orientToGround(faceNormal) {
    // Rotate model so faceNormal points down (-Y)
    var down = new THREE.Vector3(0, -1, 0);
    var quat = new THREE.Quaternion().setFromUnitVectors(faceNormal, down);

    // Animate the rotation
    var startQuat = currentMesh.quaternion.clone();
    var targetQuat = quat.multiply(startQuat);
    var startTime = performance.now();
    var duration = 300;

    function animateOrient() {
      var elapsed = performance.now() - startTime;
      var t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      t = 1 - Math.pow(1 - t, 3);

      currentMesh.quaternion.slerpQuaternions(startQuat, targetQuat, t);

      if (t < 1) {
        requestAnimationFrame(animateOrient);
      } else {
        // Rotation done — re-center with bottom on grid and rebuild grid
        centerModel(currentMesh);
        rebuildGrid();
        fitCamera();
      }
    }
    animateOrient();
  }

  function rebuildGrid() {
    var box = new THREE.Box3().setFromObject(currentMesh);
    var size = new THREE.Vector3();
    box.getSize(size);
    var maxDim = Math.max(size.x, size.y, size.z);
    var gridSize = Math.ceil(maxDim * 2);
    if (gridSize < 2) gridSize = 2;
    scene.remove(gridHelper);
    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    var oldGrid = gridHelper;
    gridHelper = new THREE.GridHelper(gridSize, gridSize,
      isDark ? 0x444444 : 0xaaaaaa, isDark ? 0x2a2a2a : 0xcccccc);
    gridHelper.visible = showGrid;
    scene.add(gridHelper);
    if (oldGrid) disposeObject(oldGrid);
  }

  function isOrientMode() {
    return orientMode;
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
    updateTheme: updateTheme,
    toggleOrientMode: toggleOrientMode,
    isOrientMode: isOrientMode
  };
})();
