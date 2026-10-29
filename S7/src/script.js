import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { FlyControls } from "three/examples/jsm/controls/FlyControls.js";
import GUI from "lil-gui";

// TEXTURAS
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
import earthCloudTransImg from "./textures/earthcloudmaptrans_invert.jpg";
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
  "sun.jpg": sunImg,
  "moon.jpg": moonImg,
  "earthbump1k.jpg": earthBumpImg,
  "earthspec1k.jpg": earthSpecImg,
  "earthcloudmap.jpg": earthCloudImg,
  "fondo.jpg": fondoImg,
  "earthcloudmaptrans_invert.jpg" : earthCloudTransImg,
};

const AUTOR = "Álvaro García Suárez · Informática Gráfica";
const MAX_PLANETS = 12;
const ORBIT_K = 4; // velocidad orbital
const SUN_RADIUS = 1.5;

const DATOS_SOL = {
  datos: {
    Tipo: "Estrella enana amarilla",
    Diámetro: "1 392 700 km",
    "Temperatura superficial": "unos 5 500 °C",
    Edad: "unos 4 600 millones de años",
  },
  curiosidad:
    "Contiene el 99,86 % de toda la masa del sistema solar. Su luz tarda unos 8 minutos en llegar a la Tierra.",
};

// Sistema inicial: 8 planetas, varios con lunas.
const SISTEMA = [
  {
    nombre: "Mercurio",
    radio: 0.22, dist: 5, f1: 1.0, f2: 0.95,
    color: 0x9a8f87, tex: "mercury.jpg", spin: 0.5,
    info: {
      datos: {
        Diámetro: "4 879 km",
        "Distancia al Sol": "57,9 millones de km",
        "Duración del año": "88 días terrestres",
        "Duración del día": "59 días terrestres",
        Lunas: "0",
      },
      curiosidad: "Es el planeta más pequeño y el más cercano al Sol, pero no el más caliente: ese es Venus.",
    },
  },
  {
    nombre: "Venus",
    radio: 0.38, dist: 7, f1: 1.0, f2: 1.0,
    color: 0xd9b27c, tex: "venus.jpg", spin: -0.3,
    info: {
      datos: {
        Diámetro: "12 104 km",
        "Distancia al Sol": "108,2 millones de km",
        "Duración del año": "225 días terrestres",
        "Duración del día": "243 días terrestres",
        Lunas: "0",
      },
      curiosidad: "Gira al revés que casi todos los planetas, y su día dura más que su año.",
    },
  },
  {
    nombre: "Tierra",
    radio: 0.42, dist: 9.5, f1: 1.02, f2: 0.98,
    color: 0x3b6fd1, tex: "earth.jpg",
    bump: "earthbump1k.jpg", spec: "earthspec1k.jpg",
    nubes: { tex: "earthcloudmap.jpg", alpha: "earthcloudmaptrans_invert.jpg" },
    spin: 2,
    moons: [{ nombre: "Luna", radio: 0.12, dist: 0.9, speed: 1.6, color: 0xaaaaaa, tex: "moon.jpg" }],
    info: {
      datos: {
        Diámetro: "12 742 km",
        "Distancia al Sol": "149,6 millones de km",
        "Duración del año": "365,25 días",
        "Duración del día": "24 horas",
        Lunas: "1",
      },
      curiosidad: "Es el único lugar conocido con vida. Alrededor del 71 % de su superficie está cubierta de agua.",
    },
  },
  {
    nombre: "Marte",
    radio: 0.3, dist: 12, f1: 1.0, f2: 1.05,
    color: 0xc1440e, tex: "mars.jpg", spin: 1.8,
    moons: [
      { nombre: "Fobos", radio: 0.06, dist: 0.6, speed: 3.0, color: 0x887766 },
      { nombre: "Deimos", radio: 0.05, dist: 0.85, speed: 2.0, color: 0x998877 },
    ],
    info: {
      datos: {
        Diámetro: "6 779 km",
        "Distancia al Sol": "227,9 millones de km",
        "Duración del año": "687 días terrestres",
        "Duración del día": "24 h 37 min",
        Lunas: "2 (Fobos y Deimos)",
      },
      curiosidad: "Alberga el Monte Olimpo, el volcán más alto del sistema solar: unos 22 km de altura.",
    },
  },
  {
    nombre: "Júpiter",
    radio: 0.95, dist: 16.5, f1: 1.0, f2: 0.97,
    color: 0xc9a27e, tex: "jupiter.jpg", spin: 3,
    moons: [
      { nombre: "Ío", radio: 0.1, dist: 1.4, speed: 2.2, color: 0xe3d36b },
      { nombre: "Europa", radio: 0.09, dist: 1.75, speed: 1.7, color: 0xddd0b8 },
    ],
    info: {
      datos: {
        Diámetro: "139 820 km",
        "Distancia al Sol": "778,5 millones de km",
        "Duración del año": "11,9 años terrestres",
        "Duración del día": "unas 10 horas",
        Lunas: "más de 90",
      },
      curiosidad: "Su Gran Mancha Roja es una tormenta más grande que la Tierra que lleva siglos activa.",
    },
  },
  {
    nombre: "Saturno",
    radio: 0.8, dist: 21, f1: 1.0, f2: 1.0,
    color: 0xd8c58f, tex: "saturn.jpg",
    anillo: true, anilloTex: "saturn_ring.png",
    spin: 2.7,
    moons: [{ nombre: "Titán", radio: 0.15, dist: 2.9, speed: 1.0, color: 0xd9a05b }],
    info: {
      datos: {
        Diámetro: "116 460 km",
        "Distancia al Sol": "1 434 millones de km",
        "Duración del año": "29,4 años terrestres",
        "Duración del día": "unas 10,7 horas",
        Lunas: "más de 140",
      },
      curiosidad: "Sus anillos miden cientos de miles de km de ancho, pero son finísimos: pueden tener solo unas decenas de metros de grosor.",
    },
  },
  {
    nombre: "Urano",
    radio: 0.55, dist: 25.5, f1: 1.0, f2: 1.0,
    color: 0x9fd6e0, tex: "uranus.jpg", spin: 2,
    info: {
      datos: {
        Diámetro: "50 724 km",
        "Distancia al Sol": "2 871 millones de km",
        "Duración del año": "84 años terrestres",
        "Duración del día": "unas 17 horas",
        Lunas: "más de 25",
      },
      curiosidad: "Gira prácticamente tumbado: su eje de rotación está inclinado unos 98°.",
    },
  },
  {
    nombre: "Neptuno",
    radio: 0.52, dist: 30, f1: 1.0, f2: 1.0,
    color: 0x4466dd, tex: "neptune.jpg", spin: 2,
    info: {
      datos: {
        Diámetro: "49 244 km",
        "Distancia al Sol": "4 495 millones de km",
        "Duración del año": "165 años terrestres",
        "Duración del día": "unas 16 horas",
        Lunas: "más de 14",
      },
      curiosidad: "Tiene los vientos más rápidos del sistema solar, de más de 2 000 km/h.",
    },
  },
];


