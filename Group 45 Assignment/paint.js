import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

let scene, camera, renderer, controls;
let helmet, pivot;

const parts = {};
let activeMesh = null;

let isPainting = false;
let isErasing = false;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// reusable temporaries to avoid per-stroke allocation
const _v = new THREE.Vector3();
const _hitLocal = new THREE.Vector3();

init();
loadHelmet().then(() => animate());

function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 7);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    new RGBELoader()
        .setPath("./background/")
        .load("monochrome_studio_02_4k.hdr", hdr => {
            hdr.mapping = THREE.EquirectangularReflectionMapping;
            scene.environment = hdr;
            scene.background = hdr;
        });

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableRotate = true; 
    controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: null
    };

    pivot = new THREE.Group();
    scene.add(pivot);

    renderer.domElement.addEventListener("pointerdown", e => {
        if (e.button === 0) {            // left = paint
            isPainting = true;
            isErasing = false;
            paintStroke(e);
        } else if (e.button === 2) {     // right = erase
            isErasing = true;
            isPainting = false;
            paintStroke(e);
        }
    });

    renderer.domElement.addEventListener("pointerup", e => {
        if (e.button === 0) isPainting = false;
        if (e.button === 2) isErasing = false;
    });

    renderer.domElement.addEventListener("pointermove", e => {
        if (isPainting && (e.buttons & 1)) paintStroke(e);
        else if (isErasing && (e.buttons & 2)) paintStroke(e);
    });

    renderer.domElement.addEventListener("contextmenu", e => e.preventDefault());

    document.getElementById("returnNoSave").onclick = () => {
        window.location.href = "CreatorPage.html";
    };
    document.getElementById("returnSave").onclick = () => {
        savePaintedHelmet();
        window.location.href = "CreatorPage.html";
    };
    document.getElementById("rotateSlider").oninput = e => {
        pivot.rotation.y = THREE.MathUtils.degToRad(e.target.value);
    };

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function setLabel(text) {
    const el = document.getElementById("activePartLabel");
    if (el) el.textContent = text;
}
const rebuildComponents = {
    horns: "./models/Horns.glb",
    crown: "./models/CrownV2.glb",
    halo: "./models/Halo.glb",
    flower: "./models/Flower.glb"
};

function findMeshByKeyword(root, keywords) {
    let result = null;
    root.traverse(child => {
        if (!child.isMesh || result) return;
        const name = child.name.toLowerCase();
        if (keywords.some(k => name.includes(k))) result = child;
    });
    return result;
}

async function getPartFromTemplate(file, keywords, newName) {
    const glb = await new GLTFLoader().loadAsync("./models/" + file);
    const root = glb.scene;
    root.updateMatrixWorld(true);

    const sourceMesh = findMeshByKeyword(root, keywords);
    if (!sourceMesh) return null;

    const clone = new THREE.Mesh(sourceMesh.geometry.clone(), sourceMesh.material.clone());
    clone.name = newName;
    clone.userData.id = newName;

    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    sourceMesh.getWorldPosition(p);
    sourceMesh.getWorldQuaternion(q);
    sourceMesh.getWorldScale(s);
    clone.position.copy(p);
    clone.quaternion.copy(q);
    clone.scale.copy(s);

    return clone;
}

async function getAccessory(type) {
    const glb = await new GLTFLoader().loadAsync(rebuildComponents[type]);
    const group = new THREE.Group();
    group.name = type + "_Accessory";
    glb.scene.updateMatrixWorld(true);

    glb.scene.traverse(child => {
        if (!child.isMesh) return;
        const clone = new THREE.Mesh(child.geometry.clone(), child.material.clone());
        clone.name = type + "_" + child.name;
        clone.userData.id = clone.name;

        const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
        child.getWorldPosition(p);
        child.getWorldQuaternion(q);
        child.getWorldScale(s);
        clone.position.copy(p);
        clone.quaternion.copy(q);
        clone.scale.copy(s);

        group.add(clone);
    });
    return group;
}

async function buildRandomGroup(recipe) {
    const randomGroup = new THREE.Group();
    randomGroup.name = "Randomised_Helmet";

    const shell = await getPartFromTemplate(recipe.shellFile, ["shell", "helmet"], "Random_Shell");
    const chin = await getPartFromTemplate(recipe.chinFile, ["chin"], "Random_Chin");
    const visor = await getPartFromTemplate(recipe.visorFile, ["visor"], "Random_Visor");

    if (shell) randomGroup.add(shell);
    if (chin) randomGroup.add(chin);
    if (visor) randomGroup.add(visor);

    if (recipe.accessoryType) {
        const accessory = await getAccessory(recipe.accessoryType);
        if (accessory) randomGroup.add(accessory);
    }

    return randomGroup;
}

