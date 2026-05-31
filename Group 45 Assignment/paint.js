import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

let scene, camera, renderer, controls;
let helmet, pivot;
let paintCanvas, paintCtx, paintTexture;

let isPainting = false;
let lastUV = null;

const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true; // smoother UV hits
const mouse = new THREE.Vector2();

init();
loadHelmet().then(() => animate());

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

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
        });

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 5);
    scene.add(dir);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableRotate = false;

    pivot = new THREE.Group();
    scene.add(pivot);

    renderer.domElement.addEventListener("pointerdown", e => {
        isPainting = true;
        lastUV = null;
        paintStroke(e);
    });

    renderer.domElement.addEventListener("pointerup", () => {
        isPainting = false;
        lastUV = null;
    });

    renderer.domElement.addEventListener("pointermove", e => {
        if (isPainting) paintStroke(e);
    });

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

async function loadHelmet() {
    const saved = JSON.parse(localStorage.getItem("paintModeData") || "{}");
    const template = saved.template || "MCHelmetV2.glb";

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
    const size = box.getSize(new THREE.Vector3());

    helmet.position.sub(center);

    // VISUAL CENTERING FIX — guaranteed centered
    helmet.position.y += size.y * 0.35;

    pivot.add(helmet);
}

function paintStroke(e) {
    if (!isPainting || !paintCanvas || !helmet) return;

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
    const size = parseFloat(document.getElementById("brushSize").value);

    paintCtx.fillStyle = color;
    paintCtx.strokeStyle = color;
    paintCtx.lineWidth = size * 2;
    paintCtx.lineCap = "round";

    if (lastUV) {
        paintCtx.beginPath();
        paintCtx.moveTo(lastUV.x, lastUV.y);
        paintCtx.lineTo(x, y);
        paintCtx.stroke();
    }

    paintCtx.beginPath();
    paintCtx.arc(x, y, size, 0, Math.PI * 2);
    paintCtx.fill();

    lastUV = { x, y };

    paintTexture.needsUpdate = true;
}

function savePaintedHelmet() {
    const saved = JSON.parse(localStorage.getItem("paintModeData") || "{}");
    saved.paintTexture = paintCanvas.toDataURL("image/png");
    localStorage.setItem("paintModeData", JSON.stringify(saved));
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    controls.update();
}