let scene, renderer, camera, camNave, camLibre, camControls, flyControls;
let vistaPrev = "General"; // General | Nave | Nave libre
let libreIniciada = false;
let star, sunLight, plano, raycaster, info, gui, ctrlPlaneta;
let labelsDiv, ficha, autorDiv;
let planets = [];
let seleccionado = null;
let tControls; // TransformControls: flechas para mover el planeta seleccionado
let arrastrando = false; // true mientras se arrastra un planeta con las flechas
let tSim = 0; // tiempo de simulación
let tPrev = performance.now();
let downPos = null;
let ultimoInfo = "";
const loader = new THREE.TextureLoader();

const params = {
  vista: "General", // General | Nave (sigue a un planeta) | Nave libre (FlyControls)
  velocidad: 1,
  planeta: 2, // planeta seguido por la nave (índice)
  distancia: 10, // distancia de la nave, en radios del planeta
  altura: 0.35, // altura de la nave sobre el plano orbital
  mirar: "Planeta", // Planeta | Sol
  orbitas: true,
  etiquetas: true,
  mover: true, // mostrar las flechas de TransformControls en el planeta seleccionado
  intensidadSol: 2.5,
  anadir: () => addRandomPlanet(),
  borrar: () => removeLastPlanet(),
};

function init() {
  info = document.createElement("div");
  Object.assign(info.style, {
    position: "absolute", top: "30px", width: "100%", textAlign: "center",
    color: "#fff", fontWeight: "bold", backgroundColor: "transparent",
    zIndex: "1", fontFamily: "Monospace", pointerEvents: "none",
  });
  document.body.appendChild(info);

  // Autoría
  autorDiv = document.createElement("div");
  autorDiv.textContent = AUTOR;
  Object.assign(autorDiv.style, {
    position: "fixed", left: "16px", bottom: "12px", zIndex: "2",
    color: "#fff", fontFamily: "Monospace", fontSize: "13px", fontWeight: "bold",
    textShadow: "0 0 4px #000", pointerEvents: "none",
  });
  document.body.appendChild(autorDiv);

  // Contenedor de etiquetas con los nombres
  labelsDiv = document.createElement("div");
  Object.assign(labelsDiv.style, {
    position: "fixed", left: "0", top: "0", width: "100%", height: "100%",
    zIndex: "1", pointerEvents: "none", overflow: "hidden",
  });
  document.body.appendChild(labelsDiv);

  // Ficha didáctica
  ficha = document.createElement("div");
  Object.assign(ficha.style, {
    position: "fixed", left: "16px", top: "80px", width: "290px", zIndex: "3",
    display: "none", color: "#fff", fontFamily: "Segoe UI, Arial, sans-serif",
    fontSize: "13px", lineHeight: "1.4", background: "rgba(0,0,0,0.75)",
    border: "1px solid rgba(255,255,255,0.25)", borderRadius: "8px", padding: "12px 14px",
  });
  document.body.appendChild(ficha);

  scene = new THREE.Scene();

  // Cámara general
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -36, 26);

  // Cámara subjetiva de la nave
  camNave = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 2000);
  camNave.up.set(0, 0, 1);

  // Cámara de la nave libre
  camLibre = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 2000);
  camLibre.up.set(0, 0, 1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setScissorTest(true);
  document.body.appendChild(renderer.domElement);

  camControls = new OrbitControls(camera, renderer.domElement);
  camControls.enableDamping = true;

  // Nave libre: W/S/A/D moverse, R/F subir/bajar, Q/E girar, arrastrar para mirar
  flyControls = new FlyControls(camLibre, renderer.domElement);
  flyControls.dragToLook = true;
  flyControls.movementSpeed = 6;
  flyControls.rollSpeed = 0.8;

  // Control de transformación: mover el planeta seleccionado por el plano orbital
  tControls = new TransformControls(camera, renderer.domElement);
  tControls.setMode("translate");
  tControls.showZ = false;
  tControls.setSize(0.8);

  scene.add(typeof tControls.getHelper === "function" ? tControls.getHelper() : tControls);
  tControls.addEventListener("dragging-changed", (e) => {
    arrastrando = e.value;
    camControls.enabled = !e.value;
    if (!e.value) finalizarArrastre();
  });
  tControls.addEventListener("objectChange", limitarArrastre);

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

  // Un clic sin arrastrar selecciona un astro o crea un planeta
  renderer.domElement.addEventListener("pointerdown", (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", () =>
    renderer.setSize(window.innerWidth, window.innerHeight)
  );
}

// Carga de texturas
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

//Etiquetado de planetas
function crearEtiqueta(texto, pequena = false) {
  const el = document.createElement("div");
  el.textContent = texto;
  Object.assign(el.style, {
    position: "absolute", left: "0", top: "0", color: "#fff",
    fontFamily: "Monospace", fontSize: pequena ? "10px" : "12px",
    opacity: pequena ? "0.75" : "1", whiteSpace: "nowrap", display: "none",
    textShadow: "0 0 4px #000, 0 0 2px #000", pointerEvents: "none",
  });
  labelsDiv.appendChild(el);
  return el;
}

const _v = new THREE.Vector3();
function ponerEtiqueta(obj, el, cam, extraVisible = true) {
  if (!el) return;
  obj.getWorldPosition(_v);
  _v.project(cam);
  const visible =
    params.etiquetas && extraVisible &&
    _v.z < 1 && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1;
  el.style.display = visible ? "block" : "none";
  if (visible) {
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    el.style.transform = `translate(${x}px, ${y - 14}px) translate(-50%, -100%)`;
  }
}

function actualizarEtiquetas(cam) {
  ponerEtiqueta(star, star.userData.label, cam);
  for (const p of planets) {
    ponerEtiqueta(p, p.userData.label, cam);
    // Los nombres de las lunas solo se ven cuando la cámara está cerca
    const cerca = cam.position.distanceTo(p.position) < 14;
    for (const m of p.userData.moons) ponerEtiqueta(m, m.userData.label, cam, cerca);
  }
}

//Creación de objetos
function createBackground() {
  const geo = new THREE.SphereGeometry(900, 64, 64);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide,
    depthWrite: false,
  });
  cargarMapa(mat, "map", "fondo.jpg", true);
  const sky = new THREE.Mesh(geo, mat);
  sky.rotation.x = Math.PI / 2;
  scene.add(sky);
}

