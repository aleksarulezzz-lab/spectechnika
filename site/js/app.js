import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { models, cranes, heroModelId } from './models.js';

const fmtMln = (rub) => (rub / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₽';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Первый экран ---------------- */
function initHero() {
  const hero = document.getElementById('hero');
  const canvas = document.getElementById('heroCanvas');
  const plate = document.getElementById('heroPlate');
  const hint = document.getElementById('heroHint');
  const resetBtn = document.getElementById('heroReset');
  const heroData = models.find((m) => m.id === heroModelId);
  if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'Листайте — машина поедет. Проведите пальцем вбок — повернёте её.';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c3c6, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(4, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 8, bottom: -4, near: 1, far: 30 });
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 20), new THREE.ShadowMaterial({ opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // rig — едет по X; spin — вращение пользователем; внутри модель, нормализованная по длине.
  const rig = new THREE.Group();
  const spin = new THREE.Group();
  rig.add(spin);
  scene.add(rig);

  const TARGET_LENGTH = 4.4; // длина машины в единицах сцены
  let modelHeight = 2;

  function mount(object, yaw = 0) {
    spin.clear();
    const holder = new THREE.Group();
    holder.add(object);
    holder.rotation.y = yaw;
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const s = TARGET_LENGTH / Math.max(size.x, size.z);
    holder.scale.setScalar(s);
    holder.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(holder);
    const c = b2.getCenter(new THREE.Vector3());
    holder.position.set(-c.x, -b2.min.y, -c.z);
    modelHeight = b2.max.y - b2.min.y;
    holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    spin.add(holder);
  }

  if (heroData.glb) {
    new GLTFLoader().load(heroData.glb, (g) => mount(g.scene, heroData.heroYaw || 0), undefined,
      () => mount(buildDraftExcavator()));
  } else {
    mount(buildDraftExcavator());
  }

  // Размеры и камера
  let viewHalfW = 5;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const narrow = w < 720;
    camera.fov = narrow ? 34 : 26;
    camera.position.set(0, 2.1, narrow ? 17 : 15);
    camera.lookAt(0, narrow ? 4.6 : 2.7, 0);
    camera.updateProjectionMatrix();
    const dist = camera.position.z;
    viewHalfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist * camera.aspect;
  }
  window.addEventListener('resize', resize);
  resize();

  // Прокрутка → положение машины
  let progress = 0;
  function readScroll() {
    const r = hero.getBoundingClientRect();
    const total = hero.offsetHeight - window.innerHeight;
    progress = THREE.MathUtils.clamp(-r.top / total, 0, 1);
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  // Вращение мышью / пальцем
  let userYaw = 0, userPitch = 0, targetYaw = 0, targetPitch = 0, dragging = false, lastX = 0, lastY = 0, moved = false;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId); canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    targetYaw += dx * 0.009;
    targetPitch = THREE.MathUtils.clamp(targetPitch + dy * 0.004, -0.25, 0.45);
    resetBtn.hidden = false;
    hint.style.opacity = 0;
  });
  const endDrag = () => { dragging = false; canvas.classList.remove('is-dragging'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', () => { targetYaw = 0; targetPitch = 0; resetBtn.hidden = true; });
  resetBtn.addEventListener('click', () => { targetYaw = 0; targetPitch = 0; resetBtn.hidden = true; });

  // Анимация
  let x = null, travelled = 0;
  const tmp = new THREE.Vector3();
  function frame() {
    const start = -viewHalfW + TARGET_LENGTH * 0.62;
    const end = viewHalfW + TARGET_LENGTH * 0.7;
    const targetX = start + (end - start) * progress;
    if (x === null) x = targetX;
    const prevX = x;
    x += (targetX - x) * (reduceMotion ? 1 : 0.1);
    travelled += Math.abs(x - prevX);

    rig.position.x = x;
    // лёгкое покачивание на ходу
    const speed = Math.min(Math.abs(x - prevX) * 30, 1);
    rig.position.y = Math.abs(Math.sin(travelled * 5)) * 0.025 * speed;
    rig.rotation.z = Math.sin(travelled * 2.6) * 0.006 * speed;

    userYaw += (targetYaw - userYaw) * 0.15;
    userPitch += (targetPitch - userPitch) * 0.15;
    spin.rotation.y = userYaw;
    spin.rotation.x = userPitch;

    sun.position.set(x + 4, 9, 6);
    sun.target.position.set(x, 0, 0);

    // табличка с ценой над машиной
    tmp.set(x, modelHeight + 0.35, 0).project(camera);
    const px = (tmp.x * 0.5 + 0.5) * canvas.clientWidth;
    const py = (-tmp.y * 0.5 + 0.5) * canvas.clientHeight;
    plate.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`;
    plate.style.opacity = progress > 0.12 && progress < 0.85 ? 1 : 0;
    hint.style.opacity = progress > 0.04 || !resetBtn.hidden ? 0 : 1;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Черновая модель из примитивов — показывается, пока нет GLB из Higgsfield.
function buildDraftExcavator() {
  const g = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xe8731a, roughness: 0.45, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.8, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x55595c, roughness: 0.5, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.1, metalness: 0.8 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };

  // гусеницы
  for (const z of [-1.15, 1.15]) {
    const shape = new THREE.Shape();
    const L = 4.6, r = 0.5;
    shape.absarc(-L / 2 + r, r, r, Math.PI / 2, Math.PI * 1.5, false);
    shape.absarc(L / 2 - r, r, r, -Math.PI / 2, Math.PI / 2, false);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    const t = new THREE.Mesh(geo, dark); t.position.set(0, 0, z - 0.3); g.add(t);
    for (let i = -3; i <= 3; i++) box(0.12, 0.08, 0.66, steel, i * 0.6, 1.0, z);
  }
  box(3.4, 0.35, 1.8, dark, 0, 0.72, 0); // рама
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.18, 32), steel); ring.position.set(0, 1.0, 0); g.add(ring);
  // поворотная платформа
  box(3.6, 1.0, 2.6, orange, -0.35, 1.6, 0);
  box(1.0, 0.9, 2.6, orange, -2.0, 1.55, 0).geometry.translate(0, 0, 0); // противовес
  box(1.6, 0.25, 1.1, dark, -1.0, 2.2, 0.55); // капот
  // кабина
  box(1.2, 1.35, 1.0, orange, 0.75, 2.75, 0.75);
  box(1.08, 0.95, 1.02, glass, 0.8, 2.85, 0.75);
  // стрела
  const boom = box(3.2, 0.42, 0.5, orange, 0, 0, -0.2);
  boom.geometry.translate(1.6, 0, 0); boom.position.set(0.9, 2.2, -0.2); boom.rotation.z = 0.62;
  const boom2 = box(1.9, 0.38, 0.46, orange, 0, 0, -0.2);
  boom2.geometry.translate(0.95, 0, 0); boom2.position.set(3.45, 4.0, -0.2); boom2.rotation.z = -0.45;
  // рукоять
  const arm = box(2.6, 0.32, 0.4, orange, 0, 0, -0.2);
  arm.geometry.translate(1.3, 0, 0); arm.position.set(5.1, 3.2, -0.2); arm.rotation.z = -1.25;
  // ковш
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 20, 1, false, 0, Math.PI), dark);
  bucket.rotation.x = Math.PI / 2; bucket.rotation.z = -0.4; bucket.position.set(5.85, 0.8, -0.2); g.add(bucket);
  // гидроцилиндр
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.9, 12), steel);
  cyl.position.set(1.7, 2.6, 0.2); cyl.rotation.z = -1.05; g.add(cyl);
  return g;
}

/* ---------------- Каталог ---------------- */
function bookHTML(m) {
  const half = Math.ceil(m.specs.length / 2);
  const rows = (list) => list.map(([k, v]) => `<div class="spec__row"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  return `
    <div class="book" tabindex="0" role="button" aria-label="Характеристики ${m.name}" aria-expanded="false">
      <div class="book__page"><dl class="spec">${rows(m.specs.slice(half))}</dl><span class="book__folio">2</span></div>
      <div class="book__leaf">
        <div class="book__front">
          <div><div class="brand">${m.brand}</div><div class="title">${m.name}</div></div>
          <div><div class="sub">Технические<br>характеристики</div><div class="hint">наведите, чтобы открыть</div></div>
        </div>
        <div class="book__back"><dl class="spec">${rows(m.specs.slice(0, half))}</dl><span class="book__folio">1</span></div>
      </div>
    </div>`;
}

function cardHTML(m) {
  return `
  <article class="card" data-group="${m.group}" data-id="${m.id}">
    <div class="card__media" data-glb="${m.glb || ''}">
      <span class="card__tag">2025 · после ППП</span>
      <span class="card__tag card__tag--3d">${m.glb ? '3D — наведите' : '3D скоро'}</span>
      <img src="${m.img}" alt="${m.brand} ${m.name} — ${m.type}" loading="lazy">
    </div>
    <div class="card__body">
      <p class="card__type">${m.brand} · ${m.type}</p>
      <h3 class="card__name">${m.name}</h3>
      <div class="badges">${m.badges.map((b) => `<span class="badge">${b}</span>`).join('')}</div>
      <div class="card__price tnum">от ${fmtMln(m.price)} <small>по КП</small></div>
      <p class="card__stock"><span class="dot"></span>В наличии: ${m.stock} шт. · Набережные Челны</p>
    </div>
    <div class="bookzone">${bookHTML(m)}</div>
    <div class="card__actions">
      <a class="btn btn--cta" href="#lead" data-model="${m.name}">КП за 15 минут</a>
      <a class="btn btn--line" href="#lead" data-model="${m.name}" data-intent="leasing">Лизинг</a>
    </div>
  </article>`;
}

function initCatalog() {
  const grid = document.getElementById('grid');
  grid.innerHTML = models.map(cardHTML).join('');
  document.getElementById('stockTotal').textContent = models.reduce((s, m) => s + m.stock, 0);

  // Книга: открывается при наведении, закрывается, когда курсор ушёл. На телефоне — по нажатию.
  grid.querySelectorAll('.book').forEach((book) => {
    const set = (open) => { book.classList.toggle('is-open', open); book.setAttribute('aria-expanded', String(open)); };
    book.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') set(true); });
    book.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') set(false); });
    let lastPointer = 'mouse';
    book.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
    book.addEventListener('click', () => { if (lastPointer !== 'mouse') set(!book.classList.contains('is-open')); });
    book.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(!book.classList.contains('is-open')); } });
    book.addEventListener('focus', () => { if (book.matches(':focus-visible')) set(true); });
    book.addEventListener('blur', () => set(false));
  });

  // Фото → 3D при наведении (если модель есть), иначе — лёгкий наклон фото.
  grid.querySelectorAll('.card__media').forEach((media) => {
    const glb = media.dataset.glb;
    const img = media.querySelector('img');
    if (glb) {
      let viewer = null;
      const show = () => {
        if (!viewer) {
          viewer = document.createElement('model-viewer');
          Object.assign(viewer, { src: glb, alt: img.alt });
          viewer.setAttribute('camera-controls', '');
          viewer.setAttribute('auto-rotate', '');
          viewer.setAttribute('auto-rotate-delay', '0');
          viewer.setAttribute('rotation-per-second', '24deg');
          viewer.setAttribute('interaction-prompt', 'none');
          viewer.setAttribute('shadow-intensity', '1');
          viewer.setAttribute('exposure', '1.05');
          viewer.setAttribute('camera-orbit', '35deg 75deg auto');
          viewer.setAttribute('touch-action', 'pan-y');
          media.appendChild(viewer);
        }
        media.classList.add('is-3d');
      };
      media.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
      media.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') media.classList.remove('is-3d'); });
      media.addEventListener('click', () => (media.classList.contains('is-3d') ? media.classList.remove('is-3d') : show()));
    } else if (!reduceMotion) {
      media.addEventListener('pointermove', (e) => {
        const r = media.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
        img.style.transform = `rotateY(${nx * 10}deg) rotateX(${-ny * 8}deg) scale(1.05)`;
      });
      media.addEventListener('pointerleave', () => { img.style.transform = ''; });
    }
  });

  // Фильтры
  const chips = document.querySelectorAll('.chip');
  chips.forEach((chip) => chip.addEventListener('click', () => {
    chips.forEach((c) => c.classList.toggle('is-active', c === chip));
    const g = chip.dataset.group;
    grid.querySelectorAll('.card').forEach((card) => { card.hidden = g !== 'all' && card.dataset.group !== g; });
  }));

  document.getElementById('cranes').innerHTML = cranes.map((c) => `
    <article class="crane">
      <img src="${c.img}" alt="${c.name}" loading="lazy">
      <div class="crane__body">
        <span class="crane__pre">Предзаказ</span>
        <h3 class="crane__name">${c.name}</h3>
        <div class="badges">${c.facts.map((f) => `<span class="badge">${f}</span>`).join('')}</div>
        <a class="btn btn--line btn--sm" href="#lead" data-model="${c.name}">Встать в очередь</a>
      </div>
    </article>`).join('');
}

