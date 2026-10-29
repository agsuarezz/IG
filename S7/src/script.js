import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "lil-gui";

import earthImg from "./textures/earth.jpg";
import mercuryImg from "./textures/mercury.jpg";
import venusImg from "./textures/venus.jpg";
import marsImg from "./textures/mars.jpg";
import jupiterImg from "./textures/jupiter.jpg";
import saturnImg from "./textures/saturn.jpg";
import saturnRingImg from "./textures/saturn_ring.png";
import uranusImg from "./textures/uranus.jpg";
import neptuneImg from "./textures/neptune.jpg";
import sunImg from "./textures/sun.jpg";
import moonImg from "./textures/moon.jpg";
import earthBumpImg from "./textures/earthbump1k.jpg";
import earthSpecImg from "./textures/earthspec1k.jpg";
import earthCloudImg from "./textures/earthcloudmap.jpg";
import fondoImg from "./textures/fondo.jpg";

const TEXTURAS = {
  "earth.jpg": earthImg,
  "mercury.jpg": mercuryImg,
  "venus.jpg": venusImg,
  "mars.jpg": marsImg,
  "jupiter.jpg": jupiterImg,
  "saturn.jpg": saturnImg,
  "saturn_ring.png": saturnRingImg,
  "uranus.jpg": uranusImg,
  "neptune.jpg": neptuneImg,
  "moon.jpg" : moonImg,
  "sun.jpg" : sunImg,
  "earthbump1k.jpg": earthBumpImg,
  "earthspec1k.jpg": earthSpecImg,
  "earthcloudmap.jpg": earthCloudImg,
  "fondo.jpg": fondoImg,
};


const MAX_PLANETS = 12;
const ORBIT_K = 4;
const SUN_RADIUS = 1.5;

const SISTEMA = [
  {
    nombre: "Mercurio",
    radio: 0.22,
    dist: 5,
    f1: 1.0,
    f2: 0.95,
    color: 0x9a8f87,
    tex: "mercury.jpg",
    spin: 0.5,
  },
  {
    nombre: "Venus",
    radio: 0.38,
    dist: 7,
    f1: 1.0,
    f2: 1.0,
    color: 0xd9b27c,
    tex: "venus.jpg",
    spin: -0.3,
  },
  {
    nombre: "Tierra",
    radio: 0.42,
    dist: 9.5,
    f1: 1.02,
    f2: 0.98,
    color: 0x3b6fd1,
    tex: "earth.jpg",
    bump: "earthbump1k.jpg",
    spec: "earthspec1k.jpg",
    nubes: { tex: "earthcloudmap.jpg", alpha: "earthcloudmap.jpg" },
    spin: 2,
    moons: [
      { nombre: "Luna", radio: 0.12, dist: 0.9, speed: 1.6, color: 0xaaaaaa, tex: "moon.jpg" },
    ],
  },
  {
    nombre: "Marte",
    radio: 0.3,
    dist: 12,
    f1: 1.0,
    f2: 1.05,
    color: 0xc1440e,
    tex: "mars.jpg",
    spin: 1.8,
    moons: [
      { nombre: "Fobos", radio: 0.06, dist: 0.6, speed: 3.0, color: 0x887766 },
      { nombre: "Deimos", radio: 0.05, dist: 0.85, speed: 2.0, color: 0x998877 },
    ],
  },
  {
    nombre: "Júpiter",
    radio: 0.95,
    dist: 16.5,
    f1: 1.0,
    f2: 0.97,
    color: 0xc9a27e,
    tex: "jupiter.jpg",
    spin: 3,
    moons: [
      { nombre: "Ío", radio: 0.1, dist: 1.4, speed: 2.2, color: 0xe3d36b },
      { nombre: "Europa", radio: 0.09, dist: 1.75, speed: 1.7, color: 0xddd0b8 },
    ],
  },
  {
    nombre: "Saturno",
    radio: 0.8,
    dist: 21,
    f1: 1.0,
    f2: 1.0,
    color: 0xd8c58f,
    tex: "saturn.jpg",
    anillo: true,
    anilloTex: "saturn_ring.png",
    spin: 2.7,
    moons: [{ nombre: "Titán", radio: 0.15, dist: 2.9, speed: 1.0, color: 0xd9a05b }],
  },
  { 
    nombre: "Urano", 
    radio: 0.55, 
    dist: 25.5, 
    f1: 1.0, 
    f2: 1.0, 
    color: 0x9fd6e0, 
    tex: "uranus.jpg", 
    spin: 2 },
  { 
    nombre: "Neptuno", 
    radio: 0.52, 
    dist: 30, 
    f1: 1.0, 
    f2: 1.0, 
    color: 0x4466dd, 
    tex: "neptune.jpg", 
    spin: 2 },
];