function createStar(radius) {
  const geometry = new THREE.SphereGeometry(radius, 48, 48);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
  cargarMapa(material, "map", "sun.jpg", true);
  star = new THREE.Mesh(geometry, material);
  star.userData = { nombre: "Sol", info: DATOS_SOL, label: crearEtiqueta("Sol") };
  scene.add(star);
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
      color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    nubes = new THREE.Mesh(cg, cm);
    nubes.visible = false;
    cargarMapa(cm, "map", def.nubes.tex, true);
    cargarMapa(cm, "alphaMap", def.nubes.alpha, false, () => {
      nubes.visible = true;
    });
    group.add(nubes);
  }

  // Anillo (Saturno)
  if (def.anillo) {
    const inner = def.radio * 1.4;
    const outer = def.radio * 2.3;
    const rg = new THREE.RingGeometry(inner, outer, 128);
    const pos = rg.attributes.position;
    const uv = rg.attributes.uv;
    const v = new THREE.Vector3();
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
      nombre: m.nombre,
      dist: m.dist,
      speed: m.speed,
      angle0: Math.random() * Math.PI * 2,
      label: crearEtiqueta(m.nombre, true),
    };
    group.add(moon);
    moons.push(moon);
  }

  // Órbita elíptica
  const curve = new THREE.EllipseCurve(0, 0, def.dist * def.f1, def.dist * def.f2);
  const orbit = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(128)),
    new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.45 })
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
    info: def.info,
    label: crearEtiqueta(def.nombre),
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
    info: {
      datos: {
        Tipo: "Planeta creado por ti",
        "Radio (unidades)": radio.toFixed(2),
        "Distancia al Sol (unidades)": dist.toFixed(1),
        Lunas: String(moons.length),
      },
      curiosidad:
        "Cuanto más lejos está un planeta del Sol, más lento orbita: es la tercera ley de Kepler.",
    },
  };
}

