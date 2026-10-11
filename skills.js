import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader';
import {
  siArduino,
  siC,
  siCplusplus,
  siDjango,
  siFirebase,
  siGit,
  siGithub,
  siInstagram,
  siJavascript,
  siLinux,
  siMongodb,
  siMysql,
  siNodedotjs,
  siOpencv,
  siPandas,
  siPhp,
  siPostgresql,
  siPython,
  siPytorch,
  siReact,
  siScikitlearn,
  siTensorflow,
} from 'simple-icons';

// Keyed by the data-skill attribute in index.html.
const ICONS = {
  python: siPython,
  c: siC,
  cplusplus: siCplusplus,
  javascript: siJavascript,
  php: siPhp,
  pytorch: siPytorch,
  tensorflow: siTensorflow,
  scikitlearn: siScikitlearn,
  pandas: siPandas,
  // simple-icons has no seaborn mark, so this is a hand-drawn density curve
  seaborn: { hex: '4C72B0', path: 'M1 20c4 0 5-13 9-13s4 8 6 8 2-4 4-4 2 9 3 9z' },
  opencv: siOpencv,
  react: siReact,
  nodejs: siNodedotjs,
  django: siDjango,
  firebase: siFirebase,
  mysql: siMysql,
  postgresql: siPostgresql,
  mongodb: siMongodb,
  git: siGit,
  linux: siLinux,
  arduino: siArduino,
  // contact links (simple-icons dropped the LinkedIn mark, so its path is inlined)
  linkedin: {
    hex: '0A66C2',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452z',
  },
  instagram: siInstagram,
  github: siGithub,
};

const TILE_DEPTH = 0.16;
const LOGO_DEPTH = 0.07;
const LOGO_SIZE = 0.6;
const GRID = 3;

const rand = (min, max) => min + Math.random() * (max - min);

function roundedSquare(size, radius) {
  const h = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-h + radius, -h);
  shape.lineTo(h - radius, -h);
  shape.quadraticCurveTo(h, -h, h, -h + radius);
  shape.lineTo(h, h - radius);
  shape.quadraticCurveTo(h, h, h - radius, h);
  shape.lineTo(-h + radius, h);
  shape.quadraticCurveTo(-h, h, -h, h - radius);
  shape.lineTo(-h, -h + radius);
  shape.quadraticCurveTo(-h, -h, -h + radius, -h);
  return shape;
}

// One fracture pattern shared by every tile: a jittered 3 x 3 grid of chunks.
function buildChunks() {
  const span = 1.06; // the tile's outline including its bevel
  const depth = TILE_DEPTH + 0.06;
  const inner = (n) => n > 0 && n < GRID;
  const points = [];
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i <= GRID; i++) {
      points.push(
        new THREE.Vector2(
          (i / GRID - 0.5) * span + (inner(i) ? rand(-0.07, 0.07) : 0),
          (j / GRID - 0.5) * span + (inner(j) ? rand(-0.07, 0.07) : 0)
        )
      );
    }
  }
  const at = (i, j) => points[j * (GRID + 1) + i];

  const chunks = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const shape = new THREE.Shape([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      geometry.translate(0, 0, -depth / 2);
      geometry.computeBoundingBox();
      const offset = geometry.boundingBox.getCenter(new THREE.Vector3());
      geometry.translate(-offset.x, -offset.y, -offset.z);
      chunks.push({ geometry, offset });
    }
  }
  return chunks;
}

