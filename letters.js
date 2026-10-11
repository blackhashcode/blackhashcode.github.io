import * as THREE from 'three';
import data from './letters.json';

// letters.json is in 1/1000 em; geometry is built in em and scaled per line.
const EM = 0.001;
const DEPTH = 0.24;
const BEVEL = 0.025;
const SPACE = 0.3;
const LINE_HEIGHT = 1.3;
const GREETING_SIZE = 0.5;

const CYCLE_SECONDS = 6.5;
const FALL_AT = 0.18; // fraction of the viewport scrolled before gravity kicks in
const RESET_AT = 0.04;

const SIDE_COLORS = { en: 0x61dafb, bn: 0x7ee787, es: 0xffb86c, fr: 0xc586c0, ja: 0xff6b81 };

const rand = (min, max) => min + Math.random() * (max - min);

function ringToPath(flat, path) {
  path.moveTo(flat[0] * EM, flat[1] * EM);
  for (let i = 2; i < flat.length; i += 2) path.lineTo(flat[i] * EM, flat[i + 1] * EM);
  path.closePath();
  return path;
}

function toShape([outer, ...holes]) {
  const shape = ringToPath(outer, new THREE.Shape());
  shape.holes = holes.map((hole) => ringToPath(hole, new THREE.Path()));
  return shape;
}