function addRandomPlanet() {
  if (planets.length >= MAX_PLANETS) return;
  createPlanet(randomDef(THREE.MathUtils.randFloat(5, 28)));
}

function removePlanet(p) {
  const i = planets.indexOf(p);
  if (i < 0 || planets.length <= 1) return;
  planets.splice(i, 1);
  if (tControls.object === p) tControls.detach();
  if (seleccionado === p) deseleccionar();

  scene.remove(p);
  scene.remove(p.userData.orbit);
  p.userData.orbit.geometry.dispose();
  p.userData.orbit.material.dispose();
  p.userData.label.remove();
  p.userData.moons.forEach((m) => m.userData.label.remove());
  p.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  actualizarGUIPlanetas();
}

function removeLastPlanet() {
  removePlanet(planets[planets.length - 1]);
}

//Selección de planetas con su ficha didáctica
function seleccionar(obj) {
  seleccionado = obj;
  resaltarOrbitas();
  mostrarFicha(obj);
}

function deseleccionar() {
  seleccionado = null;
  ficha.style.display = "none";
  resaltarOrbitas();
}

function resaltarOrbitas() {
  for (const p of planets) {
    p.userData.orbit.material.opacity = p === seleccionado ? 1 : 0.45;
  }
}

//Movimiento de planetas
function actualizarGizmo() {
  const quiere =
    params.mover && params.vista === "General" && seleccionado && seleccionado !== star;
  if (quiere && tControls.object !== seleccionado) tControls.attach(seleccionado);
  else if (!quiere && tControls.object) tControls.detach();
}

// Mientras se arrastra: se mantiene en el plano XY y fuera del Sol
function limitarArrastre() {
  const o = tControls.object;
  if (!o) return;
  o.position.z = 0;
  const r = Math.hypot(o.position.x, o.position.y);
  const rMin = SUN_RADIUS + 1.2;
  if (r < rMin) {
    if (r < 1e-6) o.position.set(rMin, 0, 0);
    else o.position.multiplyScalar(rMin / r);
  }
}

