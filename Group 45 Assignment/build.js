import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

let camera, scene, renderer, controls, helmet, pivot;
let selectedMesh = null;
let originalMaterial = null;
let activeComponent = null;
let defaultMaterials = {};
let defaultTransforms = {};
let currentTemplate = "MCHelmetV2.glb";

let activeSlot = localStorage.getItem("activeSlot");

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let draggingMove = false;
let draggingRotate = false;
let prevX = 0;
let prevY = 0;

camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(10, 0, 0);
camera.lookAt(0, 0, 0);

scene = new THREE.Scene();

renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.enablePan = false;
controls.enableZoom = true;

new RGBELoader()
  .setPath("./background/")
  .load("monochrome_studio_02_4k.hdr", t => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = t;
    scene.background = t;
  });

const components = {
  horns: "./models/Horns.glb"
};

const gltfLoader = new GLTFLoader();

pivot = new THREE.Group();
scene.add(pivot);

const scaleX = document.getElementById("scaleX");
const scaleY = document.getElementById("scaleY");
const rotX = document.getElementById("rotX");
const rotY = document.getElementById("rotY");
const rotZ = document.getElementById("rotZ");

const highlightMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ffff,
  emissive: 0x00ffff,
  emissiveIntensity: 1,
  metalness: 0.2,
  roughness: 0.3
});

async function loadHelmetTemplate(file) {
  currentTemplate = file;

  if (helmet) pivot.remove(helmet);
  if (activeComponent) {
    pivot.remove(activeComponent);
    activeComponent = null;
  }

  const glb = await gltfLoader.loadAsync("./models/" + file);
  helmet = glb.scene;

  defaultMaterials = {};
  defaultTransforms = {};

  helmet.traverse(child => {
    if (child.isMesh) {
      defaultMaterials[child.uuid] = child.material.clone();
      defaultTransforms[child.uuid] = {
        scale: child.scale.clone(),
        rotation: child.rotation.clone()
      };
    }
  });

  const savedPaint = JSON.parse(localStorage.getItem("paintModeData") || "{}");
  const vertexColors = savedPaint.vertexColors || {};

  helmet.traverse(child => {
    if (!child.isMesh) return;
    // Paint is now stored as per-vertex colors keyed by mesh name.
    const colorData = vertexColors[child.name];
    if (colorData) {
      const geo = child.geometry;
      const count = geo.attributes.position.count;
      if (colorData.length === count * 3) {
        geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colorData), 3));
        child.material.vertexColors = true;
        child.material.map = null;
        child.material.color.set(0xffffff);
        child.material.needsUpdate = true;
      }
    }
  });

  const box = new THREE.Box3().setFromObject(helmet);
  const center = box.getCenter(new THREE.Vector3());
  helmet.position.sub(center);

  pivot.add(helmet);
  deselectMesh();
}

await loadHelmetTemplate("MCHelmetV2.glb");

function isInActiveComponent(obj) {
  if (!activeComponent) return false;
  let current = obj;
  while (current) {
    if (current === activeComponent) return true;
    current = current.parent;
  }
  return false;
}

function selectMesh(mesh) {
  if (selectedMesh) selectedMesh.material = originalMaterial;
  selectedMesh = mesh;
  originalMaterial = mesh.material;
  mesh.material = highlightMaterial;

  document.getElementById("selectedPartLabel").textContent = mesh.name;

  scaleX.value = mesh.scale.x;
  scaleY.value = mesh.scale.y;

  rotX.value = THREE.MathUtils.radToDeg(mesh.rotation.x);
  rotY.value = THREE.MathUtils.radToDeg(mesh.rotation.y);
  rotZ.value = THREE.MathUtils.radToDeg(mesh.rotation.z);
}

function deselectMesh() {
  if (!selectedMesh) return;
  selectedMesh.material = originalMaterial;
  selectedMesh = null;
  originalMaterial = null;

  document.getElementById("selectedPartLabel").textContent = "No part selected";

  scaleX.value = 1;
  scaleY.value = 1;
  rotX.value = 0;
  rotY.value = 0;
  rotZ.value = 0;
}

renderer.domElement.addEventListener("pointerdown", e => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(pivot, true);

  if (hits.length > 0) {
    const obj = hits[0].object;

    selectMesh(obj);

    if (isInActiveComponent(obj)) {
      draggingMove = true;
      prevX = e.clientX;
      prevY = e.clientY;
    } else {
      draggingRotate = true;
      prevX = e.clientX;
    }
  } else {
    deselectMesh();
    draggingRotate = true;
    prevX = e.clientX;
  }
});

