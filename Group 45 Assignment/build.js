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

let activeSlot = localStorage.getItem("activeSlot") || "1";

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

const rgbeLoader = new RGBELoader().setPath("./background/");

function loadBackground(fileName) {
  rgbeLoader.load(fileName, t => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = t;   // affects reflections/lighting
    scene.background = t;     // the visible backdrop
  });
}

// initial background
loadBackground("monochrome_studio_02_4k.hdr");

const components = {
  horns: "./models/Horns.glb",
  crown: "./models/CrownV2.glb",
  halo: "./models/Halo.glb",
  flower: "./models/Flower.glb"
};

const randomTemplates = [
  "MCHelmetV2.glb",
  "SpikeHelmetV2.glb",
  "Helmet3.glb"
];

const randomAccessories = [
  "horns",
  "crown",
  "halo",
  "flower"
];

let uploadedTexture = null;
let presetTexture = null;
let currentPresetTextureFile = null;

function loadPresetTexture(fileName) {
  if (fileName === "none") {
    presetTexture = null;
    currentPresetTextureFile = null;
    return;
  }

  currentPresetTextureFile = fileName;

  presetTexture = new THREE.TextureLoader().load(
    "./materials/" + fileName,
    texture => {
      texture.flipY = false;
      texture.needsUpdate = true;
    }
  );
}


function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function registerDefaults(mesh) {
  defaultMaterials[mesh.uuid] = mesh.material.clone();
  defaultTransforms[mesh.uuid] = {
    scale: mesh.scale.clone(),
    rotation: mesh.rotation.clone(),
    position: mesh.position.clone()
  };
}

function findMeshByKeyword(root, keywords) {
  let result = null;

  root.traverse(child => {
    if (!child.isMesh || result) return;

    const name = child.name.toLowerCase();

    if (keywords.some(keyword => name.includes(keyword))) {
      result = child;
    }
  });

  return result;
}

async function getPartFromTemplate(file, keywords, newName) {
  const glb = await gltfLoader.loadAsync("./models/" + file);
  const root = glb.scene;

  root.updateMatrixWorld(true);

  const sourceMesh = findMeshByKeyword(root, keywords);

  if (!sourceMesh) {
    console.warn("Could not find part:", newName, "in", file);
    return null;
  }

  const clone = new THREE.Mesh(
    sourceMesh.geometry.clone(),
    sourceMesh.material.clone()
  );

  clone.name = newName;
  clone.userData.id = newName;

  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();

  sourceMesh.getWorldPosition(worldPosition);
  sourceMesh.getWorldQuaternion(worldQuaternion);
  sourceMesh.getWorldScale(worldScale);

  clone.position.copy(worldPosition);
  clone.quaternion.copy(worldQuaternion);
  clone.scale.copy(worldScale);

  registerDefaults(clone);

  return clone;
}

async function getAccessory(type) {
  const glb = await gltfLoader.loadAsync(components[type]);
  const group = new THREE.Group();
  group.name = type + "_Accessory";

  glb.scene.updateMatrixWorld(true);

  glb.scene.traverse(child => {
    if (child.isMesh) {
      const clone = new THREE.Mesh(
        child.geometry.clone(),
        child.material.clone()
      );

      clone.name = type + "_" + child.name;
      clone.userData.id = clone.name;

      const worldPosition = new THREE.Vector3();
      const worldQuaternion = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();

      child.getWorldPosition(worldPosition);
      child.getWorldQuaternion(worldQuaternion);
      child.getWorldScale(worldScale);

      clone.position.copy(worldPosition);
      clone.quaternion.copy(worldQuaternion);
      clone.scale.copy(worldScale);

      registerDefaults(clone);
      group.add(clone);
    }
  });

  return group;
}