export function createLetters(overlay) {
  const { scene, view } = overlay;

  const capMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f7ff, roughness: 0.35 });
  const sideMaterials = Object.fromEntries(
    Object.entries(SIDE_COLORS).map(([id, color]) => [
      id,
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        roughness: 0.5,
      }),
    ])
  );

  // ------------------------------------------------------------ geometry

  const letterGeometry = new Map();
  function getLetterGeometry(g) {
    if (!letterGeometry.has(g)) {
      const geometry = new THREE.ExtrudeGeometry(data.glyphs[g].poly.map(toShape), {
        depth: DEPTH,
        bevelEnabled: true,
        bevelThickness: BEVEL,
        bevelSize: BEVEL * 0.8,
        bevelSegments: 2,
      });
      geometry.translate(0, 0, -DEPTH / 2);
      letterGeometry.set(g, geometry);
    }
    return letterGeometry.get(g);
  }

  // Each shard pivots on its own centre, so keep where it sat in the letter.
  const shardGeometry = new Map();
  function getShardGeometry(g) {
    if (!shardGeometry.has(g)) {
      const depth = DEPTH + BEVEL * 2;
      shardGeometry.set(
        g,
        data.glyphs[g].shards.map((poly) => {
          const geometry = new THREE.ExtrudeGeometry(toShape(poly), { depth, bevelEnabled: false });
          geometry.translate(0, 0, -depth / 2);
          geometry.computeBoundingBox();
          const offset = geometry.boundingBox.getCenter(new THREE.Vector3());
          geometry.translate(-offset.x, -offset.y, -offset.z);
          geometry.computeBoundingSphere();
          return { geometry, offset };
        })
      );
    }
    return shardGeometry.get(g);
  }

  // ------------------------------------------------------------ layout

  // Greeting on its own smaller line; the name splits in two on narrow screens.
  function layout(lang) {
    const [greeting, first, last] = lang.segs;
    const narrow = view.width / view.height < 1.05;
    const lines = narrow
      ? [
          { segs: [greeting], size: GREETING_SIZE },
          { segs: [first], size: 1 },
          { segs: [last], size: 1 },
        ]
      : [
          { segs: [greeting], size: GREETING_SIZE },
          { segs: [first, last], size: 1 },
        ];

    for (const line of lines) {
      line.width =
        (line.segs.reduce((sum, seg) => sum + seg.w * EM, 0) + SPACE * (line.segs.length - 1)) *
        line.size;
    }
    const widest = Math.max(...lines.map((line) => line.width));
    const tallest = lines.reduce((sum, line) => sum + line.size * LINE_HEIGHT, 0);
    const em = Math.min((view.width * 0.84) / widest, (view.height * 0.46) / tallest, view.height * 0.17);

    const homes = [];
    let y = view.height * 0.07 + (tallest * em) / 2;
    for (const line of lines) {
      const scale = line.size * em;
      y -= line.size * LINE_HEIGHT * em;
      let x = (-line.width * em) / 2;
      for (const seg of line.segs) {
        for (const letter of seg.letters) {
          homes.push({
            g: letter.g,
            scale,
            // 0.3 em lifts the baseline so the x-height sits mid-line
            home: new THREE.Vector3(x + letter.x * EM * scale, y + (0.3 + letter.y * EM) * scale, 0),
          });
        }
        x += (seg.w * EM + SPACE) * scale;
      }
    }
    return homes;
  }

  // ------------------------------------------------------------ state

  let langIndex = 0;
  let mode = 'float'; // 'float' | 'fallen'
  let cycleTimer = 0;
  let pendingSpawn = null;
  const letters = [];
  const shards = [];
  const pointer = new THREE.Vector3(1e6, 1e6, 0);
  const tmp = new THREE.Vector3();
  const spin = new THREE.Quaternion();

  function spawn() {
    const lang = data.langs[langIndex];
    const materials = [capMaterial, sideMaterials[lang.id]];
    for (const { g, scale, home } of layout(lang)) {
      const mesh = new THREE.Mesh(getLetterGeometry(g), materials);
      const angle = rand(0, Math.PI * 2);
      const radius = view.width * rand(0.25, 0.6);
      mesh.position.set(
        home.x + Math.cos(angle) * radius,
        home.y + Math.sin(angle) * radius,
        rand(-8, 4)
      );
      mesh.scale.setScalar(0.001);
      scene.add(mesh);
      letters.push({
        mesh,
        g,
        home,
        scale,
        shown: 0,
        state: 'float',
        delay: 0,
        age: 0,
        velocity: new THREE.Vector3(),
        angular: new THREE.Vector3(),
        phase: [rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)],
        tumble: new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-2, 2)),
      });
    }
  }

  function dismiss() {
    for (const letter of letters) {
      if (letter.state !== 'float') continue;
      letter.state = 'out';
      letter.delay = rand(0, 0.25);
      letter.velocity.set(rand(-1, 1), rand(-1, 1), rand(-3, 0)).multiplyScalar(view.height * 0.12);
    }
  }

  function drop() {
    mode = 'fallen';
    pendingSpawn = null;
    for (const letter of letters) {
      if (letter.state !== 'float') continue;
      letter.state = 'fall';
      letter.delay = rand(0, 0.45);
      letter.angular.set(rand(-2.5, 2.5), rand(-2.5, 2.5), rand(-2.5, 2.5));
    }
  }

  function shatter(letter) {
    const { mesh, g, scale, velocity } = letter;
    for (const { geometry, offset } of getShardGeometry(g)) {
      const shard = new THREE.Mesh(geometry, mesh.material);
      shard.position.copy(offset).multiplyScalar(scale).applyQuaternion(mesh.quaternion).add(mesh.position);
      shard.quaternion.copy(mesh.quaternion);
      shard.scale.setScalar(scale);
      scene.add(shard);
      shards.push({
        mesh: shard,
        scale,
        age: 0,
        life: rand(2.2, 3.4),
        radius: geometry.boundingSphere.radius,
        velocity: new THREE.Vector3(
          velocity.x * 0.5 + rand(-1, 1) * view.height * 0.22,
          -velocity.y * rand(0.15, 0.45),
          rand(-1, 1) * view.height * 0.1
        ),
        angular: new THREE.Vector3(rand(-7, 7), rand(-7, 7), rand(-7, 7)),
      });
    }
    scene.remove(mesh);
  }

  function rotate(mesh, angular, dt) {
    const speed = angular.length();
    if (speed < 1e-4) return;
    spin.setFromAxisAngle(tmp.copy(angular).divideScalar(speed), speed * dt);
    mesh.quaternion.premultiply(spin);
  }

  window.addEventListener('pointermove', (e) => overlay.toWorld(e.clientX, e.clientY, pointer));
  window.addEventListener('pointerleave', () => pointer.set(1e6, 1e6, 0));

  spawn();

  // ------------------------------------------------------------ frame

  function update(dt, time) {
    const scrolled = window.scrollY / Math.max(window.innerHeight, 1);
    if (mode === 'float' && scrolled > FALL_AT) drop();
    if (mode === 'fallen' && scrolled < RESET_AT) {
      mode = 'float';
      cycleTimer = 0;
      spawn();
    }

    if (mode === 'float') {
      cycleTimer += dt;
      if (cycleTimer > CYCLE_SECONDS) {
        cycleTimer = 0;
        dismiss();
        langIndex = (langIndex + 1) % data.langs.length;
        pendingSpawn = 0.3;
      }
      if (pendingSpawn !== null && (pendingSpawn -= dt) <= 0) {
        pendingSpawn = null;
        spawn();
      }
    }

    const gravity = view.height * 1.7;
    const floor = -view.height / 2;
    const reach = view.height * 0.14;

    for (let i = letters.length - 1; i >= 0; i--) {
      const letter = letters[i];
      const { mesh, velocity, phase } = letter;
      letter.age += dt;
      const falling = letter.state === 'fall' && (letter.delay -= dt) <= 0;

      if (falling) {
        velocity.y -= gravity * dt;
        mesh.position.addScaledVector(velocity, dt);
        rotate(mesh, letter.angular, dt);
        const halfHeight = data.glyphs[letter.g].h * EM * letter.scale * 0.4;
        if (mesh.position.y - halfHeight < floor) {
          shatter(letter);
          letters.splice(i, 1);
        }
        continue;
      }

      if (letter.state === 'out' && (letter.delay -= dt) <= 0) {
        letter.shown += (0 - letter.shown) * Math.min(1, dt * 7);
        mesh.position.addScaledVector(velocity, dt);
        mesh.scale.setScalar(Math.max(letter.shown, 0.001) * letter.scale);
        if (letter.shown < 0.03) {
          scene.remove(mesh);
          letters.splice(i, 1);
        }
        continue;
      }

      // Weightless: a soft spring toward a slowly wandering point near home.
      // (mostly in depth, so neighbours don't drift into each other)
      const drift = letter.scale * 0.06;
      tmp.set(
        letter.home.x + Math.sin(time * 0.5 + phase[0]) * drift,
        letter.home.y + Math.cos(time * 0.4 + phase[1]) * drift * 1.5,
        Math.sin(time * 0.3 + phase[2]) * drift * 6
      );
      velocity.addScaledVector(tmp.sub(mesh.position), 11 * dt);

      // the pointer nudges letters out of its way
      tmp.copy(mesh.position).sub(pointer).setZ(0);
      const distance = tmp.length();
      if (distance < reach && distance > 1e-4) {
        velocity.addScaledVector(tmp, ((1 - distance / reach) * view.height * 4 * dt) / distance);
      }

      velocity.multiplyScalar(Math.exp(-4.5 * dt));
      mesh.position.addScaledVector(velocity, dt);

      // gentle wobble, plus the tumble it flew in with, fading out
      const settle = Math.exp(-letter.age * 2.2);
      mesh.rotation.set(
        Math.sin(time * 0.45 + phase[1]) * 0.16 + letter.tumble.x * settle,
        Math.sin(time * 0.35 + phase[2]) * 0.2 + letter.tumble.y * settle,
        Math.sin(time * 0.3 + phase[0]) * 0.07 + letter.tumble.z * settle
      );

      letter.shown += (1 - letter.shown) * Math.min(1, dt * 5);
      mesh.scale.setScalar(letter.shown * letter.scale);
    }

    for (let i = shards.length - 1; i >= 0; i--) {
      const shard = shards[i];
      const { mesh, velocity } = shard;
      shard.age += dt;

      velocity.y -= gravity * dt;
      mesh.position.addScaledVector(velocity, dt);
      rotate(mesh, shard.angular, dt);

      const rest = floor + shard.radius * shard.scale * 0.5;
      if (mesh.position.y < rest) {
        mesh.position.y = rest;
        velocity.y = Math.abs(velocity.y) > view.height * 0.08 ? -velocity.y * 0.32 : 0;
        velocity.x *= 0.6;
        velocity.z *= 0.6;
        shard.angular.multiplyScalar(0.55);
      }

      const fade = THREE.MathUtils.clamp((shard.life - shard.age) / 0.5, 0, 1);
      mesh.scale.setScalar(Math.max(fade, 0.001) * shard.scale);
      if (shard.age > shard.life) {
        scene.remove(mesh);
        shards.splice(i, 1);
      }
    }
  }

  // Re-seat floating letters when the viewport changes shape.
  function resize() {
    const homes = layout(data.langs[langIndex]);
    const floating = letters.filter((letter) => letter.state === 'float');
    if (floating.length !== homes.length) return;
    floating.forEach((letter, i) => {
      letter.home.copy(homes[i].home);
      letter.scale = homes[i].scale;
    });
  }

  return { update, resize };
}
