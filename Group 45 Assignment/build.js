import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

let camera, scene, renderer, controls, helmet, pivot;
let selectedMesh = null;
let originalMaterial = null;
let activeComponent = null;
let defaultMaterials = {};
let defaultTransforms = {};

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const w = window.innerWidth;
const h = window.innerHeight;

camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
camera.position.set(10, 0, 0);
camera.lookAt(0, 0, 0);

scene = new THREE.Scene();

renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement);

controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.enablePan = false;
controls.enableZoom = true;

new HDRLoader()
  .setPath("./background/")
  .load("monochrome_studio_02_4k.hdr", (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.background = texture;
  });

const gltfLoader = new GLTFLoader();
const helmetGlb = await gltfLoader.loadAsync("./models/MCHelmet.glb");
helmet = helmetGlb.scene;

helmet.traverse((child) => {
  if (child.isMesh) {
    defaultMaterials[child.uuid] = child.material.clone();
    defaultTransforms[child.uuid] = {
      scale: child.scale.clone(),
      rotation: child.rotation.clone()
    };
  }
});

const box = new THREE.Box3().setFromObject(helmet);
const center = box.getCenter(new THREE.Vector3());

pivot = new THREE.Group();
helmet.position.sub(center);
pivot.add(helmet);
scene.add(pivot);
enableHelmetRotation(helmet, renderer.domElement);

const highlightMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ffff,
  emissive: 0x00ffff,
  emissiveIntensity: 1,
  metalness: 0.2,
  roughness: 0.3
});

// Material Options
const materials = {
  default: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.4 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 1, roughness: 0.2 }),
  matte: new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.1, roughness: 0.9 }),
  hologram: new THREE.MeshPhongMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.5,
    shininess: 150
  }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1, roughness: 0.2 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0 }),
  carbon: new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x8b3e2f, metalness: 0.1, roughness: 1 })
};


// Add Components/Parts
const components = {
  horns: "./models/Horns.glb",
  crest: "./models/Crest.glb",
  visor: "./models/Visor.glb",
  spikes: "./models/Spikes.glb"
};

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

function onClick(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(helmet, true);

  if (hits.length > 0) selectMesh(hits[0].object);
  else deselectMesh();
}

renderer.domElement.addEventListener("pointerdown", onClick);

const materialSelected = document.getElementById("materialSelected");
const materialList = document.getElementById("materialList");

materialSelected.addEventListener("click", () => {
  materialList.style.display = materialList.style.display === "block" ? "none" : "block";
});

document.querySelectorAll(".mat-option").forEach(opt => {
  opt.addEventListener("click", () => {
    const matName = opt.getAttribute("data-mat");
    materialSelected.textContent = opt.textContent.trim();
    materialList.style.display = "none";

    if (!selectedMesh) return;

    const mat = materials[matName].clone();
    selectedMesh.material = mat;
    originalMaterial = mat;
  });
});

document.getElementById("colorPicker").addEventListener("input", (e) => {
  if (!selectedMesh) return;
  const color = new THREE.Color(e.target.value);
  const mat = selectedMesh.material;
  mat.color.set(color);
  if (mat.emissive) mat.emissive.set(color);
  mat.emissiveIntensity = 0.8;
  mat.needsUpdate = true;
});

const scaleX = document.getElementById("scaleX");
const scaleY = document.getElementById("scaleY");

scaleX.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.scale.x = parseFloat(scaleX.value);
});

scaleY.addEventListener("input", () => {
  if (!selectedMesh) return;
  selectedMesh.scale.y = parseFloat(scaleY.value);
});

const rotX = document.getElementById("rotX");
const rotY = document.getElementById("rotY");
const rotZ = document.getElementById("rotZ");

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

document.getElementById("componentSelect").addEventListener("change", async (e) => {
  if (activeComponent) {
    pivot.remove(activeComponent);
    activeComponent = null;
  }
  if (e.target.value === "none") return;
  const compGlb = await gltfLoader.loadAsync(components[e.target.value]);
  activeComponent = compGlb.scene;
  const box = new THREE.Box3().setFromObject(activeComponent);
  const center = box.getCenter(new THREE.Vector3());
  activeComponent.position.sub(center);
  pivot.add(activeComponent);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  helmet.traverse((child) => {
    if (child.isMesh) {
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

  materialSelected.textContent = "Default";
  document.getElementById("colorPicker").value = "#ffffff";
  document.getElementById("componentSelect").value = "none";
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



function enableHelmetRotation (helmet, domElement, sensitivity = 0.01) {
  let isDragging = false;
  let prevX = 0;

  renderer.domElement.addEventListener("pointerdown", (e) => {
    isDragging = true;
    prevX = e.clientX;
  });

  window.addEventListener("pointerup", () => {
    isDragging = false;
  });

  window.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - prevX;
    pivot.rotation.y += deltaX * sensitivity;
    prevX = e.clientX;
  });
}