// Al soltar: la nueva posición pasa a ser un punto de su nueva órbita
function finalizarArrastre() {
  const p = tControls.object;
  if (!p) return;
  const u = p.userData;

  // Elipse de semiejes dist*f1 y dist*f2 que pasa por la posición actual
  const x = p.position.x / u.f1;
  const y = p.position.y / u.f2;
  const d = Math.hypot(x, y);
  const a = Math.atan2(y, x);

  u.dist = d;
  u.speed = ORBIT_K / Math.pow(d, 1.5); // Kepler: más lejos, más lento
  u.initialAngle = a - tSim * u.speed; // continúa desde donde se soltó

  // Reconstruir la línea de la órbita
  u.orbit.geometry.dispose();
  u.orbit.geometry = new THREE.BufferGeometry().setFromPoints(
    new THREE.EllipseCurve(0, 0, d * u.f1, d * u.f2).getPoints(128)
  );

  // Actualizar la distancia de la ficha en los planetas creados por el usuario
  const datos = u.info.datos;
  if (datos["Distancia al Sol (unidades)"] !== undefined) {
    datos["Distancia al Sol (unidades)"] = d.toFixed(1);
    mostrarFicha(p);
  }
}

function mostrarFicha(obj) {
  const esSol = obj === star;
  const d = obj.userData.info;
  const filas = Object.entries(d.datos)
    .map(
      ([k, v]) =>
        `<div style="display:flex;gap:8px;padding:1px 0">` +
        `<span style="opacity:.65;min-width:125px">${k}</span><span>${v}</span></div>`
    )
    .join("");
  const btn =
    "background:#2a2a2a;color:#fff;border:1px solid #666;border-radius:4px;padding:4px 8px;cursor:pointer;margin-right:6px";
  ficha.innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">` +
    `<b style="font-size:17px">${obj.userData.nombre}</b>` +
    `<button id="f-cerrar" style="${btn};margin:0">✕</button></div>` +
    `<div style="margin-bottom:8px">${filas}</div>` +
    `<p style="margin:0 0 10px 0;font-style:italic">💡 ${d.curiosidad}</p>` +
    (esSol
      ? ""
      : `<button id="f-nave" style="${btn}">🚀 Ver con la nave</button>` +
        `<button id="f-borrar" style="${btn}">🗑 Borrar</button>`);
  ficha.style.display = "block";

  ficha.querySelector("#f-cerrar").onclick = deseleccionar;
  if (!esSol) {
    ficha.querySelector("#f-nave").onclick = () => {
      params.planeta = planets.indexOf(obj);
      params.vista = "Nave";
      refrescarGUI();
    };
    ficha.querySelector("#f-borrar").onclick = () => removePlanet(obj);
  }
}

//Interfaz
function initGUI() {
  gui = new GUI();
  gui.add(params, "vista", ["General", "Nave", "Nave libre"]).name("Vista");
  gui.add(params, "velocidad", 0, 5, 0.1).name("Velocidad");
  gui
    .add(params, "intensidadSol", 0, 6, 0.1)
    .name("Luz del Sol")
    .onChange((v) => (sunLight.intensity = v));
  gui
    .add(params, "orbitas")
    .name("Mostrar órbitas")
    .onChange((v) => planets.forEach((p) => (p.userData.orbit.visible = v)));
  gui.add(params, "etiquetas").name("Mostrar nombres");
  gui.add(params, "mover").name("Mover con flechas");

  const fNave = gui.addFolder("Nave");
  ctrlPlaneta = fNave
    .add(params, "planeta", 0, planets.length - 1, 1)
    .name("Planeta seguido");
  fNave.add(params, "distancia", 3, 40, 1).name("Distancia (radios)");
  fNave.add(params, "altura", 0, 1.5, 0.05).name("Altura");
  fNave.add(params, "mirar", ["Planeta", "Sol"]).name("Mirar a");
  fNave.add(flyControls, "movementSpeed", 1, 30, 1).name("Velocidad (libre)");
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

//Eventos
function onPointerUp(event) {
  if (!downPos) return;
  const movido = Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y);
  downPos = null;
  if (movido > 4) return;
  if (tControls.object && tControls.axis) return;

  const W = renderer.domElement.clientWidth;
  const H = renderer.domElement.clientHeight;
  const mouse = new THREE.Vector2(
    (event.clientX / W) * 2 - 1,
    -(event.clientY / H) * 2 + 1
  );
  const cam = camaraActiva();
  raycaster.setFromCamera(mouse, cam);

  const objetivos = [star, ...planets.map((p) => p.userData.body)];
  const golpe = raycaster.intersectObjects(objetivos, false);
  if (golpe.length > 0) {
    const o = golpe[0].object;
    seleccionar(o === star ? star : o.parent);
    return;
  }

  // Si hay un espacio vacío en la vista general se añade planeta
  if (params.vista !== "General") return;
  const hit = raycaster.intersectObject(plano);
  if (hit.length > 0 && planets.length < MAX_PLANETS) {
    const p = hit[0].point;
    const dist = Math.max(Math.hypot(p.x, p.y), SUN_RADIUS + 1.5);
    createPlanet(randomDef(dist, Math.atan2(p.y, p.x)));
  }
}