let scene, renderer, camera, camNave, camControls;
let star, sunLight, plano, raycaster, info, gui, ctrlPlaneta;
let planets = [];
let tSim = 0;
let tPrev = performance.now();
let downPos = null;
const loader = new THREE.TextureLoader();

const params = {
  vista: "General", // General | Nave
  velocidad: 1,
  planeta: 2, // planeta seguido por la nave
  distancia: 10,
  mirar: "Planeta", // Planeta | Sol
  orbitas: true,
  intensidadSol: 2.5,
  anadir: () => addRandomPlanet(),
  borrar: () => removeLastPlanet(),
};

// ---------------------------------------------------------------
//  INICIALIZACIÓN
// ---------------------------------------------------------------
function init() {
  info = document.createElement("div");
  info.style.position = "absolute";
  info.style.top = "30px";
  info.style.width = "100%";
  info.style.textAlign = "center";
  info.style.color = "#fff";
  info.style.fontWeight = "bold";
  info.style.backgroundColor = "transparent";
  info.style.zIndex = "1";
  info.style.fontFamily = "Monospace";
  info.style.pointerEvents = "none";
  document.body.appendChild(info);

  scene = new THREE.Scene();

  // Cámara general
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.up.set(0, 0, 1);
  camera.position.set(0, -28, 20);

  // Cámara subjetiva de la nave
  camNave = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.05,
    2000
  );
  camNave.up.set(0, 0, 1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setScissorTest(true);
  document.body.appendChild(renderer.domElement);

  camControls = new OrbitControls(camera, renderer.domElement);
  camControls.enableDamping = true;

  // Plano invisible para colocar planetas con el ratón
  plano = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  );
  plano.visible = false;
  scene.add(plano);
  raycaster = new THREE.Raycaster();

  createBackground();
  createStar(SUN_RADIUS);

  // Iluminación: luz ambiente tenue + luz puntual en el Sol
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  sunLight = new THREE.PointLight(0xffffff, params.intensidadSol, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 120;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  for (const def of SISTEMA) createPlanet(def);

  initGUI();

  // Un clic sin arrastrar crea un planeta (arrastrar mueve la cámara)
  renderer.domElement.addEventListener("pointerdown", (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", () =>
    renderer.setSize(window.innerWidth, window.innerHeight)
  );
}

// ---------------------------------------------------------------
//  TEXTURAS
// ---------------------------------------------------------------
function cargarMapa(mat, prop, archivo, esColor = false, onLoad = null) {
  const url = TEXTURAS[archivo];
  if (!url) {
    console.warn("Textura no registrada: " + archivo);
    return;
  }
  loader.load(
    url,
    (t) => {
      if (esColor && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      mat[prop] = t;
      if (prop === "map") mat.color.set(0xffffff);
      mat.needsUpdate = true;
      if (onLoad) onLoad();
    },
    undefined,
    () => console.warn("Error cargando textura: " + archivo)
  );
}

// ---------------------------------------------------------------
//  OBJETOS
// ---------------------------------------------------------------
function createStar(radius) {
  const geometry = new THREE.SphereGeometry(radius, 48, 48);
  geometry.rotateX(Math.PI / 2); // polos en el eje Z
  // MeshBasicMaterial: el Sol emite luz, no la recibe
  const material = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
  cargarMapa(material, "map", "sun.jpg", true);
  star = new THREE.Mesh(geometry, material);
  scene.add(star);
}

function createBackground() {
  const geo = new THREE.SphereGeometry(900, 64, 64);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000, // negro hasta que cargue la textura
    side: THREE.BackSide, // se ve desde dentro
    depthWrite: false,
  });
  cargarMapa(mat, "map", "fondo.jpg", true);
  const sky = new THREE.Mesh(geo, mat);
  sky.rotation.x = Math.PI / 2; // polos de la imagen en el eje Z
  scene.add(sky);
}