window.addEventListener("pointermove", e => {
  if (draggingMove && selectedMesh && isInActiveComponent(selectedMesh)) {
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;

    selectedMesh.position.z += dx * 0.02;
    selectedMesh.position.y -= dy * 0.02;

    prevX = e.clientX;
    prevY = e.clientY;
  } else if (draggingRotate) {
    const deltaX = e.clientX - prevX;
    pivot.rotation.y += deltaX * 0.01;
    prevX = e.clientX;
  }
});

window.addEventListener("pointerup", () => {
  draggingMove = false;
  draggingRotate = false;
});

document.querySelectorAll(".template-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    const file = btn.getAttribute("data-template");
    currentTemplate = file;
    await loadHelmetTemplate(file);
  });
});

document.getElementById("componentSelect").addEventListener("change", async e => {
  if (activeComponent) {
    pivot.remove(activeComponent);
    activeComponent = null;
  }

  if (e.target.value === "none") return;

  const compGlb = await gltfLoader.loadAsync(components[e.target.value]);
  activeComponent = new THREE.Group();

  compGlb.scene.traverse(child => {
    if (child.isMesh) {
      child.name = e.target.value + "_" + (child.name || "mesh");
      defaultMaterials[child.uuid] = child.material.clone();
      defaultTransforms[child.uuid] = {
        scale: child.scale.clone(),
        rotation: child.rotation.clone()
      };
      activeComponent.add(child);
    }
  });

  const cbox = new THREE.Box3().setFromObject(activeComponent);
  const ccenter = cbox.getCenter(new THREE.Vector3());
  activeComponent.position.sub(ccenter);

  pivot.add(activeComponent);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  pivot.traverse(child => {
    if (child.isMesh && defaultMaterials[child.uuid] && defaultTransforms[child.uuid]) {
      child.material = defaultMaterials[child.uuid].clone();
      child.scale.copy(defaultTransforms[child.uuid].scale);
      child.rotation.copy(defaultTransforms[child.uuid].rotation);
    }
  });

  if (activeComponent) {
    pivot.remove(activeComponent);
    activeComponent = null;
  }

  deselectMesh();

  document.getElementById("colorPicker").value = "#ffffff";
  document.getElementById("componentSelect").value = "none";
});

document.getElementById("colorPicker").addEventListener("input", e => {
  if (!selectedMesh) return;
  const color = new THREE.Color(e.target.value);
  const mat = selectedMesh.material;
  mat.color.set(color);
  if (mat.emissive) mat.emissive.set(color);
  mat.emissiveIntensity = 0.8;
  mat.needsUpdate = true;
});

scaleX.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.scale.x = parseFloat(scaleX.value);
});

scaleY.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.scale.y = parseFloat(scaleY.value);
});

rotX.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.rotation.x = THREE.MathUtils.degToRad(rotX.value);
});

rotY.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.rotation.y = THREE.MathUtils.degToRad(rotY.value);
});

rotZ.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.rotation.z = THREE.MathUtils.degToRad(rotZ.value);
});

document.getElementById("saveBtn").addEventListener("click", () => {
  if (!activeSlot) return;

  const saveData = {
    template: currentTemplate,
    materials: {},
    transforms: {},
    component: document.getElementById("componentSelect").value
  };

  pivot.traverse(child => {
    if (child.isMesh) {
      saveData.materials[child.name] = {
        color: child.material.color.getHex(),
        emissive: child.material.emissive ? child.material.emissive.getHex() : null
      };
      saveData.transforms[child.name] = {
        scale: child.scale.toArray(),
        rotation: [child.rotation.x, child.rotation.y, child.rotation.z],
        position: child.position.toArray()
      };
    }
  });

  localStorage.setItem("slot" + activeSlot, JSON.stringify(saveData));

  window.location.href = "index.html";
});

window.saveCurrentDesign = function () {
  const saveData = {
    template: currentTemplate,
    materials: {},
    transforms: {},
    component: document.getElementById("componentSelect").value
  };

  pivot.traverse(child => {
    if (child.isMesh) {
      saveData.materials[child.name] = {
        color: child.material.color.getHex(),
        emissive: child.material.emissive ? child.material.emissive.getHex() : null
      };
      saveData.transforms[child.name] = {
        scale: child.scale.toArray(),
        rotation: [child.rotation.x, child.rotation.y, child.rotation.z],
        position: child.position.toArray()
      };
    }
  });

  localStorage.setItem("paintModeData", JSON.stringify(saveData));
};

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  controls.update();
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});