function applyTextureToMesh(mesh, texture, textureFileName = null) {
  if (!mesh || !texture) return;

  const targetMaterial = mesh === selectedMesh && originalMaterial
    ? originalMaterial
    : mesh.material;

  targetMaterial.map = texture;
  targetMaterial.color.set(0xffffff);

  if (targetMaterial.emissive) {
    targetMaterial.emissive.set(0x000000);
  }

  targetMaterial.needsUpdate = true;

  mesh.userData.textureFile = textureFileName;
}

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

  deselectMesh();

  while (pivot.children.length > 0) {
    pivot.remove(pivot.children[0]);
  }

  helmet = null;
  activeComponent = null;
  selectedMesh = null;
  originalMaterial = null;

  const glb = await gltfLoader.loadAsync("./models/" + file);
  helmet = glb.scene;

  const saved = {};
  const savedIDs = saved.meshIDs || [];

  let index = 0;

  defaultMaterials = {};
  defaultTransforms = {};

  helmet.traverse(child => {
    if (child.isMesh) {
      const id = savedIDs[index] || ("mesh_" + index);
      child.userData.id = id;
      defaultMaterials[id] = child.material.clone();
      defaultTransforms[id] = {
        scale: child.scale.clone(),
        rotation: child.rotation.clone(),
        position: child.position.clone()
      };
      index++;
    }
  });

  const vertexColors = saved.vertexColors || {};

  helmet.traverse(child => {
    if (!child.isMesh) return;
    const id = child.userData.id;
    const colorData = vertexColors[id];
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

  applySavedData(saved);

  const box = new THREE.Box3().setFromObject(helmet);
  const center = box.getCenter(new THREE.Vector3());
  helmet.position.sub(center);

  pivot.add(helmet);
  deselectMesh();
}

async function loadSavedDesign() {
  const saved = JSON.parse(localStorage.getItem("slot" + activeSlot) || "{}");

  if (!saved.template) return;

  await loadHelmetTemplate(saved.template);

  if (saved.component && saved.component !== "none") {
    document.getElementById("componentSelect").value = saved.component;
    activeComponent = await getAccessory(saved.component);
    pivot.add(activeComponent);
  }

  applySavedData(saved);
}

function applySavedData(saved) {
  if (!saved.transforms) return;

  pivot.traverse(child => {
    if (!child.isMesh) return;
    const id = child.userData.id;

    if (saved.transforms[id]) {
      const t = saved.transforms[id];
      child.scale.fromArray(t.scale);
      child.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2]);
      child.position.fromArray(t.position);
    }

   if (saved.materials && saved.materials[id]) {
  const m = saved.materials[id];

  child.material.color.setHex(m.color);

  if (child.material.emissive && m.emissive !== null) {
    child.material.emissive.setHex(m.emissive);
  }

  if (m.textureFile) {
    const tex = new THREE.TextureLoader().load(
      "./materials/" + m.textureFile,
      texture => {
        texture.flipY = false;
        texture.needsUpdate = true;
      }
    );

    child.material.map = tex;
    child.material.color.set(0xffffff);

    if (child.material.emissive) {
      child.material.emissive.set(0x000000);
    }

    child.material.needsUpdate = true;
    child.userData.textureFile = m.textureFile;
  }
}

if (saved.vertexColors && saved.vertexColors[id]) {
  const geo = child.geometry;
  const colorData = saved.vertexColors[id];

  if (colorData.length === geo.attributes.position.count * 3) {
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(colorData), 3)
    );

    child.material.vertexColors = true;
    child.material.map = null;
    child.material.color.set(0xffffff);

    if (child.material.emissive) {
      child.material.emissive.set(0x000000);
    }

    child.material.needsUpdate = true;
  }
}
  });

}