function createPlanet(def) {
  const group = new THREE.Group();

  // Cuerpo del planeta
  const geo = new THREE.SphereGeometry(def.radio, 48, 48);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({ color: def.color });
  if (def.tex) cargarMapa(mat, "map", def.tex, true);
  if (def.bump) {
    cargarMapa(mat, "bumpMap", def.bump);
    mat.bumpScale = 0.5;
  }
  if (def.spec) {
    cargarMapa(mat, "specularMap", def.spec);
    mat.specular = new THREE.Color("grey");
  }
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Capa de nubes (Tierra)
  let nubes = null;
  if (def.nubes) {
    const cg = new THREE.SphereGeometry(def.radio * 1.03, 48, 48);
    cg.rotateX(Math.PI / 2);
    const cm = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    nubes = new THREE.Mesh(cg, cm);
    nubes.visible = false; // hasta que cargue el mapa alfa
    cargarMapa(cm, "map", def.nubes.tex, true);
    cargarMapa(cm, "alphaMap", def.nubes.alpha, false, () => {
      nubes.visible = true;
    });
    group.add(nubes);
  }

  // Anillo (Saturno)
if (def.anillo) {
  const inner = def.radio * 1.4, outer = def.radio * 2.3;
  const rg = new THREE.RingGeometry(inner, outer, 128);
  // UV radiales: la textura del anillo es una franja horizontal
  const pos = rg.attributes.position, uv = rg.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, v.length() < (inner + outer) / 2 ? 0 : 1, 1);
  }
  const rm = new THREE.MeshPhongMaterial({
    color: 0xcbb68a, side: THREE.DoubleSide, transparent: true,
  });
  if (def.anilloTex) cargarMapa(rm, "map", def.anilloTex, true);
  const ring = new THREE.Mesh(rg, rm);
  ring.castShadow = true;
  ring.receiveShadow = true;
  group.add(ring);
}

  // Lunas: hijas del planeta, se mueven en coordenadas locales
  const moons = [];
  for (const m of def.moons || []) {
    const mg = new THREE.SphereGeometry(m.radio, 24, 24);
    const mm = new THREE.MeshPhongMaterial({ color: m.color });
    if (m.tex) cargarMapa(mm, "map", m.tex, true);
    const moon = new THREE.Mesh(mg, mm);
    moon.castShadow = true;
    moon.receiveShadow = true;
    moon.userData = {
      dist: m.dist,
      speed: m.speed,
      angle0: Math.random() * Math.PI * 2,
    };
    group.add(moon);
    moons.push(moon);
  }

  // Órbita elíptica
  const curve = new THREE.EllipseCurve(0, 0, def.dist * def.f1, def.dist * def.f2);
  const orbit = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(128)),
    new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.8 })
  );
  orbit.visible = params.orbitas;
  scene.add(orbit);

  group.userData = {
    nombre: def.nombre,
    radio: def.radio,
    dist: def.dist,
    f1: def.f1,
    f2: def.f2,
    speed: ORBIT_K / Math.pow(def.dist, 1.5),
    initialAngle: def.angulo ?? Math.random() * Math.PI * 2,
    spin: def.spin ?? 1,
    body,
    nubes,
    moons,
    orbit,
  };

  scene.add(group);
  planets.push(group);
  actualizarGUIPlanetas();
  return group;
}

function randomDef(dist, angulo) {
  const radio = THREE.MathUtils.randFloat(0.2, 0.6);
  const moons =
    Math.random() < 0.4
      ? [
          {
            nombre: "Luna",
            radio: radio * 0.3,
            dist: radio * 2.2,
            speed: THREE.MathUtils.randFloat(1, 3),
            color: 0xaaaaaa,
          },
        ]
      : [];
  return {
    nombre: "Planeta " + (planets.length + 1),
    radio,
    dist,
    f1: THREE.MathUtils.randFloat(0.9, 1.1),
    f2: THREE.MathUtils.randFloat(0.9, 1.1),
    color: new THREE.Color().setHSL(Math.random(), 0.6, 0.55).getHex(),
    angulo,
    spin: 1,
    moons,
  };
}

function addRandomPlanet() {
  if (planets.length >= MAX_PLANETS) return;
  createPlanet(randomDef(THREE.MathUtils.randFloat(5, 28)));
}

function removeLastPlanet() {
  if (planets.length <= 1) return;
  const p = planets.pop();
  scene.remove(p);
  scene.remove(p.userData.orbit);
  p.userData.orbit.geometry.dispose();
  p.userData.orbit.material.dispose();
  p.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  actualizarGUIPlanetas();
}