async function loadHelmet() {
    const saved = JSON.parse(localStorage.getItem("paintModeData") || "{}");
    const savedIDs = saved.meshIDs || [];
    let meshIndex = 0;

    const template = saved.template || "MCHelmetV2.glb";

    if (template === "Randomised Helmet" && saved.randomRecipe) {
        helmet = await buildRandomGroup(saved.randomRecipe);
    } else {
        const loader = new GLTFLoader();
        const glb = await loader.loadAsync("./models/" + template);
        helmet = glb.scene;
    }

    const savedColors = saved.vertexColors || {};

    helmet.traverse(child => {
        if (!child.isMesh) return;

        const id = savedIDs[meshIndex] || child.name;
        child.userData.id = id;
        meshIndex++;

        const geo = child.geometry;
        const count = geo.attributes.position.count;

        let colorAttr = geo.getAttribute("color");
        if (!colorAttr) {
            const arr = new Float32Array(count * 3).fill(1);
            colorAttr = new THREE.BufferAttribute(arr, 3);
            geo.setAttribute("color", colorAttr);
        }

        const prev = savedColors[id];
        if (prev && prev.length === count * 3) {
            colorAttr.copyArray(prev);
            colorAttr.needsUpdate = true;
        }

        child.material = child.material.clone();
        child.material.vertexColors = true;
        child.material.map = null;
        child.material.color.set(0xffffff);
        child.material.needsUpdate = true;

        if (saved.transforms && saved.transforms[id]) {
        const t = saved.transforms[id];
            child.scale.fromArray(t.scale);
            child.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2]);
            child.position.fromArray(t.position);
        }

        const partBox = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
        const partDiag = partBox.getSize(new THREE.Vector3()).length() || 1;

        parts[child.uuid] = {
            mesh: child,
            colorAttr,
            positions: geo.attributes.position,
            spacing: estimateSpacing(geo.attributes.position),
            diag: partDiag
        };
    });

    const box = new THREE.Box3().setFromObject(helmet);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    helmet.position.sub(center);
    helmet.position.y += size.y * 0.35;

    pivot.add(helmet);

    setLabel("Left-drag paints · Right-drag erases · Middle-rotate helmet");
}

function estimateSpacing(posAttr) {
    const n = posAttr.count;
    const sampleCount = Math.min(60, n);
    const dists = [];
    for (let s = 0; s < sampleCount; s++) {
        const i = Math.floor((s / sampleCount) * n);
        const ix = posAttr.getX(i), iy = posAttr.getY(i), iz = posAttr.getZ(i);
        let best = Infinity;
        for (let j = 0; j < n; j += Math.max(1, Math.floor(n / 400))) {
            if (j === i) continue;
            const dx = posAttr.getX(j) - ix;
            const dy = posAttr.getY(j) - iy;
            const dz = posAttr.getZ(j) - iz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > 1e-8 && d2 < best) best = d2;
        }
        if (best < Infinity) dists.push(Math.sqrt(best));
    }
    if (!dists.length) return null;
    dists.sort((a, b) => a - b);
    return dists[Math.floor(dists.length / 2)];
}

function paintStroke(e) {
    if (!isPainting && !isErasing) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Hit the whole helmet; paint whichever part the ray strikes first.
    const hits = raycaster.intersectObject(pivot, true);
    if (hits.length === 0) return;

    const hit = hits[0];
    const hitMesh = hit.object;
    const part = parts[hitMesh.uuid];
    if (!part) return;

    _hitLocal.copy(hit.point);
    hitMesh.worldToLocal(_hitLocal);

    const color = isErasing
        ? new THREE.Color(0xffffff)
        : new THREE.Color(document.getElementById("colorPicker").value);

    const sliderSize = parseFloat(document.getElementById("brushSize").value);
    const diag = part.diag || 1;
    const frac = 0.06 + (sliderSize - 5) / (80 - 5) * (0.6 - 0.06);
    const spacing = part.spacing || diag * 0.02;
    const radius = Math.max(frac * diag, spacing * 1.2);
    const r2 = radius * radius;

    const pos = part.positions;
    const colAttr = part.colorAttr;
    let changed = false;

    if (hit.face) {
        for (const vi of [hit.face.a, hit.face.b, hit.face.c]) {
            colAttr.setXYZ(vi, color.r, color.g, color.b);
            changed = true;
        }
    }

    for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) - _hitLocal.x;
        const dy = pos.getY(i) - _hitLocal.y;
        const dz = pos.getZ(i) - _hitLocal.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= r2) {
            const t = 1 - Math.sqrt(d2) / radius; // 1 at center, 0 at edge
            const blend = Math.min(1, t * 1.5);
            const r = colAttr.getX(i) * (1 - blend) + color.r * blend;
            const g = colAttr.getY(i) * (1 - blend) + color.g * blend;
            const b = colAttr.getZ(i) * (1 - blend) + color.b * blend;
            colAttr.setXYZ(i, r, g, b);
            changed = true;
        }
    }

    if (changed) colAttr.needsUpdate = true;
}

function savePaintedHelmet() {
    const saved = JSON.parse(localStorage.getItem("paintModeData") || "{}");

    const vertexColors = {};

    for (const p of Object.values(parts)) {
        const id = p.mesh.userData.id || p.mesh.name;
        vertexColors[id] = Array.from(p.colorAttr.array);
    }

    saved.vertexColors = vertexColors;

    const activeSlot = localStorage.getItem("activeSlot") || "1";

    localStorage.setItem("paintModeData", JSON.stringify(saved));
    localStorage.setItem("slot" + activeSlot, JSON.stringify(saved));
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    controls.update();
}