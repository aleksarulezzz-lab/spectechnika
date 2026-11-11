// Параметрические 3D-модели техники, собранные из примитивов three.js.
// Стилизация, а не точная копия: пропорции по ТТХ, цвета по бренду.
// Все машины смотрят вперёд по +X, стоят на y = 0. Метры примерно соответствуют реальным.
// buildMachine(kind, look) → { group, drive(distance) } — drive двигает гусеницы и колёса.

import * as THREE from 'three';

const TAU = Math.PI * 2;

function mats(look) {
  return {
    body: new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.42, metalness: 0.2 }),
    accent: new THREE.MeshStandardMaterial({ color: look.accent ?? 0x23282c, roughness: 0.55, metalness: 0.25 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.75, metalness: 0.2 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.92, metalness: 0.0 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8c9296, roughness: 0.32, metalness: 0.85 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.15, metalness: 1.0 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x223844, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.82 }),
    rim: new THREE.MeshStandardMaterial({ color: look.rim ?? look.color, roughness: 0.4, metalness: 0.35 }),
  };
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

// Плоский профиль (x,y) → объёмная деталь толщиной depth по Z, с фаской.
function profile(points, depth, mat, z = 0, bevel = 0.03) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 12 });
  geo.translate(0, 0, -depth / 2);
  return mesh(geo, mat, 0, 0, z);
}

// Полоса по ломаной с переменной полутолщиной — для стрелы и рукояти.
function beam(path, halfWidths, depth, mat, z = 0) {
  const up = [], down = [];
  for (let i = 0; i < path.length; i++) {
    const p = new THREE.Vector2(...path[i]);
    const a = new THREE.Vector2(...path[Math.max(0, i - 1)]);
    const b = new THREE.Vector2(...path[Math.min(path.length - 1, i + 1)]);
    const t = b.clone().sub(a).normalize();
    const n = new THREE.Vector2(-t.y, t.x).multiplyScalar(halfWidths[i]);
    up.push([p.x + n.x, p.y + n.y]);
    down.push([p.x - n.x, p.y - n.y]);
  }
  return profile([...up, ...down.reverse()], depth, mat, z);
}

// Гидроцилиндр между двумя точками в плоскости XY на глубине z.
function ram(p1, p2, z, m, r = 0.085) {
  const g = new THREE.Group();
  const a = new THREE.Vector3(p1[0], p1[1], z), b = new THREE.Vector3(p2[0], p2[1], z);
  const len = a.distanceTo(b);
  const barrel = mesh(new THREE.CylinderGeometry(r, r, len * 0.58, 14), m.body);
  barrel.position.y = len * 0.29;
  const rod = mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, len * 0.5, 12), m.chrome);
  rod.position.y = len * 0.74;
  g.add(barrel, rod);
  g.position.copy(a);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return g;
}

