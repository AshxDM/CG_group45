import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

let camera, scene, renderer, controls;

const w = window.innerWidth;
const h = window.innerHeight;
camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
camera.position.set(10, 0, 0);
camera.lookAt(0,0,0);
scene = new THREE.Scene();
renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement);

controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.enablePan = false;
controls.enableZoom = true;


//Load the background and lighting
const hdrLoader = new HDRLoader();
hdrLoader.load('./background/monochrome_studio_02_4k.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.background = texture;
})

//Load the model, I will make it into the function later to load multiple models
const gltfLoader = new GLTFLoader();
const helmetGlb = await gltfLoader.loadAsync('./models/MCHelmet.glb');
const helmet = helmetGlb.scene;

scene.add(helmet);
enableHelmetRotation(helmet, renderer.domElement)

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    controls.update();
}
animate();

function handleWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', handleWindowResize, false);

//Only rotate the helmet, not the background
function enableHelmetRotation (helmet, domElement, sensitivity = 0.01) {
  let isDragging = false;
  let prevX = 0;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    isDragging = true;
    prevX = e.clientX;
  })

  window.addEventListener('pointerup', () => {
    isDragging = false;
  })

  window.addEventListener('pointermove', (e) => {
    if (!isDragging || !helmet) return;

    const deltaX = e.clientX - prevX; 

    helmet.rotation.y += deltaX * sensitivity;
    
    prevX = e.clientX;
  })
}