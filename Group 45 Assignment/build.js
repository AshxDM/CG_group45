const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.set(0, 1.5, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const ambient = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambient);

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 5, 5);
scene.add(light);

const loader = new THREE.GLTFLoader();

loader.load(
  "models/MCHelmet.glb",
  function (gltf) {
    const helmet = gltf.scene;
    scene.add(helmet);

    helmet.position.set(0, 0, 0);
    helmet.scale.set(1, 1, 1);

    console.log("Helmet loaded:", helmet);
  },
  undefined,
  function (error) {
    console.error("Model failed to load:", error);
  }
);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();