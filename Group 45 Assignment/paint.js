import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let camera, scene, renderer, controls, helmet, pivot;
let paintTexture, paintCanvas, paintCtx;
let brushColor = "#ff0000";
let brushSize = 20;

camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

scene = new THREE.Scene();

renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableZoom = false;

pivot = new THREE.Group();
scene.add(pivot);

paintCanvas = document.createElement("canvas");
paintCanvas.width = 2048;
paintCanvas.height = 2048;
paintCtx = paintCanvas.getContext("2d");
paintCtx.fillStyle = "#ffffff";
paintCtx.fillRect(0, 0, 2048, 2048);

paintTexture = new THREE.CanvasTexture(paintCanvas);
paintTexture.flipY = false;

const loader = new GLTFLoader();

async function loadPaintHelmet() {
    const saved = JSON.parse(localStorage.getItem("paintModeData") || "{}");
    const file = saved.template || "MCHelmetV2.glb";

    const glb = await loader.loadAsync("./models/" + file);
    helmet = glb.scene;

    helmet.traverse(child => {
        if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
                map: paintTexture,
                metalness: 0.2,
                roughness: 0.8
            });
        }
    });

    const box = new THREE.Box3().setFromObject(helmet);
    const center = box.getCenter(new THREE.Vector3());
    helmet.position.sub(center);

    pivot.add(helmet);
}

await loadPaintHelmet();

document.getElementById("colorPicker").addEventListener("input", e => {
    brushColor = e.target.value;
});

document.getElementById("brushSize").addEventListener("input", e => {
    brushSize = parseInt(e.target.value);
});

document.getElementById("rotateSlider").addEventListener("input", e => {
    pivot.rotation.y = THREE.MathUtils.degToRad(e.target.value);
});

let painting = false;

renderer.domElement.addEventListener("pointerdown", e => {
    painting = true;
    paintAt(e);
});

renderer.domElement.addEventListener("pointermove", e => {
    if (painting) paintAt(e);
});

window.addEventListener("pointerup", () => {
    painting = false;
    savePaintTexture();
});

function paintAt(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2048;
    const y = ((e.clientY - rect.top) / rect.height) * 2048;

    paintCtx.fillStyle = brushColor;
    paintCtx.beginPath();
    paintCtx.arc(x, y, brushSize, 0, Math.PI * 2);
    paintCtx.fill();

    paintTexture.needsUpdate = true;
}

function savePaintTexture() {
    const saved = JSON.parse(localStorage.getItem("paintModeData") || "{}");
    saved.paintTexture = paintCanvas.toDataURL("image/png");
    localStorage.setItem("paintModeData", JSON.stringify(saved));
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});