async function loadComponent(name) {
  const compGlb = await gltfLoader.loadAsync(components[name]);

  activeComponent = new THREE.Group();
  activeComponent.name = name + "_Component";

  compGlb.scene.updateMatrixWorld(true);

  let index = 0;

  compGlb.scene.traverse(child => {
    if (child.isMesh) {
      const clone = new THREE.Mesh(
        child.geometry.clone(),
        child.material.clone()
      );

      clone.name = name + "_" + child.name;
      clone.userData.id = name + "_" + index;

      const worldPosition = new THREE.Vector3();
      const worldQuaternion = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();

      child.getWorldPosition(worldPosition);
      child.getWorldQuaternion(worldQuaternion);
      child.getWorldScale(worldScale);

      clone.position.copy(worldPosition);
      clone.quaternion.copy(worldQuaternion);
      clone.scale.copy(worldScale);

      defaultMaterials[clone.userData.id] = clone.material.clone();
      defaultTransforms[clone.userData.id] = {
        scale: clone.scale.clone(),
        rotation: clone.rotation.clone(),
        position: clone.position.clone()
      };

      activeComponent.add(clone);
      index++;
    }
  });

  if (activeComponent.children.length === 0) {
    console.warn("No meshes found in component:", name);
    return;
  }

  const cbox = new THREE.Box3().setFromObject(activeComponent);
  const ccenter = cbox.getCenter(new THREE.Vector3());
  activeComponent.position.sub(ccenter);

  pivot.add(activeComponent);
}

const savedAtStart = JSON.parse(localStorage.getItem("slot" + activeSlot) || "{}");

if (savedAtStart.template) {
  await loadSavedDesign();
} else {
  await loadHelmetTemplate("MCHelmetV2.glb");
}