function onKeyDown(e) {
  if (e.key === "v" || e.key === "V") {
    const v = ["General", "Nave", "Nave libre"];
    params.vista = v[(v.indexOf(params.vista) + 1) % v.length];
    refrescarGUI();
  } else if (e.key === "n" || e.key === "N") {
    params.planeta = (params.planeta + 1) % planets.length;
    refrescarGUI();
  } else if (e.key === "Escape") {
    deseleccionar();
  }
}

//Render
function camaraActiva() {
  if (params.vista === "Nave") return camNave;
  if (params.vista === "Nave libre") return camLibre;
  return camera;
}

function actualizarNave() {
  const p = planets[Math.min(params.planeta, planets.length - 1)];
  const r = p.userData.radio;
  const d = r * params.distancia;

  // La nave se coloca entre el Sol y el planeta (ve la cara iluminada)
  const dir = new THREE.Vector3(p.position.x, p.position.y, 0).normalize();
  camNave.position.set(
    p.position.x - dir.x * d,
    p.position.y - dir.y * d,
    d * params.altura + r
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
  const cam = camaraActiva();
  drawView(cam, 0, 0, window.innerWidth, window.innerHeight);
  actualizarEtiquetas(cam);
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
    // Si se está arrastrando este planeta con las flechas, no se le impone la órbita
    if (!(arrastrando && tControls.object === p)) {
      p.position.set(Math.cos(a) * u.dist * u.f1, Math.sin(a) * u.dist * u.f2, 0);
    }

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

  camControls.enabled = params.vista === "General" && !arrastrando;
  camControls.update();
  actualizarGizmo();
  actualizarNave();

  // Cambio de vista: la nave libre arranca desde donde estaba la cámara anterior
  if (params.vista !== vistaPrev) {
    if (params.vista === "Nave libre" && !libreIniciada) {
      const origen = vistaPrev === "General" ? camera : camNave;
      camLibre.position.copy(origen.position);
      camLibre.quaternion.copy(origen.quaternion);
      libreIniciada = true;
    }
    vistaPrev = params.vista;
  }
  if (params.vista === "Nave libre") flyControls.update(Math.min(dt, 0.1));

  const p = planets[Math.min(params.planeta, planets.length - 1)];
const texto =
    `three.js - sistema planetario | Vista: ${params.vista}` +
    (params.vista === "Nave" ? ` (siguiendo a ${p.userData.nombre})` : "") +
    (params.vista === "Nave libre" ? " (pilotando)" : "") +
    `<br><span style="font-weight:normal">V: cambiar vista · N: siguiente planeta · ` +
    (params.vista === "Nave libre"
      ? `W/S/A/D: moverse · R/F: subir/bajar · Q/E: girar · arrastrar: mirar · `
      : "") +
    (params.vista === "General"
      ? `clic en un astro: ficha · arrastrar sus flechas: mover el planeta · clic en vacío: nuevo planeta · Esc: cerrar ficha`
      : `clic en un astro: ficha · Esc: cerrar ficha`) +
    `</span>`;
  if (texto !== ultimoInfo) {
    info.innerHTML = texto;
    ultimoInfo = texto;
  }

  renderViews();
}

init();
render();