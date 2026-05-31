import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let scene, camera, renderer, controls;
let helmet, pivot;
let paintCanvas, paintCtx, paintTexture;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

init();
loadHelmet();
animate();

function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(10, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;

    pivot = new THREE.Group();
    scene.add(pivot);

    window.addEventListener("pointermove", paintStroke);

    document.getElementById("returnBtn").onclick = () => {
        window.location.href = "CreatorPage.html";
    };
}

async function loadHelmet() {
    const saved = JSON.parse(localStorage.getItem("paintModeData") || "{}");
    const template = saved.template || "MCHelmet.glb";

    const loader = new GLTFLoader();
    const glb = await loader.loadAsync("./models/" + template);

    helmet = glb.scene;

    paintCanvas = document.createElement("canvas");
    paintCanvas.width = 2048;
    paintCanvas.height = 2048;

    paintCtx = paintCanvas.getContext("2d");
    paintCtx.fillStyle = "#ffffff";
    paintCtx.fillRect(0, 0, paintCanvas.width, paintCanvas.height);

    paintTexture = new THREE.CanvasTexture(paintCanvas);
    paintTexture.flipY = false;

    helmet.traverse(child => {
        if (child.isMesh) {
            child.material.map = paintTexture;
            child.material.needsUpdate = true;

            if (saved.materials && saved.materials[child.name]) {
                const m = saved.materials[child.name];
                child.material.color.setHex(m.color);
                if (m.emissive) child.material.emissive.setHex(m.emissive);
            }

            if (saved.transforms && saved.transforms[child.name]) {
                const t = saved.transforms[child.name];
                child.scale.fromArray(t.scale);
                child.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2]);
                child.position.fromArray(t.position);
            }
        }
    });

    const box = new THREE.Box3().setFromObject(helmet);
    const center = box.getCenter(new THREE.Vector3());
    helmet.position.sub(center);

    pivot.add(helmet);
}

function paintStroke(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(pivot, true);

    if (hits.length === 0 || !hits[0].uv) return;

    const uv = hits[0].uv;
    const x = uv.x * paintCanvas.width;
    const y = (1 - uv.y) * paintCanvas.height;

    const color = document.getElementById("colorPicker").value;
    const size = document.getElementById("brushSize").value;

    paintCtx.fillStyle = color;
    paintCtx.beginPath();
    paintCtx.arc(x, y, size, 0, Math.PI * 2);
    paintCtx.fill();

    paintTexture.needsUpdate = true;
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    controls.update();
}



