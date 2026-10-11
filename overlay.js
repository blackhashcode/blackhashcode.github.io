import * as THREE from 'three';

const FOV = 35;
const DISTANCE = 20;

// A second scene drawn on top of the scrolling space backdrop. Its camera never
// moves, so things in it can be laid out against the viewport (and the DOM).
export function createOverlay() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = DISTANCE;

  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(-4, 6, 10);
  const rim = new THREE.DirectionalLight(0x8a2be2, 0.6);
  rim.position.set(6, -3, 4);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.3));

  // size of the viewport in world units on the z = 0 plane
  const view = { width: 0, height: 0, unitsPerPx: 0 };

  function resize() {
    // a background tab can report a 0 x 0 window; don't let that turn into NaNs
    const width = Math.max(window.innerWidth, 1);
    const height = Math.max(window.innerHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    view.height = 2 * DISTANCE * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    view.width = view.height * camera.aspect;
    view.unitsPerPx = view.height / height;
  }
  resize();

  // viewport pixels -> world position on the z = 0 plane
  function toWorld(px, py, target) {
    return target.set(
      (px - window.innerWidth / 2) * view.unitsPerPx,
      (window.innerHeight / 2 - py) * view.unitsPerPx,
      0
    );
  }

  return { scene, camera, view, resize, toWorld };
}