// ---------------------------------------------------------------
//  INTERFAZ
// ---------------------------------------------------------------
function initGUI() {
  gui = new GUI();
  gui.add(params, "vista", ["General", "Nave"]).name("Vista");
  gui.add(params, "velocidad", 0, 5, 0.1).name("Velocidad");
  gui
    .add(params, "intensidadSol", 0, 6, 0.1)
    .name("Luz del Sol")
    .onChange((v) => (sunLight.intensity = v));
  gui
    .add(params, "orbitas")
    .name("Mostrar órbitas")
    .onChange((v) => planets.forEach((p) => (p.userData.orbit.visible = v)));

  const fNave = gui.addFolder("Nave");
  ctrlPlaneta = fNave
    .add(params, "planeta", 0, planets.length - 1, 1)
    .name("Planeta seguido");
  fNave.add(params, "distancia", 3, 40, 1).name("Distancia (radios)");
  fNave.add(params, "mirar", ["Planeta", "Sol"]).name("Mirar a");
  fNave.open();

  const fPl = gui.addFolder("Planetas");
  fPl.add(params, "anadir").name("Añadir planeta");
  fPl.add(params, "borrar").name("Borrar último");
  fPl.open();
}

function actualizarGUIPlanetas() {
  if (!ctrlPlaneta) return;
  ctrlPlaneta.max(Math.max(planets.length - 1, 0));
  if (params.planeta > planets.length - 1) params.planeta = planets.length - 1;
  ctrlPlaneta.updateDisplay();
}

function refrescarGUI() {
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

// ---------------------------------------------------------------
//  EVENTOS
// ---------------------------------------------------------------
function onPointerUp(event) {
  if (!downPos) return;
  const movido = Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y);
  downPos = null;
  if (movido > 4) return; // era un arrastre de cámara
  if (params.vista === "Nave") return;

  const W = renderer.domElement.clientWidth;
  const H = renderer.domElement.clientHeight;
  const wVista = W

  const mouse = new THREE.Vector2(
    (event.clientX / wVista) * 2 - 1,
    -(event.clientY / H) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObject(plano);
  if (hit.length > 0 && planets.length < MAX_PLANETS) {
    const p = hit[0].point;
    const dist = Math.max(Math.hypot(p.x, p.y), SUN_RADIUS + 1.5);
    createPlanet(randomDef(dist, Math.atan2(p.y, p.x)));
  }
}

function onKeyDown(e) {
  if (e.key === "v" || e.key === "V") {
    params.vista = params.vista === "General" ? "Nave" : "General";
    refrescarGUI();
  } else if (e.key === "n" || e.key === "N") {
    params.planeta = (params.planeta + 1) % planets.length;
    refrescarGUI();
  }
}

// ---------------------------------------------------------------
//  ANIMACIÓN Y RENDER
// ---------------------------------------------------------------
function actualizarNave() {
  const p = planets[Math.min(params.planeta, planets.length - 1)];
  const r = p.userData.radio;
  const d = r * params.distancia;

  // La nave se coloca entre el Sol y el planeta (ve la cara iluminada)
  const dir = new THREE.Vector3(p.position.x, p.position.y, 0).normalize();
  camNave.position.set(
    p.position.x - dir.x * d,
    p.position.y - dir.y * d,
    d * 0.35 + r
  );
  camNave.lookAt(params.mirar === "Sol" ? star.position : p.position);
}

function drawView(cam, x, y, w, h) {
  renderer.setViewport(x, y, w, h);
  renderer.setScissor(x, y, w, h);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
}

function renderViews() {
  const cam = params.vista === "Nave" ? camNave : camera;
  drawView(cam, 0, 0, window.innerWidth, window.innerHeight);
}

function render() {
  requestAnimationFrame(render);

  const now = performance.now();
  const dt = (now - tPrev) / 1000;
  tPrev = now;
  const dts = dt * params.velocidad;
  tSim += dts;

  star.rotation.z += 0.05 * dts;

  for (const p of planets) {
    const u = p.userData;
    const a = u.initialAngle + tSim * u.speed;
    p.position.set(Math.cos(a) * u.dist * u.f1, Math.sin(a) * u.dist * u.f2, 0);

    u.body.rotation.z += u.spin * dts; // rotación sobre su eje
    if (u.nubes) u.nubes.rotation.z += u.spin * 1.2 * dts;

    for (const m of u.moons) {
      const am = m.userData.angle0 + tSim * m.userData.speed;
      m.position.set(
        Math.cos(am) * m.userData.dist,
        Math.sin(am) * m.userData.dist,
        0
      );
    }
  }

  camControls.enabled = params.vista === "General";
  camControls.update();
  actualizarNave();

  const p = planets[Math.min(params.planeta, planets.length - 1)];
  info.innerHTML =
    `three.js - sistema planetario | Vista: ${params.vista} | Nave en: ${p.userData.nombre}` +
    `<br><span style="font-weight:normal">V: cambiar vista · N: siguiente planeta · clic: nuevo planeta</span>`;

  renderViews();
}

init();
render();