// Each tile is built out of debris: chunks swirl up from the bottom of the screen
// and lock together in its slot, then the logo stamps on. Scroll a row off the top
// and gravity takes it; it smashes on the floor. Scroll back while the pieces are
// still lying there and they rewind into the tile.
export function createSkills(overlay) {
  const { scene, view } = overlay;
  const svgLoader = new SVGLoader();
  const tileGeometry = new THREE.ExtrudeGeometry(roundedSquare(1, 0.22), {
    depth: TILE_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 3,
  });
  tileGeometry.translate(0, 0, -TILE_DEPTH / 2);
  const chunks = buildChunks();

  function buildIcon({ hex, path }) {
    const color = new THREE.Color(`#${hex}`);
    const hsl = color.getHSL({});
    // near-black brand colours would vanish against space
    if (hsl.l < 0.26) color.setHSL(hsl.h, hsl.s, 0.26);
    const light = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b > 0.6;

    const group = new THREE.Group();
    // emissive is only used for the flash when a tile snaps together
    const tile = new THREE.Mesh(
      tileGeometry,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.4 })
    );

    const shapes = svgLoader
      .parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}"/></svg>`)
      .paths.flatMap((p) => SVGLoader.createShapes(p));
    const logo = new THREE.ExtrudeGeometry(shapes, {
      depth: LOGO_DEPTH,
      bevelEnabled: false,
      curveSegments: 6,
    });
    // SVG is y-down on a 24 x 24 box: turn it over, centre it, sit it on the tile.
    logo.rotateX(Math.PI);
    logo.translate(-12, 12, 0);
    logo.scale(LOGO_SIZE / 24, LOGO_SIZE / 24, 1);
    logo.translate(0, 0, TILE_DEPTH / 2 + 0.03 + LOGO_DEPTH);
    const front = new THREE.Mesh(
      logo,
      new THREE.MeshStandardMaterial({ color: light ? 0x16161d : 0xffffff, roughness: 0.5 })
    );
    // same mark on the back, so a tile is never blank mid-flip
    const back = front.clone();
    back.rotation.y = Math.PI;
    group.add(tile, front, back);
    return { group, tile, front };
  }

  const skills = [...document.querySelectorAll('[data-skill]')]
    .filter((el) => ICONS[el.dataset.skill])
    .map((el, i) => {
      const skill = {
        slot: el.querySelector('.skill-slot'),
        ...buildIcon(ICONS[el.dataset.skill]),
        pieces: null,
        state: 'hidden', // hidden | assembling | whole | falling | broken
        clock: 0,
        life: 0,
        size: 1,
        pop: 0,
        flash: 0,
        phase: i * 1.7,
        turn: 0,
        turnTarget: 0,
        hover: false,
        velocity: new THREE.Vector3(),
        angular: new THREE.Vector3(),
      };
      skill.group.visible = false;
      scene.add(skill.group);
      // hovering (or tapping) flips the tile right round
      el.addEventListener('pointerenter', () => {
        skill.hover = true;
        skill.turnTarget += Math.PI * 2;
      });
      el.addEventListener('pointerleave', () => (skill.hover = false));
      return skill;
    });

  const tmp = new THREE.Vector3();
  const spin = new THREE.Quaternion();

  function rotate(object, angular, dt) {
    const speed = angular.length();
    if (speed < 1e-4) return;
    spin.setFromAxisAngle(tmp.copy(angular).divideScalar(speed), speed * dt);
    object.quaternion.premultiply(spin);
  }

  // The chunks (and one loose logo) that stand in for a tile while it is in bits.
  function getPieces(skill) {
    if (!skill.pieces) {
      const piece = (geometry, material, offset, isLogo) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        scene.add(mesh);
        return {
          mesh,
          offset,
          isLogo,
          start: new THREE.Vector3(),
          startQuaternion: new THREE.Quaternion(),
          swirl: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          angular: new THREE.Vector3(),
        };
      };
      skill.pieces = chunks.map(({ geometry, offset }) =>
        piece(geometry, skill.tile.material, offset, false)
      );
      skill.pieces.push(
        piece(skill.front.geometry, skill.front.material, new THREE.Vector3(), true)
      );
    }
    return skill.pieces;
  }

  function hidePieces(skill) {
    for (const { mesh } of skill.pieces ?? []) mesh.visible = false;
  }

  // Pin the (possibly invisible) tile to its slot in the page.
  function place(skill, rect, dt, time) {
    const { group } = skill;
    overlay.toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, group.position);
    group.position.y += Math.sin(time * 1.1 + skill.phase) * rect.height * 0.03 * view.unitsPerPx;

    skill.turn += (skill.turnTarget - skill.turn) * Math.min(1, dt * 5);
    group.rotation.set(
      Math.sin(time * 0.7 + skill.phase) * 0.18,
      Math.sin(time * 0.9 + skill.phase * 1.3) * 0.45 + skill.turn,
      0
    );
    skill.size = rect.width * view.unitsPerPx * 0.72;
    group.scale.setScalar(skill.size * (skill.hover ? 1.15 : 1) * (1 + skill.pop * 0.22));
    group.updateMatrix();
  }

  function assemble(skill, rewind, delay) {
    const floor = -view.height / 2;
    skill.state = 'assembling';
    skill.clock = -delay;
    skill.group.visible = false;
    for (const piece of getPieces(skill)) {
      const { mesh } = piece;
      if (!rewind) {
        if (piece.isLogo) {
          // the logo drops in from in front of the screen
          mesh.position.copy(skill.group.position).multiplyScalar(0.5).setZ(9);
        } else {
          mesh.position.set(
            skill.group.position.x + rand(-1, 1) * view.width * 0.22,
            floor - rand(0.5, 2.5),
            rand(-4, 4)
          );
        }
        mesh.quaternion.setFromEuler(new THREE.Euler(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)));
      }
      mesh.visible = true;
      mesh.scale.setScalar(skill.size);
      piece.start.copy(mesh.position);
      piece.startQuaternion.copy(mesh.quaternion);
      piece.swirl.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(view.height * 0.07);
    }
  }

  function drop(skill) {
    skill.state = 'falling';
    skill.velocity.set(rand(-1, 1) * view.height * 0.08, 0, 0);
    skill.angular.set(rand(-3, 3), rand(-3, 3), rand(-3, 3));
  }

  function shatter(skill) {
    const { group, velocity } = skill;
    group.updateMatrix();
    for (const piece of getPieces(skill)) {
      const { mesh } = piece;
      mesh.visible = true;
      mesh.position.copy(piece.offset).applyMatrix4(group.matrix);
      mesh.quaternion.copy(group.quaternion);
      mesh.scale.setScalar(skill.size);
      piece.velocity.set(
        velocity.x * 0.5 + rand(-1, 1) * view.height * 0.2,
        // the logo pops clean off and gets the most air
        -velocity.y * (piece.isLogo ? 0.6 : rand(0.15, 0.45)),
        rand(-1, 1) * view.height * 0.1
      );
      piece.angular.set(rand(-7, 7), rand(-7, 7), rand(-7, 7));
    }
    group.visible = false;
    skill.state = 'broken';
    skill.clock = 0;
    skill.life = rand(2.4, 3.2);
  }

  function update(dt, time) {
    const height = Math.max(window.innerHeight, 1);
    const gravity = view.height * 1.7;
    const floor = -view.height / 2;

    for (const skill of skills) {
      const { group } = skill;
      const rect = skill.slot.getBoundingClientRect();
      const centre = rect.top + rect.height / 2;
      const inView = centre > height * 0.12 && rect.top < height * 0.94;
      const pastTop = centre < height * 0.05;
      const below = rect.top > height;

      skill.pop *= Math.exp(-6 * dt);
      skill.flash *= Math.exp(-3 * dt);
      skill.tile.material.emissiveIntensity = skill.flash * 0.8;

      if (skill.state === 'hidden') {
        if (!inView) continue;
        place(skill, rect, dt, time);
        // left-to-right ripple along each row
        assemble(skill, false, (rect.left / Math.max(window.innerWidth, 1)) * 0.35);
      }

      if (skill.state === 'assembling') {
        if (pastTop || below) {
          hidePieces(skill);
          skill.state = 'hidden';
          continue;
        }
        place(skill, rect, dt, time);
        skill.clock += dt;
        for (const [i, piece] of skill.pieces.entries()) {
          const begin = piece.isLogo ? 0.45 : i * 0.035;
          const p = THREE.MathUtils.clamp((skill.clock - begin) / (piece.isLogo ? 0.5 : 0.7), 0, 1);
          const eased = 1 - (1 - p) ** 3;
          tmp.copy(piece.offset).applyMatrix4(group.matrix);
          piece.mesh.position
            .lerpVectors(piece.start, tmp, eased)
            .addScaledVector(piece.swirl, Math.sin(Math.PI * eased));
          piece.mesh.quaternion.copy(piece.startQuaternion).slerp(group.quaternion, eased);
          piece.mesh.scale.setScalar(group.scale.x);
        }
        if (skill.clock >= 0.98) {
          hidePieces(skill);
          group.visible = true;
          skill.state = 'whole';
          skill.pop = 1;
          skill.flash = 1;
        }
        continue;
      }

      if (skill.state === 'whole') {
        if (below || rect.bottom < -height * 0.5) {
          // off screen anyway: nothing to see
          group.visible = false;
          skill.state = 'hidden';
        } else if (pastTop) {
          drop(skill);
        } else {
          place(skill, rect, dt, time);
        }
        continue;
      }

      if (skill.state === 'falling') {
        skill.velocity.y -= gravity * dt;
        group.position.addScaledVector(skill.velocity, dt);
        rotate(group, skill.angular, dt);
        if (group.position.y - skill.size * 0.5 < floor) shatter(skill);
        continue;
      }

      // broken
      if (inView && skill.clock > 0.5) {
        place(skill, rect, dt, time);
        assemble(skill, true, 0);
        continue;
      }
      skill.clock += dt;
      const fade = THREE.MathUtils.clamp((skill.life - skill.clock) / 0.5, 0, 1);
      const rest = floor + skill.size * 0.2;
      for (const piece of skill.pieces) {
        const { mesh, velocity } = piece;
        velocity.y -= gravity * dt;
        mesh.position.addScaledVector(velocity, dt);
        rotate(mesh, piece.angular, dt);
        if (mesh.position.y < rest) {
          mesh.position.y = rest;
          velocity.y = Math.abs(velocity.y) > view.height * 0.08 ? -velocity.y * 0.32 : 0;
          velocity.x *= 0.6;
          velocity.z *= 0.6;
          piece.angular.multiplyScalar(0.55);
        }
        mesh.scale.setScalar(Math.max(fade, 0.001) * skill.size);
      }
      if (skill.clock > skill.life) {
        hidePieces(skill);
        skill.state = 'hidden';
      }
    }
  }

  return { update };
}
