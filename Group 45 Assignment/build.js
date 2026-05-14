import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

let camera, scene, renderer, controls, helmet, pivot;
let selectedMesh = null;
let originalMaterial = null;
let activeComponent = null;
let defaultMaterials = {};

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
  if (child.isMesh) defaultMaterials[child.uuid] = child.material.clone();
});

const box = new THREE.Box3().setFromObject(helmet);
const center = box.getCenter(new THREE.Vector3());

pivot = new THREE.Group();
helmet.position.sub(center);
pivot.add(helmet);
scene.add(pivot);

const highlightMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ffff,
  emissive: 0x00ffff,
  emissiveIntensity: 1,
  metalness: 0.2,
  roughness: 0.3
});

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
}

function deselectMesh() {
  if (!selectedMesh) return;
  selectedMesh.material = originalMaterial;
  selectedMesh = null;
  originalMaterial = null;
  document.getElementById("selectedPartLabel").textContent = "No part selected";
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

document.getElementById("materialSelect").addEventListener("change", (e) => {
  if (!selectedMesh) return;
  const mat = materials[e.target.value].clone();
  selectedMesh.material = mat;
  originalMaterial = mat;
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
    if (child.isMesh) child.material = defaultMaterials[child.uuid].clone();
  });
  if (activeComponent) {
    pivot.remove(activeComponent);
    activeComponent = null;
  }
  deselectMesh();
  document.getElementById("materialSelect").value = "default";
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
  pivot.rotation.y += deltaX * 0.01;
  prevX = e.clientX;
});
