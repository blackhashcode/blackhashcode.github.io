import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
camera.position.setZ(30);
camera.position.setX(-3);

// Lighting
const pointLight = new THREE.PointLight(0xffffff, 1, 100);
pointLight.position.set(10, 10, 10);
scene.add(pointLight);
scene.add(new THREE.AmbientLight(0x404040, 2));

// Background
scene.background = new THREE.TextureLoader().load('space.jpg');

// Stars
function addStar() {
  const geometry = new THREE.SphereGeometry(0.15, 24, 24);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const star = new THREE.Mesh(geometry, material);
  const [x, y, z] = Array(3).fill().map(() => THREE.MathUtils.randFloatSpread(200));
  star.position.set(x, y, z);
  scene.add(star);
}
Array(300).fill().forEach(addStar);

// Avatar (optional)
const avatarTexture = new THREE.TextureLoader().load('im_uzi_2.png');
const avatar = new THREE.Mesh(
  new THREE.BoxGeometry(3, 3, 3),
  new THREE.MeshBasicMaterial({ map: avatarTexture })
);
avatar.position.set(2, -2, -5);
scene.add(avatar);

// Loaders and groups
const loader = new GLTFLoader();
const virusGroup = new THREE.Group();
const pcGroup = new THREE.Group();
const orbitViruses = [];
const orbitOS = [];

// Central Virus + Orbiting Viruses
loader.load('model/virus.glb', (gltf) => {
  const virusMain = gltf.scene;
  virusMain.scale.set(4, 4, 4);
  virusGroup.add(virusMain);

  for (let i = 0; i < 5; i++) {
    const orbit = new THREE.Group();
    loader.load('model/virus.glb', (cloneGltf) => {
      const miniVirus = cloneGltf.scene;
      miniVirus.scale.set(1.2, 1.2, 1.2);
      miniVirus.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0xff4444,
            emissive: 0xff0000,
            emissiveIntensity: 0.8,
          });
        }
      });
      miniVirus.position.set(5, 0, 0);
      orbit.add(miniVirus);

      const pointLight = new THREE.PointLight(0xff5555, 0.5, 10);
      miniVirus.add(pointLight);

      virusGroup.add(orbit);
      orbitViruses.push(orbit);
    });
  }

  virusGroup.position.set(-20, 0, 0);
  scene.add(virusGroup);
});

// Personal Computer (Apple iMac) + Linux + Windows XP
loader.load('model/personal_computer.glb', (gltf) => {
  const pc = gltf.scene;
  pc.scale.set(30, 30, 30);
  pcGroup.add(pc);
  // Removed fixed position: pcGroup.position.set(-50, 0, 0);
  scene.add(pcGroup);

  // Linux
  loader.load('model/linux-char.glb', (gltf2) => {
    const linux = gltf2.scene;
    linux.scale.set(5, 5, 5);
    linux.position.set(8, 0, 0);
    const orbit = new THREE.Group();
    orbit.add(linux);
    pcGroup.add(orbit);
    orbitOS.push(orbit);
  });

  // Windows XP
  loader.load('model/microsoft_windows_xp.glb', (gltf3) => {
    const winxp = gltf3.scene;
    winxp.scale.set(30, 30, 30);
    winxp.position.set(-8, 0, 0);
    const orbit = new THREE.Group();
    orbit.add(winxp);
    pcGroup.add(orbit);
    orbitOS.push(orbit);
  });
});

// Optional Torus
const torus = new THREE.Mesh(
  new THREE.TorusKnotGeometry(8, 1.2, 100, 16),
  new THREE.MeshStandardMaterial({ color: 0x8a2be2 })
);
scene.add(torus);

// Scroll camera
function moveCamera() {
  const t = document.body.getBoundingClientRect().top;
  avatar.rotation.y += 0.01;
  avatar.rotation.z += 0.01;
  camera.position.z = t * -0.01;
  camera.position.x = t * -0.0002;
  camera.rotation.y = t * -0.0002;
}
document.body.onscroll = moveCamera;
moveCamera();

let floatAngle = 0;
// Animation loop
function animate() {
  requestAnimationFrame(animate);
  torus.rotation.x += 0.005;
  torus.rotation.y += 0.005;

  orbitViruses.forEach((group, idx) => {
    group.rotation.y += 0.005 + idx * 0.001;
  });

  orbitOS.forEach((group, idx) => {
    group.rotation.y += 0.004 + idx * 0.001;
  });

  // Floating animation for the iMac group
  floatAngle += 0.01;
  pcGroup.position.x = 10 * Math.cos(floatAngle);
  pcGroup.position.y = 5 * Math.sin(floatAngle * 2);
  pcGroup.position.z = 10 * Math.sin(floatAngle);

  // Optional rotation for pcGroup for nicer effect
  pcGroup.rotation.y += 0.01;
  pcGroup.rotation.x += 0.005;

  renderer.render(scene, camera);
}
animate();

// Resize listener
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});