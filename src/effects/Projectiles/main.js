import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';
import GUI from 'lil-gui';

// --- CONFIGURATION & GUI ---
const params = {
  viewDistance: 300,      // Fog 'far' distance
  spawnRate: 15,          // Rocks per second
  maxRocks: 300,          // Max rocks in scene
  spawnHeight: 20,
  spawnRadius: 5,
  velocityMin: 2,
  velocityMax: 10,
  scaleMin: 0.5,
  scaleMax: 1.5,
  mass: 5,
  friction: 0.7,
  restitution: 0.2,       // Bounciness
  clearRocks: () => clearAllRocks(),
};

// --- THREE.JS SETUP ---
const canvas = document.createElement('canvas');
document.getElementById('app').appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0c10');
scene.fog = new THREE.Fog('#0b0c10', 20, params.viewDistance);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
// Default distance is positioned slightly above and back
camera.position.set(0, 45, 80);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight('#ffffff', 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight('#ffffff', 2.0);
dirLight.position.set(20, 50, -20);
dirLight.castShadow = true;
dirLight.shadow.camera.top = 50;
dirLight.shadow.camera.bottom = -50;
dirLight.shadow.camera.left = -50;
dirLight.shadow.camera.right = 50;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 150;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight('#66fcf1', 0.8);
fillLight.position.set(-20, 20, 20);
scene.add(fillLight);

// --- CANNON-ES SETUP ---
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;

// Materials
const defaultMaterial = new CANNON.Material('default');
const defaultContactMaterial = new CANNON.ContactMaterial(
  defaultMaterial,
  defaultMaterial,
  {
    friction: params.friction,
    restitution: params.restitution,
  }
);
world.addContactMaterial(defaultContactMaterial);
world.defaultContactMaterial = defaultContactMaterial;

// --- GROUND ---
const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshStandardMaterial({ 
  color: '#1f2833', 
  roughness: 0.8, 
  metalness: 0.2 
});
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const groundBody = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Plane(),
  material: defaultMaterial
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// --- SPAWNER VISUAL ---
const spawnerGeo = new THREE.RingGeometry(params.spawnRadius - 0.5, params.spawnRadius, 32);
const spawnerMat = new THREE.MeshBasicMaterial({ color: '#66fcf1', side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
const spawnerMesh = new THREE.Mesh(spawnerGeo, spawnerMat);
spawnerMesh.rotation.x = -Math.PI / 2;
spawnerMesh.position.y = params.spawnHeight;
scene.add(spawnerMesh);

// --- ROCK GENERATION ---
const rocks = [];
const rockGeometry = new THREE.IcosahedronGeometry(1, 0); // Low poly sphere/rock
const rockMaterials = [
  new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.9, metalness: 0.1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: '#776655', roughness: 0.9, metalness: 0.1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: '#556677', roughness: 0.9, metalness: 0.1, flatShading: true }),
];

let timeSinceLastSpawn = 0;

function spawnRock() {
  if (rocks.length >= params.maxRocks) {
    const oldestRock = rocks.shift();
    scene.remove(oldestRock.mesh);
    world.removeBody(oldestRock.body);
    // Dispose resources if needed, but we reuse geometry/material
  }

  // Randomize scale for irregular rock shape
  const scaleX = params.scaleMin + Math.random() * (params.scaleMax - params.scaleMin);
  const scaleY = params.scaleMin + Math.random() * (params.scaleMax - params.scaleMin);
  const scaleZ = params.scaleMin + Math.random() * (params.scaleMax - params.scaleMin);

  // Mesh
  const material = rockMaterials[Math.floor(Math.random() * rockMaterials.length)];
  const mesh = new THREE.Mesh(rockGeometry, material);
  mesh.scale.set(scaleX, scaleY, scaleZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  
  // Random spawn position within radius
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * params.spawnRadius;
  const posX = Math.cos(angle) * r;
  const posZ = Math.sin(angle) * r;
  const posY = params.spawnHeight;

  mesh.position.set(posX, posY, posZ);
  scene.add(mesh);

  // Physics Body
  // We use a Box shape that roughly matches the scaled icosahedron for tumbling physics
  const shape = new CANNON.Box(new CANNON.Vec3(scaleX * 0.8, scaleY * 0.8, scaleZ * 0.8));
  const body = new CANNON.Body({
    mass: params.mass * (scaleX * scaleY * scaleZ), // Mass scales with volume
    position: new CANNON.Vec3(posX, posY, posZ),
    shape: shape,
    material: defaultMaterial
  });
  
  // Give it some initial random rotation
  body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  
  // Give it some initial downward/outward velocity
  const velocityMag = params.velocityMin + Math.random() * (params.velocityMax - params.velocityMin);
  const vX = (Math.random() - 0.5) * velocityMag;
  const vZ = (Math.random() - 0.5) * velocityMag;
  const vY = -Math.random() * velocityMag;
  body.velocity.set(vX, vY, vZ);
  
  // Add some spin
  body.angularVelocity.set(
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10
  );

  world.addBody(body);

  rocks.push({ mesh, body });
}

function clearAllRocks() {
  for (const rock of rocks) {
    scene.remove(rock.mesh);
    world.removeBody(rock.body);
  }
  rocks.length = 0;
}

// --- GUI ---
const gui = new GUI({ title: 'Rock Generator Settings' });

const viewFolder = gui.addFolder('Environment');
viewFolder.add(params, 'viewDistance', 50, 800).name('View Distance (Fog)').onChange(v => {
  scene.fog.far = v;
});

const spawnFolder = gui.addFolder('Spawning');
spawnFolder.add(params, 'spawnRate', 0, 50).name('Rocks/sec');
spawnFolder.add(params, 'maxRocks', 10, 1000).step(1).name('Max Rocks').onChange(() => {
  while(rocks.length > params.maxRocks) {
    const oldest = rocks.shift();
    scene.remove(oldest.mesh);
    world.removeBody(oldest.body);
  }
});
spawnFolder.add(params, 'spawnHeight', 5, 50).name('Height').onChange(v => spawnerMesh.position.y = v);
spawnFolder.add(params, 'spawnRadius', 0, 20).name('Radius').onChange(v => {
  spawnerMesh.geometry.dispose();
  if (v > 0.5) {
    spawnerMesh.geometry = new THREE.RingGeometry(v - 0.5, v, 32);
    spawnerMesh.visible = true;
  } else {
    spawnerMesh.visible = false;
  }
});

const physFolder = gui.addFolder('Physics & Size');
physFolder.add(params, 'mass', 1, 50).name('Base Mass');
physFolder.add(params, 'scaleMin', 0.1, 5).name('Min Scale');
physFolder.add(params, 'scaleMax', 0.1, 5).name('Max Scale');
physFolder.add(params, 'velocityMin', 0, 20).name('Min Velocity');
physFolder.add(params, 'velocityMax', 0, 50).name('Max Velocity');

const matFolder = gui.addFolder('Material Settings');
matFolder.add(params, 'friction', 0, 1).onChange(v => defaultContactMaterial.friction = v);
matFolder.add(params, 'restitution', 0, 1).name('Bounciness').onChange(v => defaultContactMaterial.restitution = v);

gui.add(params, 'clearRocks').name('Clear All Rocks');

// --- RESIZE HANDLER ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- ANIMATION LOOP ---
const clock = new THREE.Clock();
let timeStep = 1 / 60;

// Remove loading screen
document.getElementById('loading').style.opacity = '0';
setTimeout(() => document.getElementById('loading').remove(), 500);

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Spawning logic
  if (params.spawnRate > 0) {
    timeSinceLastSpawn += delta;
    const spawnInterval = 1 / params.spawnRate;
    while (timeSinceLastSpawn >= spawnInterval) {
      spawnRock();
      timeSinceLastSpawn -= spawnInterval;
    }
  }

  // Step physics world
  world.step(timeStep, delta, 3);

  // Sync physics bodies to visual meshes
  for (const rock of rocks) {
    rock.mesh.position.copy(rock.body.position);
    rock.mesh.quaternion.copy(rock.body.quaternion);
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();