function selectMesh(mesh) {
  if (selectedMesh) selectedMesh.material = originalMaterial;
  selectedMesh = mesh;
  originalMaterial = mesh.material;
  mesh.material = highlightMaterial;

  document.getElementById("selectedPartLabel").textContent = mesh.userData.id;

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

    if (activeComponent && activeComponent.children.includes(obj)) {
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
  if (draggingMove && selectedMesh) {
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

  const selectedComponent = e.target.value;

  if (selectedComponent === "none") return;

  activeComponent = await getAccessory(selectedComponent);

  if (!activeComponent || activeComponent.children.length === 0) {
    console.warn("Component failed to load:", selectedComponent);
    activeComponent = null;
    return;
  }

  pivot.add(activeComponent);

  console.log("Dropdown component loaded:", selectedComponent, activeComponent);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  pivot.traverse(child => {
    if (!child.isMesh) return;
    const id = child.userData.id;
    if (defaultMaterials[id] && defaultTransforms[id]) {
      child.material = defaultMaterials[id].clone();
      child.scale.copy(defaultTransforms[id].scale);
      child.rotation.copy(defaultTransforms[id].rotation);
      child.position.copy(defaultTransforms[id].position);
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

  selectedMesh.material.color.set(color);
  if (selectedMesh.material.emissive) {
    selectedMesh.material.emissive.set(color);
  }
  selectedMesh.material.needsUpdate = true;

  if (originalMaterial) {
    originalMaterial.color.set(color);
    if (originalMaterial.emissive) {
      originalMaterial.emissive.set(color);
    }
    originalMaterial.needsUpdate = true;
  }
});

document.getElementById("textureInput").addEventListener("change", e => {

  const file = e.target.files[0];

  if (!file) return;

  const url = URL.createObjectURL(file);

  uploadedTexture = new THREE.TextureLoader().load(url);

  uploadedTexture.flipY = false;
});

document.getElementById("applyTextureSelectedBtn").addEventListener("click", () => {
  if (!selectedMesh || !uploadedTexture) return;

  applyTextureToMesh(selectedMesh, uploadedTexture);
});

document.getElementById("applyTextureAllBtn").addEventListener("click", () => {

  if (!uploadedTexture) return;

  pivot.traverse(child => {

    if (child.isMesh) {

      applyTextureToMesh(child, uploadedTexture);

    }

  });

});

document.getElementById("presetTextureSelect").addEventListener("change", e => {
  loadPresetTexture(e.target.value);
});

document.getElementById("applyPresetTextureSelectedBtn").addEventListener("click", () => {
  if (!selectedMesh || !presetTexture) return;

  applyTextureToMesh(selectedMesh, presetTexture, currentPresetTextureFile);
});

document.getElementById("backgroundSelect").addEventListener("change", e => {
  loadBackground(e.target.value);
});

document.getElementById("applyPresetTextureAllBtn").addEventListener("click", () => {

  if (!presetTexture) return;

  pivot.traverse(child => {

    if (child.isMesh) {
      applyTextureToMesh(child, presetTexture, currentPresetTextureFile);
    }

  });

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
  const saveData = {
    template: currentTemplate,
    component: document.getElementById("componentSelect").value,
    materials: {},
    transforms: {},
    vertexColors: {},
    meshIDs: []
  };

  pivot.traverse(child => {
    if (!child.isMesh) return;

    const id = child.userData.id || child.name;

    saveData.meshIDs.push(id);

    saveData.materials[id] = {
  color: child.material.color ? child.material.color.getHex() : 0xffffff,
  emissive: child.material.emissive ? child.material.emissive.getHex() : null,
  textureFile: child.userData.textureFile || null
};
const geo = child.geometry;

if (geo.attributes.color) {
  saveData.vertexColors[id] = Array.from(geo.attributes.color.array);
}

    saveData.transforms[id] = {
      scale: child.scale.toArray(),
      rotation: [child.rotation.x, child.rotation.y, child.rotation.z],
      position: child.position.toArray()
    };
  });

  localStorage.setItem("slot" + activeSlot, JSON.stringify(saveData));
});

document.getElementById("randomiseBtn").addEventListener("click", async () => {

  await randomiseHelmet();

});

window.saveCurrentDesign = function () {
  const saveData = {
    template: currentTemplate,
    component: document.getElementById("componentSelect").value,
    materials: {},
    transforms: {},
    vertexColors: {},
    meshIDs: []
  };

  pivot.traverse(child => {
    if (!child.isMesh) return;

    const id = child.userData.id || child.name;

    saveData.meshIDs.push(id);

    saveData.materials[id] = {
      color: child.material.color ? child.material.color.getHex() : 0xffffff,
      emissive: child.material.emissive ? child.material.emissive.getHex() : null,
      textureFile: child.userData.textureFile || null
    };
    const geo = child.geometry;

if (geo.attributes.color) {
  saveData.vertexColors[id] = Array.from(geo.attributes.color.array);
}

    saveData.transforms[id] = {
      scale: child.scale.toArray(),
      rotation: [child.rotation.x, child.rotation.y, child.rotation.z],
      position: child.position.toArray()
    };
  
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

async function randomiseHelmet() {
  deselectMesh();

  while (pivot.children.length > 0) {
    pivot.remove(pivot.children[0]);
  }

  helmet = null;
  activeComponent = null;
  selectedMesh = null;
  originalMaterial = null;

  defaultMaterials = {};
  defaultTransforms = {};

  const randomGroup = new THREE.Group();
  randomGroup.name = "Randomised_Helmet";

  let shell = null;
  let chin = null;
  let visor = null;
  let accessory = null;

  while (!shell) {
    const shellFile = randomItem(randomTemplates);
    shell = await getPartFromTemplate(shellFile, ["shell", "helmet"], "Random_Shell");
  }

  while (!chin) {
    const chinFile = randomItem(randomTemplates);
    chin = await getPartFromTemplate(chinFile, ["chin"], "Random_Chin");
  }

  while (!visor) {
    const visorFile = randomItem(randomTemplates);
    visor = await getPartFromTemplate(visorFile, ["visor"], "Random_Visor");
  }

  const accessoryType = randomItem(randomAccessories);
  accessory = await getAccessory(accessoryType);

  randomGroup.add(shell);
  randomGroup.add(chin);
  randomGroup.add(visor);

  if (accessory) {
    randomGroup.add(accessory);
  }

  const box = new THREE.Box3().setFromObject(randomGroup);
  const center = box.getCenter(new THREE.Vector3());
  randomGroup.position.sub(center);

  helmet = randomGroup;
  currentTemplate = "Randomised Helmet";

  pivot.add(helmet);

  document.getElementById("componentSelect").value = "none";

  console.log("Random helmet created:", {
    shell: shell.name,
    chin: chin.name,
    visor: visor.name,
    accessory: accessoryType
  });
}