// Подпись бренда на борту (канвас-текстура).
function label(text, w, h, color = '#1e2226') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * h / w);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = `italic 800 ${Math.round(c.height * 0.72)}px Manrope, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 6, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  return m;
}

/* ---------- Гусеничный ход ---------- */
function track(m, { length, r, width, z, links = 46 }) {
  const g = new THREE.Group();
  const cx1 = -length / 2 + r, cx2 = length / 2 - r;
  const straight = cx2 - cx1;
  const P = 2 * straight + TAU * r;
  const pitch = P / links;

  // рама и катки
  g.add(box(straight + 0.1, r * 0.9, width * 0.55, m.dark, 0, r, z));
  const rollers = [];
  const nRoll = Math.max(4, Math.round(straight / 0.55));
  for (let i = 0; i < nRoll; i++) {
    const x = cx1 + 0.35 + (i * (straight - 0.7)) / (nRoll - 1);
    const roll = mesh(new THREE.CylinderGeometry(r * 0.32, r * 0.32, width * 0.7, 16), m.steel, x, r * 0.42, z);
    roll.rotation.x = Math.PI / 2;
    g.add(roll); rollers.push(roll);
  }
  // ведущая звёздочка (сзади) и направляющее колесо (спереди)
  const sprocket = new THREE.Group();
  const disc = mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, width * 0.6, 24), m.dark);
  disc.rotation.x = Math.PI / 2;
  sprocket.add(disc);
  for (let i = 0; i < 10; i++) {
    const tooth = box(r * 0.22, r * 0.22, width * 0.58, m.steel, Math.cos((i / 10) * TAU) * r * 0.86, Math.sin((i / 10) * TAU) * r * 0.86, 0);
    tooth.rotation.z = (i / 10) * TAU;
    sprocket.add(tooth);
  }
  const hub = mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, width * 0.75, 16), m.steel);
  hub.rotation.x = Math.PI / 2;
  sprocket.add(hub);
  sprocket.position.set(cx1, r, z);
  const idler = mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, width * 0.6, 24), m.dark, cx2, r, z);
  idler.rotation.x = Math.PI / 2;
  g.add(sprocket, idler);
  // траки — один InstancedMesh, двигаются по «стадиону»
  const shoeGeo = new THREE.BoxGeometry(pitch * 0.92, 0.07, width);
  const grouser = new THREE.BoxGeometry(pitch * 0.18, 0.06, width);
  grouser.translate(0, -0.06, 0);
  const merged = mergeGeos([shoeGeo, grouser]);
  const shoes = new THREE.InstancedMesh(merged, m.rubber, links);
  shoes.castShadow = true; shoes.receiveShadow = true;
  g.add(shoes);
  const dummy = new THREE.Object3D();

  function place(offset) {
    for (let i = 0; i < links; i++) {
      let s = (((i * pitch + offset) % P) + P) % P;
      let x, y, a;
      if (s < straight) { x = cx2 - s; y = 0.035; a = Math.PI; } // низ: движется назад при езде вперёд
      else if ((s -= straight) < Math.PI * r) { const t = s / r; x = cx1 - Math.sin(t) * (r - 0.035); y = r - Math.cos(t) * (r - 0.035); a = Math.PI + t; }
      else if ((s -= Math.PI * r) < straight) { x = cx1 + s; y = 2 * r - 0.035; a = 0; }
      else { s -= straight; const t = s / r; x = cx2 + Math.sin(t) * (r - 0.035); y = r + Math.cos(t) * (r - 0.035); a = t; }
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, -a);
      dummy.updateMatrix();
      shoes.setMatrixAt(i, dummy.matrix);
    }
    shoes.instanceMatrix.needsUpdate = true;
  }
  place(0);
  return {
    group: g,
    drive(d) {
      place(-d); // верх гусеницы идёт вперёд, низ стоит на земле
      sprocket.rotation.z = -d / r;
      idler.rotation.z = -d / (r * 0.8);
      rollers.forEach((ro) => { ro.rotation.y = -d / (r * 0.32); });
    },
  };
}

function mergeGeos(geos) {
  // Небольшое слияние без BufferGeometryUtils: только position/normal/index.
  const pos = [], nor = [], idx = [];
  let off = 0;
  for (const g of geos) {
    const gi = g.index ? g : g.toNonIndexed();
    pos.push(...gi.attributes.position.array);
    nor.push(...gi.attributes.normal.array);
    if (gi.index) for (const i of gi.index.array) idx.push(i + off);
    off += gi.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (idx.length) out.setIndex(idx);
  return out;
}

/* ---------- Колесо с протектором ---------- */
function wheel(m, { r, width, x, y, z, lugs = 18 }) {
  const g = new THREE.Group();
  const tire = mesh(new THREE.CylinderGeometry(r, r, width, 32), m.rubber);
  tire.rotation.x = Math.PI / 2;
  const rim = mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, width * 1.02, 24), m.rim);
  rim.rotation.x = Math.PI / 2;
  const cap = mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, width * 1.06, 12), m.steel);
  cap.rotation.x = Math.PI / 2;
  g.add(tire, rim, cap);
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * TAU;
    const lug = box(r * 0.16, r * 0.1, width * 0.46, m.rubber, Math.cos(a) * r, Math.sin(a) * r, (i % 2 ? 1 : -1) * width * 0.22);
    lug.rotation.z = a;
    g.add(lug);
  }
  // спицы обода — чтобы вращение было видно
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const bolt = mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.05, width * 1.08, 8), m.dark, Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, 0);
    bolt.rotation.x = Math.PI / 2;
    g.add(bolt);
  }
  g.position.set(x, y, z);
  return { group: g, drive(d) { g.rotation.z = -d / r; } };
}

/* ---------- Кабина ---------- */
function cab(m, { w, h, d, x, y, z, rops = false }) {
  const g = new THREE.Group();
  g.add(box(w, h, d, m.body, 0, 0, 0));
  g.add(box(w * 1.04, 0.08, d * 1.04, m.accent, 0, h / 2, 0)); // крыша
  // стёкла: перед, бока, зад
  g.add(box(0.02, h * 0.62, d * 0.84, m.glass, w / 2 + 0.005, h * 0.08, 0));
  g.add(box(w * 0.82, h * 0.62, 0.02, m.glass, 0, h * 0.08, d / 2 + 0.005));
  g.add(box(w * 0.82, h * 0.62, 0.02, m.glass, 0, h * 0.08, -d / 2 - 0.005));
  g.add(box(0.02, h * 0.5, d * 0.7, m.glass, -w / 2 - 0.005, h * 0.14, 0));
  if (rops) for (const sz of [-1, 1]) for (const sx of [-1, 1]) g.add(box(0.08, h + 0.1, 0.08, m.accent, sx * w / 2, 0.05, sz * d / 2));
  // поручень
  g.add(box(0.04, 0.04, d * 0.9, m.steel, -w / 2 + 0.1, h / 2 + 0.12, 0));
  g.position.set(x, y + h / 2, z);
  return g;
}

/* ---------- Поворотная платформа экскаватора со стрелой ---------- */
function excavatorUpper(m, look, { len = 1 }) {
  const g = new THREE.Group();
  const S = len;
  // платформа: скруглённая сзади, вид сверху
  const top = new THREE.Shape();
  top.moveTo(1.5 * S, -1.3); top.lineTo(1.5 * S, 1.3); top.lineTo(-2.0 * S, 1.3);
  top.absarc(-2.0 * S, 0, 1.3, Math.PI / 2, Math.PI * 1.5, false);
  top.lineTo(1.5 * S, -1.3);
  const deck = new THREE.ExtrudeGeometry(top, { depth: 0.95, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 20 });
  deck.rotateX(-Math.PI / 2);
  g.add(mesh(deck, m.body, 0, 1.15, 0));
  g.add(box(3.2 * S, 0.12, 2.5, m.dark, -0.4 * S, 1.12, 0)); // юбка
  // капот двигателя и решётка
  g.add(box(1.6 * S, 0.36, 1.7, m.body, -1.75 * S, 2.27, -0.35));
  for (let i = 0; i < 6; i++) g.add(box(1.2 * S, 0.03, 0.04, m.dark, -1.75 * S, 2.46, -0.95 + i * 0.22));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 10), m.dark, -1.2 * S, 2.6, -0.95)); // выхлоп
  // полоса-акцент по борту
  g.add(box(3.0 * S, 0.12, 0.02, m.accent, -0.6 * S, 1.5, 1.33));
  // кабина слева-спереди (ближе к зрителю)
  g.add(cab(m, { w: 1.05, h: 1.55, d: 0.98, x: 0.95 * S, y: 2.1, z: 0.78 }));
  // стрела — «банан»
  const foot = [0.9 * S, 2.0], apex = [3.3 * S, 4.6], tip = [5.6 * S, 3.7];
  const boomPath = [foot, [1.9 * S, 3.4], apex, [4.5 * S, 4.35], tip];
  g.add(beam(boomPath, [0.3, 0.36, 0.42, 0.33, 0.24], 0.52, m.body, -0.05));
  const brand = label(look.brand.toUpperCase(), 1.7 * S, 0.34, '#1e2226');
  brand.position.set(2.45 * S, 3.86, 0.24); brand.rotation.z = 0.62;
  g.add(brand);
  // рукоять
  const armEnd = [6.3 * S, 1.35];
  g.add(beam([[tip[0] - 0.2, tip[1] + 0.35], tip, [5.95 * S, 2.5], armEnd], [0.2, 0.26, 0.22, 0.16], 0.42, m.body, -0.05));
  // ковш
  const bk = new THREE.Group();
  bk.add(profile([[0, 0.15], [0.25, 0.55], [0.15, 0.95], [-0.45, 0.85], [-0.75, 0.35], [-0.55, -0.05], [-0.1, -0.12]], 1.05 * S, m.dark, 0, 0.02));
  for (let i = 0; i < 5; i++) bk.add(box(0.18, 0.08, 0.1, m.steel, -0.62, -0.08, -0.42 + i * 0.21));
  bk.position.set(armEnd[0] + 0.05, armEnd[1] - 0.75, -0.05);
  bk.rotation.z = -0.25;
  g.add(bk);
  // гидроцилиндры
  g.add(ram([1.35 * S, 1.75], [2.75 * S, 3.75], 0.33, m));
  g.add(ram([1.35 * S, 1.75], [2.75 * S, 3.75], -0.43, m));
  g.add(ram([3.0 * S, 4.95], [5.35 * S, 4.35], -0.05, m, 0.075));
  g.add(ram([5.75 * S, 3.55], [6.15 * S, 1.75], -0.05, m, 0.065));
  return g;
}

/* ---------- Сборки ---------- */
function crawlerExcavator(look) {
  const m = mats(look);
  const g = new THREE.Group();
  const s = look.size ?? 1;
  const L = 4.6 * s, r = 0.42 * s;
  const tl = track(m, { length: L, r, width: 0.6, z: 1.2 });
  const tr = track(m, { length: L, r, width: 0.6, z: -1.2 });
  g.add(tl.group, tr.group);
  g.add(box(2.6 * s, 0.45, 1.9, m.dark, 0, 0.62 * s, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.2, 32), m.steel, 0, 1.0 * s, 0));
  const up = excavatorUpper(m, look, { len: s });
  up.position.y = (s - 1) * 0.6;
  g.add(up);
  return { group: g, drive(d) { tl.drive(d); tr.drive(d); } };
}

function wheeledExcavator(look) {
  const m = mats(look);
  const g = new THREE.Group();
  const s = look.size ?? 0.85;
  const R = 0.52;
  const wheels = [];
  for (const x of [-1.45, 1.45]) for (const z of [-0.95, 0.95]) {
    const w = wheel(m, { r: R, width: 0.42, x, y: R, z, lugs: 16 });
    wheels.push(w); g.add(w.group);
  }
  g.add(box(4.0, 0.5, 1.5, m.dark, 0, 0.95, 0)); // рама
  for (const x of [-1.45, 1.45]) g.add(box(0.3, 0.25, 2.1, m.steel, x, R, 0)); // мосты
  for (const x of [-1.45, 1.45]) for (const z of [-1.1, 1.1]) g.add(box(1.2, 0.08, 0.5, m.dark, x, R * 2 + 0.08, z)); // крылья
  // отвал спереди
  g.add(profile([[2.15, 0.2], [2.35, 0.25], [2.4, 0.75], [2.2, 0.8]], 2.3, m.body));
  g.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.2, 32), m.steel, 0, 1.25, 0));
  const up = excavatorUpper(m, look, { len: s });
  up.position.y = 0.25;
  up.scale.set(1, 1, 0.92);
  g.add(up);
  return { group: g, drive(d) { wheels.forEach((w) => w.drive(d)); } };
}

function wheelLoader(look) {
  const m = mats(look);
  const g = new THREE.Group();
  const s = look.size ?? 1;
  const R = 0.8 * s;
  const wheels = [];
  for (const x of [-1.55 * s, 1.3 * s]) for (const z of [-1.0, 1.0]) {
    const w = wheel(m, { r: R, width: 0.62, x, y: R, z, lugs: 20 });
    wheels.push(w); g.add(w.group);
  }
  // задняя рама: моторный отсек, противовес
  g.add(profile([[-3.4 * s, 0.75], [-3.5 * s, 2.05], [-3.0 * s, 2.35], [-0.9 * s, 2.3], [-0.6 * s, 1.0], [-1.0 * s, 0.75]], 1.75, m.body));
  for (let i = 0; i < 5; i++) g.add(box(0.03, 0.9, 1.4, m.dark, -3.48 * s, 1.55, -0.56 + i * 0.28).rotateY(0)); // решётка
  g.add(box(2.2 * s, 0.1, 1.85, m.accent, -2.1 * s, 2.36, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 10), m.dark, -1.5 * s, 2.65, -0.55));
  // крылья
  for (const x of [-1.55 * s, 1.3 * s]) for (const z of [-1.05, 1.05]) g.add(box(1.5 * s, 0.07, 0.68, m.body, x, R * 2 + 0.1, z));
  // кабина
  g.add(cab(m, { w: 1.35, h: 1.6, d: 1.25, x: -0.35 * s, y: 1.6, z: 0, rops: false }));
  g.add(box(1.9 * s, 0.35, 1.3, m.dark, 0.2 * s, 1.15, 0)); // шарнир/рама
  // передняя рама, стрелы, ковш
  for (const z of [-0.7, 0.7]) g.add(beam([[0.4 * s, 1.95], [1.6 * s, 1.65], [2.65 * s, 0.95]], [0.17, 0.2, 0.15], 0.16, m.body, z));
  g.add(box(0.2, 0.2, 1.5, m.body, 1.45 * s, 1.68, 0)); // поперечина
  g.add(ram([0.9 * s, 2.25], [2.1 * s, 1.95], 0, m, 0.1)); // Z-кинематика
  g.add(ram([0.6 * s, 1.0], [1.4 * s, 1.55], 0.62, m, 0.09));
  g.add(ram([0.6 * s, 1.0], [1.4 * s, 1.55], -0.62, m, 0.09));
  const bucket = new THREE.Group();
  const W = (look.bucketWidth ?? 2.6) * s;
  bucket.add(profile([[0, 0], [0.9, 0.02], [1.05, 0.15], [0.35, 0.3], [0.25, 1.05], [0.05, 1.15], [-0.15, 0.6]], W, m.dark, 0, 0.02));
  bucket.add(box(0.12, 0.05, W, m.steel, 1.0, 0.04, 0));
  bucket.position.set(2.55 * s, 0.25, 0);
  g.add(bucket);
  if (look.hybrid) {
    const hev = label('HEV', 0.8, 0.3, '#ffffff');
    hev.position.set(-2.2 * s, 1.75, 0.9); g.add(hev);
  }
  const brand = label(look.brand.toUpperCase(), 1.4, 0.28, '#1e2226');
  brand.position.set(-2.4 * s, 1.35, 0.89);
  g.add(brand);
  return { group: g, drive(d) { wheels.forEach((w) => w.drive(d)); } };
}

function bulldozer(look) {
  const m = mats(look);
  const g = new THREE.Group();
  const r = 0.45;
  const tl = track(m, { length: 3.9, r, width: 0.56, z: 1.05, links: 42 });
  const tr = track(m, { length: 3.9, r, width: 0.56, z: -1.05, links: 42 });
  g.add(tl.group, tr.group);
  g.add(box(3.4, 0.25, 1.6, m.dark, 0, 0.98, 0));
  // моторный отсек и корпус
  g.add(profile([[-0.6, 1.1], [-0.6, 2.25], [1.55, 2.0], [1.75, 1.1]], 1.45, m.body));
  for (let i = 0; i < 5; i++) g.add(box(0.03, 0.6, 1.1, m.dark, 1.72, 1.45, -0.44 + i * 0.22));
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 10), m.dark, 0.9, 2.45, 0.35));
  g.add(box(1.8, 0.95, 2.3, m.body, -1.15, 1.55, 0));
  g.add(cab(m, { w: 1.25, h: 1.3, d: 1.35, x: -1.05, y: 2.02, z: 0, rops: true }));
  // отвал
  const blade = new THREE.Shape();
  blade.moveTo(0, 0); blade.lineTo(0.18, 0); blade.quadraticCurveTo(-0.15, 0.7, 0.12, 1.4); blade.lineTo(-0.06, 1.42); blade.quadraticCurveTo(-0.38, 0.7, 0, 0);
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 3.7, bevelEnabled: false, curveSegments: 16 });
  bg.translate(0, 0, -1.85);
  g.add(mesh(bg, m.body, 2.55, 0.02, 0));
  g.add(box(0.1, 0.06, 3.7, m.steel, 2.62, 0.04, 0));
  for (const z of [-1.2, 1.2]) g.add(beam([[0.2, 0.55], [2.5, 0.45]], [0.1, 0.12], 0.14, m.body, z));
  for (const z of [-0.55, 0.55]) g.add(ram([1.4, 1.9], [2.45, 1.15], z, m, 0.08));
  // рыхлитель сзади
  g.add(box(0.25, 0.25, 2.0, m.body, -2.45, 1.1, 0));
  for (const z of [-0.75, 0, 0.75]) {
    g.add(profile([[-2.4, 1.2], [-2.6, 1.2], [-2.75, 0.05], [-2.55, -0.02], [-2.45, 0.2]], 0.12, m.dark, z, 0.01));
  }
  g.add(ram([-1.9, 1.55], [-2.4, 1.15], 0.5, m, 0.07));
  g.add(ram([-1.9, 1.55], [-2.4, 1.15], -0.5, m, 0.07));
  return { group: g, drive(d) { tl.drive(d); tr.drive(d); } };
}

function backhoe(look) {
  const m = mats(look);
  const g = new THREE.Group();
  const wheels = [];
  const rear = wheel(m, { r: 0.72, width: 0.5, x: -0.95, y: 0.72, z: 0.95, lugs: 18 });
  const rear2 = wheel(m, { r: 0.72, width: 0.5, x: -0.95, y: 0.72, z: -0.95, lugs: 18 });
  const fr = wheel(m, { r: 0.5, width: 0.4, x: 1.35, y: 0.5, z: 0.9, lugs: 14 });
  const fr2 = wheel(m, { r: 0.5, width: 0.4, x: 1.35, y: 0.5, z: -0.9, lugs: 14 });
  wheels.push(rear, rear2, fr, fr2);
  wheels.forEach((w) => g.add(w.group));
  g.add(box(3.3, 0.45, 1.3, m.dark, 0, 0.85, 0));
  g.add(profile([[0.15, 0.95], [0.25, 1.75], [1.9, 1.6], [2.05, 0.95]], 1.15, m.body)); // капот
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 10), m.dark, 0.6, 1.95, 0.35));
  g.add(box(1.5, 0.4, 2.0, m.body, -0.75, 1.25, 0));
  g.add(cab(m, { w: 1.35, h: 1.6, d: 1.6, x: -0.7, y: 1.45, z: 0 }));
  for (const x of [-0.95, 1.35]) for (const z of [-1.0, 1.0]) g.add(box(x < 0 ? 1.1 : 0.8, 0.06, 0.5, m.body, x, (x < 0 ? 1.48 : 1.05), z));
  // фронтальный погрузчик
  for (const z of [-0.8, 0.8]) g.add(beam([[-0.15, 1.85], [1.4, 1.75], [2.55, 0.85]], [0.12, 0.14, 0.11], 0.14, m.body, z));
  const lb = new THREE.Group();
  lb.add(profile([[0, 0], [0.75, 0.02], [0.85, 0.12], [0.3, 0.25], [0.2, 0.85], [0.03, 0.92], [-0.12, 0.5]], 2.2, m.dark, 0, 0.02));
  lb.position.set(2.45, 0.22, 0);
  g.add(lb);
  g.add(ram([0.4, 1.25], [1.6, 1.55], 0.7, m, 0.07));
  g.add(ram([0.4, 1.25], [1.6, 1.55], -0.7, m, 0.07));
  // опоры и обратная лопата сзади (в транспортном положении)
  g.add(box(0.5, 0.5, 2.1, m.body, -1.85, 1.1, 0));
  for (const z of [-1.0, 1.0]) g.add(box(0.14, 0.9, 0.14, m.dark, -2.0, 0.55, z));
  g.add(beam([[-2.0, 1.35], [-2.35, 2.6], [-2.15, 3.35]], [0.15, 0.17, 0.12], 0.3, m.body, 0));
  g.add(beam([[-2.15, 3.35], [-2.7, 2.6], [-2.85, 1.6]], [0.1, 0.11, 0.09], 0.24, m.body, 0));
  const bb = new THREE.Group();
  bb.add(profile([[0, 0], [0.35, 0.1], [0.4, 0.45], [0.05, 0.5], [-0.1, 0.25]], 0.6, m.dark, 0, 0.02));
  bb.position.set(-3.0, 1.2, 0); bb.rotation.z = 0.6;
  g.add(bb);
  g.add(ram([-1.75, 1.6], [-2.2, 2.9], 0.22, m, 0.06));
  const brand = label(look.brand.toUpperCase(), 0.95, 0.22, '#f28c1e');
  brand.position.set(1.0, 1.4, 0.59);
  g.add(brand);
  return { group: g, drive(d) { wheels.forEach((w) => w.drive(d)); } };
}

const builders = { crawler: crawlerExcavator, wheeled: wheeledExcavator, loader: wheelLoader, dozer: bulldozer, backhoe };

export function buildMachine(kind, look) {
  const b = builders[kind] || crawlerExcavator;
  return b(look);
}
