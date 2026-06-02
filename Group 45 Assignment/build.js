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

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let draggingMove = false;
let draggingRotate = false;
let prevX = 0;
let prevY = 0;

const validTemplates = [
  "MCHelmetV2.glb",
  "SpikeHelmetV2.glb",
  "CrownV2.glb"
];

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

  const activeSlot = localStorage.getItem("activeSlot");
  const saved = JSON.parse(localStorage.getItem("slot" + activeSlot) || "{}");

  helmet.traverse(child => {
    if (child.isMesh && saved.paintTexture) {
      const tex = new THREE.TextureLoader().load(saved.paintTexture);
      tex.flipY = false;
      child.material.map = tex;
      child.material.needsUpdate = true;
    }
  });

  const box = new THREE.Box3().setFromObject(helmet);
  const center = box.getCenter(new THREE.Vector3());
  helmet.position.sub(center);

  pivot.add(helmet);
  deselectMesh();

  applySavedData(saved);
}

function applySavedData(saved) {
  if (!saved.transforms) return;

  pivot.traverse(child => {
    if (child.isMesh && saved.transforms[child.name]) {
      const t = saved.transforms[child.name];
      child.scale.fromArray(t.scale);
      child.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2]);
      child.position.fromArray(t.position);
    }
    if (child.isMesh && saved.materials && saved.materials[child.name]) {
      const m = saved.materials[child.name];
      child.material.color.setHex(m.color);
      if (child.material.emissive && m.emissive !== null) {
        child.material.emissive.setHex(m.emissive);
      }
    }
  });

  if (saved.component && saved.component !== "none") {
    loadComponent(saved.component);
  }
}

async function loadComponent(name) {
  const compGlb = await gltfLoader.loadAsync(components[name]);
  activeComponent = new THREE.Group();

  compGlb.scene.traverse(child => {
    if (child.isMesh) {
      child.name = name + "_" + (child.name || "mesh");
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
}

await loadHelmetTemplate("MCHelmetV2.glb");

function autoSave() {
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
}

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
    autoSave();
  } else if (draggingRotate) {
    const deltaX = e.clientX - prevX;
    pivot.rotation.y += deltaX * 0.01;
    prevX = e.clientX;
    autoSave();
  }
});

window.addEventListener("pointerup", () => {
  draggingMove = false;
  draggingRotate = false;
});

document.querySelectorAll(".template-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    const file = btn.getAttribute("data-template");
    if (!validTemplates.includes(file)) return;
    currentTemplate = file;
    await loadHelmetTemplate(file);
    autoSave();
  });
});

document.getElementById("componentSelect").addEventListener("change", async e => {
  if (activeComponent) {
    pivot.remove(activeComponent);
    activeComponent = null;
  }
  if (e.target.value === "none") {
    autoSave();
    return;
  }
  await loadComponent(e.target.value);
  autoSave();
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
  autoSave();
});

document.getElementById("colorPicker").addEventListener("input", e => {
  if (!selectedMesh) return;
  const color = new THREE.Color(e.target.value);
  selectedMesh.material.color.set(color);
  if (selectedMesh.material.emissive) {
    selectedMesh.material.emissive.set(color);
  }
  if (originalMaterial) {
    originalMaterial.color.set(color);
    if (originalMaterial.emissive) {
      originalMaterial.emissive.set(color);
    }
  }
  autoSave();
});

scaleX.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.scale.x = parseFloat(scaleX.value);
  autoSave();
});

scaleY.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.scale.y = parseFloat(scaleY.value);
  autoSave();
});

rotX.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.rotation.x = THREE.MathUtils.degToRad(rotX.value);
  autoSave();
});

rotY.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.rotation.y = THREE.MathUtils.degToRad(rotY.value);
  autoSave();
});

rotZ.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.rotation.z = THREE.MathUtils.degToRad(rotZ.value);
  autoSave();
});

document.getElementById("paintPageBtn").addEventListener("click", () => {
  window.location.href = "PaintPage.html";
});

document.getElementById("returnToSlotsBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});

document.getElementById("saveBtn").addEventListener("click", () => {
  const slot = localStorage.getItem("activeSlot");
  if (!slot) {
    alert("No save slot selected!");
    return;
  }
  autoSave();
  localStorage.setItem("slot" + slot, localStorage.getItem("paintModeData"));
  alert("Design saved!");
});

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