/* ---------------- Заявка ---------------- */
function initLead() {
  const select = document.getElementById('leadModel');
  const names = [...models.map((m) => `${m.brand} ${m.name}`), ...cranes.map((c) => c.name), 'Подобрать технику'];
  select.innerHTML = names.map((n) => `<option>${n}</option>`).join('');

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-model], [data-intent]');
    if (!a) return;
    const want = a.dataset.model;
    if (want) { const opt = [...select.options].find((o) => o.text.endsWith(want) || o.text === want); if (opt) select.value = opt.text; }
    document.getElementById('leadLeasing').checked = a.dataset.intent === 'leasing';
  });

  const form = document.getElementById('leadForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = form.phone;
    if (phone.value.replace(/\D/g, '').length < 10) { phone.classList.add('is-error'); phone.focus(); return; }
    phone.classList.remove('is-error');
    const data = Object.fromEntries(new FormData(form));
    data.page = location.href;
    data.utm = location.search;
    // Адрес приёма заявок задаётся при подключении CRM/бота (см. HANDOFF.md). Ключи в код не кладём.
    const endpoint = window.SSB_LEADS_ENDPOINT;
    if (endpoint) {
      try { await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } catch (_) { /* покажем «спасибо» всё равно */ }
    }
    document.getElementById('leadOk').hidden = false;
    form.querySelector('button[type=submit]').disabled = true;
  });
}

initCatalog();
initLead();
initHero();
