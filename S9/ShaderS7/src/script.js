import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { FlyControls } from "three/examples/jsm/controls/FlyControls.js";
import GUI from "lil-gui";

const AUTOR = "Álvaro García Suárez · Informática Gráfica (S9 + S7 Shaders)";
const MAX_PLANETS = 12;
const ORBIT_K = 4; // velocidad orbital
const SUN_RADIUS = 1.5;

const DATOS_SOL = {
  datos: {
    Tipo: "Estrella enana amarilla",
    Diámetro: "1 392 700 km",
    "Temperatura superficial": "unos 5 500 °C",
    Edad: "unos 4 600 millones de años",
    "Shader S9": "Plasma (vértices + fragmentos) y corona Fresnel",
  },
  curiosidad:
    "Contiene el 99,86 % de toda la masa del sistema solar. En esta versión su superficie y corona se animan con shaders GLSL propios.",
};

const DATOS_PORTAL = {
  datos: {
    Tipo: "Agujero de gusano / Portal generativo",
    "Shader S9": "Mandala Caleidoscópico (< 512 bytes)",
    Técnicas: "fract (4 octavas), mat2, atan polar, paleta cosenoidal",
    Ubicación: "Espacio exterior (zona del sistema planetario)",
  },
  curiosidad:
    "Integra directamente el shader generativo dinámico desarrollado en S9 sobre una malla 3D con deformación ondulada y horizonte de sucesos.",
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
    nightTex: "earth_lights_2k.png",
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
        "Shader S9": "Doble textura Día/Noche + terminador + atmósfera",
      },
      curiosidad: "Es el único lugar conocido con vida. Su shader mezcla la cara diurna y las luces nocturnas en tiempo real según la dirección del Sol.",
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
let portalGroup, portalDisc;
let labelsDiv, ficha, autorDiv;
let planets = [];
let seleccionado = null;
let tControls; // TransformControls: flechas para mover el planeta seleccionado
let arrastrando = false;
let siguiendoPlaneta = null; // planeta al que acompaña la cámara general tras enfocarlo
const _prevTargetPos = new THREE.Vector3();
let tSim = 0; // tiempo de simulación orbital
let tReal = 0; // tiempo continuo para shaders
let tPrev = performance.now();
let downPos = null;
let ultimoInfo = "";
const loader = new THREE.TextureLoader();

// Uniforms compartidos para los 3 shaders integrados de S9
let sunUniforms = null;
let coronaUniforms = null;
let earthUniforms = null;
let portalUniforms = null;

const params = {
  vista: "General", // General | Nave | Nave libre
  velocidad: 1,
  planeta: 2, // Tierra por defecto
  distancia: 10,
  altura: 0.35,
  mirar: "Planeta", // Planeta | Sol
  orbitas: true,
  etiquetas: true,
  mover: true,
  intensidadSol: 2.5,
  // Parámetros específicos de los Shaders S9
  actividadSol: 0.08,
  lucesNocturnas: 1.5,
  mostrarPortal: true,
  velocidadPortal: 1.0,
  verSol: () => enfocarObjeto(star, 4.8),
  verTierra: () => enfocarTierraNoche(),
  verPortal: () => enfocarObjeto(portalGroup, 6.5),
  anadir: () => addRandomPlanet(),
  borrar: () => removeLastPlanet(),
};

// Textura 1x1 de respaldo mientras cargan las imágenes asíncronas
function crearTexturaFallback(r, g, b) {
  const data = new Uint8Array([r, g, b, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.needsUpdate = true;
  return tex;
}

function cargarTexturaShader(archivo, onLoad, repetir = false) {
  const url = new URL(`./textures/${archivo}`, import.meta.url).href;
  loader.load(
    url,
    (t) => {
      if (repetir) {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
      }
      onLoad(t);
    },
    undefined,
    () => console.warn("Error cargando textura shader: " + archivo)
  );
}

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

  // Contenedor de etiquetas
  labelsDiv = document.createElement("div");
  Object.assign(labelsDiv.style, {
    position: "fixed", left: "0", top: "0", width: "100%", height: "100%",
    zIndex: "1", pointerEvents: "none", overflow: "hidden",
  });
  document.body.appendChild(labelsDiv);

  // Ficha didáctica
  ficha = document.createElement("div");
  Object.assign(ficha.style, {
    position: "fixed", left: "16px", top: "80px", width: "300px", zIndex: "3",
    display: "none", color: "#fff", fontFamily: "Segoe UI, Arial, sans-serif",
    fontSize: "13px", lineHeight: "1.4", background: "rgba(0,0,0,0.78)",
    border: "1px solid rgba(255,255,255,0.25)", borderRadius: "8px", padding: "12px 14px",
  });
  document.body.appendChild(ficha);

  scene = new THREE.Scene();

  // Cámara general
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -34, 24);

  // Cámara subjetiva de la nave
  camNave = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 2000);
  camNave.up.set(0, 0, 1);

  // Cámara de la nave libre
  camLibre = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 2000);
  camLibre.up.set(0, 0, 1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setScissorTest(true);
  document.body.appendChild(renderer.domElement);

  camControls = new OrbitControls(camera, renderer.domElement);
  camControls.enableDamping = true;

  flyControls = new FlyControls(camLibre, renderer.domElement);
  flyControls.dragToLook = true;
  flyControls.movementSpeed = 6;
  flyControls.rollSpeed = 0.8;

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

  // Plano invisible para añadir planetas con clic
  plano = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  );
  plano.visible = false;
  scene.add(plano);
  raycaster = new THREE.Raycaster();

  createBackground();
  createStar(SUN_RADIUS); // Shader 1: Sol animado + corona

  // Iluminación
  scene.add(new THREE.AmbientLight(0xffffff, 0.15 * Math.PI));
  sunLight = new THREE.PointLight(0xffffff, params.intensidadSol * Math.PI, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 120;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  for (const def of SISTEMA) createPlanet(def); // Shader 2 integrado en la Tierra

  createPortal(); // Shader 3: Portal caleidoscópico S9

  initGUI();

  renderer.domElement.addEventListener("pointerdown", (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", () =>
    renderer.setSize(window.innerWidth, window.innerHeight)
  );
}

// Carga de texturas para materiales estándar
function cargarMapa(mat, prop, archivo, esColor = false, onLoad = null) {
  const url = new URL(`./textures/${archivo}`, import.meta.url).href;
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

// ============================================================================
// SHADER 1: SOL — Superficie de plasma (vértices + fragmentos) y corona Fresnel
// ============================================================================
function sunVertexShader() {
  return `
    uniform float u_time;
    uniform float u_pulse;
    varying vec2 vUv;
    varying vec3 vNormalView;
    varying vec3 vViewDir;
    varying float vNoise;

    // Ruido armónico 3D ligero para turbulencia solar
    float plasmaNoise(vec3 p) {
      return sin(p.x * 3.2 + u_time * 1.4) * cos(p.y * 3.1 - u_time * 1.1) * sin(p.z * 3.3 + u_time * 0.9) * 0.5
           + sin(p.x * 7.5 - u_time * 2.1 + p.y * 6.0) * cos(p.z * 7.0 + u_time * 1.7) * 0.25;
    }

    void main() {
      vUv = uv;
      float n = plasmaNoise(normalize(position) * 2.2);
      vNoise = n;

      // Desplazamiento dinámico de vértices a lo largo de la normal (protuberancias solares)
      vec3 displaced = position + normal * (n * u_pulse);
      vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);

      vNormalView = normalize(normalMatrix * normal);
      vViewDir = normalize(-mvPos.xyz);

      gl_Position = projectionMatrix * mvPos;
    }
  `;
}

function sunFragmentShader() {
  return `
    uniform sampler2D u_sunTex;
    uniform float u_time;
    varying vec2 vUv;
    varying vec3 vNormalView;
    varying vec3 vViewDir;
    varying float vNoise;

    void main() {
      // Distorsión fluida de coordenadas UV para simular plasma en movimiento
      vec2 flowA = vUv + vec2(u_time * 0.015, sin(vUv.x * 12.0 + u_time * 0.8) * 0.012);
      vec2 flowB = vUv * 1.15 - vec2(u_time * 0.02, cos(vUv.y * 10.0 - u_time * 0.9) * 0.014);

      vec3 texA = texture2D(u_sunTex, flowA).rgb;
      vec3 texB = texture2D(u_sunTex, flowB).rgb;
      vec3 base = mix(texA, texB, 0.45);

      // Realce incandescente en crestas de plasma elevadas por el vertex shader
      vec3 hotColor = vec3(1.0, 0.88, 0.42);
      vec3 col = base * (1.05 + vNoise * 0.45) + max(vNoise, 0.0) * hotColor * 0.45;

      // Brillo de borde Fresnel (atmósfera solar incandescente)
      float fresnel = pow(1.0 - max(dot(normalize(vNormalView), normalize(vViewDir)), 0.0), 2.2);
      col += vec3(1.0, 0.52, 0.12) * fresnel * 0.95;

      gl_FragColor = vec4(col, 1.0);
    }
  `;
}

function coronaVertexShader() {
  return `
    varying vec3 vNormalView;
    varying vec3 vViewDir;
    varying vec3 vLocalPos;

    void main() {
      vLocalPos = normalize(position);
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vNormalView = normalize(normalMatrix * normal);
      vViewDir = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `;
}

function coronaFragmentShader() {
  return `
    uniform float u_time;
    varying vec3 vNormalView;
    varying vec3 vViewDir;
    varying vec3 vLocalPos;

    void main() {
      // Halo aditivo suave en la cara trasera de la esfera exterior
      float ndotv = max(0.0, dot(-normalize(vNormalView), normalize(vViewDir)));
      float glow = pow(ndotv, 3.2);

      // Rayos coronales sutiles animados con el tiempo
      float rays = 0.85 + 0.15 * sin(atan(vLocalPos.y, vLocalPos.x) * 10.0 + u_time * 1.6)
                         * cos(vLocalPos.z * 8.0 - u_time * 1.2);

      vec3 color = mix(vec3(1.0, 0.35, 0.04), vec3(1.0, 0.82, 0.32), glow);
      gl_FragColor = vec4(color * glow * rays * 1.15, glow * 0.9);
    }
  `;
}

// ============================================================================
// SHADER 2: TIERRA — Doble textura Día/Noche + terminador + halo atmosférico
// ============================================================================
function earthVertexShader() {
  return `
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;

    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;
}

function earthFragmentShader() {
  return `
    uniform sampler2D u_dayTex;
    uniform sampler2D u_nightTex;
    uniform sampler2D u_specTex;
    uniform vec3 u_sunPos;
    uniform float u_nightIntensity;
    uniform float u_lightIntensity;

    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;

    void main() {
      vec3 N = normalize(vWorldNormal);
      vec3 L = normalize(u_sunPos - vWorldPos);
      vec3 V = normalize(cameraPosition - vWorldPos);

      float LdotN = dot(N, L);
      float dayFactor = smoothstep(-0.18, 0.22, LdotN);

      vec3 dayTex = texture2D(u_dayTex, vUv).rgb;
      vec3 nightTex = texture2D(u_nightTex, vUv).rgb;
      float oceanMask = texture2D(u_specTex, vUv).r;

      // Cara diurna: difusión Lambert + reflejo especular oceánico
      float diff = max(LdotN, 0.0);
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 36.0) * oceanMask * diff * 0.55;
      float sunGain = clamp(u_lightIntensity * 0.45, 0.2, 1.6);
      vec3 dayCol = dayTex * (0.08 + diff * sunGain) + vec3(0.85, 0.92, 1.0) * spec;

      // Cara nocturna: base muy tenue + luces de ciudades doradas
      vec3 nightCol = dayTex * 0.045 + nightTex * vec3(1.15, 0.88, 0.52) * u_nightIntensity;

      // Mezcla suave día/noche
      vec3 col = mix(nightCol, dayCol, dayFactor);

      // Banda anaranjada de atardecer en el terminador (LdotN ≈ 0)
      float twilight = exp(-pow(LdotN * 6.5, 2.0));
      col += vec3(0.95, 0.38, 0.12) * twilight * 0.24;

      // Dispersión atmosférica azulada en el borde (Fresnel)
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      col += vec3(0.28, 0.62, 1.0) * rim * (0.12 + dayFactor * 0.55);

      gl_FragColor = vec4(col, 1.0);
    }
  `;
}

function earthHaloVertexShader() {
  return `
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;
}

function earthHaloFragmentShader() {
  return `
    uniform vec3 u_sunPos;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;

    void main() {
      vec3 N = normalize(vWorldNormal);
      vec3 V = normalize(cameraPosition - vWorldPos);
      vec3 L = normalize(u_sunPos - vWorldPos);

      float viewRim = pow(max(0.0, dot(-N, V)), 3.0);
      float sunSide = smoothstep(-0.35, 0.55, dot(N, L));
      vec3 col = vec3(0.28, 0.65, 1.0) * viewRim * (0.2 + 0.8 * sunSide);

      gl_FragColor = vec4(col, viewRim * 0.85);
    }
  `;
}

// ============================================================================
// SHADER 3: PORTAL CALEIDOSCÓPICO S9 — Reutiliza el patrón de S9/shader.frag
// ============================================================================
function portalVertexShader() {
  return `
    uniform float u_time;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vec2 p = uv * 2.0 - 1.0;
      float r = length(p);

      // Ondulación suave en profundidad sobre el disco del portal
      vec3 pos = position;
      pos.z += sin(r * 10.0 - u_time * 3.0) * 0.14 * (1.0 - smoothstep(0.65, 1.0, r));

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;
}

function portalFragmentShader() {
  return `
    uniform float u_time;
    varying vec2 vUv;

    void main() {
      // Mapeo de UV [0,1] a coordenadas centradas [-1,1]
      vec2 u = vUv * 2.0 - 1.0;
      float d0 = length(u);
      if (d0 > 1.0) discard;

      // Patrón generativo exacto de S9/shader.frag (caleidoscopio fractal de 4 octavas)
      float t = u_time, a, c, s, d;
      vec3 o = vec3(0.0);
      vec2 q = u * 1.15;
      for (float i = 0.0; i < 4.0; i++) {
        a = t * 0.15 + i * 0.5;
        c = cos(a);
        s = sin(a);
        q = fract(mat2(c, -s, s, c) * q * 1.5) - 0.5;
        d = (length(q) + 0.07 * cos(6.0 * atan(q.y, q.x + 1e-5) + t * 2.0 - i)) * exp(-d0);
        d = pow(0.096 / (abs(sin(d * 8.0 - t * 1.6 + i)) + 0.016), 1.15);
        o += (0.5 + 0.5 * cos(6.283 * (d0 + i * 0.35 - t * 0.25 + vec3(0.0, 0.2, 0.4)))) * d;
      }

      vec3 col = o / (1.0 + o);

      // Aro brillante en el horizonte de sucesos del portal
      float rim = exp(-pow((d0 - 0.9) * 14.0, 2.0));
      col += vec3(0.45, 0.85, 1.0) * rim * 1.3;

      // Máscara circular suave hacia el borde exterior
      float alpha = 1.0 - smoothstep(0.92, 1.0, d0);
      gl_FragColor = vec4(col, alpha);
    }
  `;
}

// Etiquetado de objetos
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
  if (portalGroup) {
    ponerEtiqueta(portalGroup, portalGroup.userData.label, cam, params.mostrarPortal);
  }
  for (const p of planets) {
    ponerEtiqueta(p, p.userData.label, cam);
    const cerca = cam.position.distanceTo(p.position) < 14;
    for (const m of p.userData.moons) ponerEtiqueta(m, m.userData.label, cam, cerca);
  }
}

// Creación de objetos
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
  const geometry = new THREE.SphereGeometry(radius, 64, 64);
  geometry.rotateX(Math.PI / 2);

  sunUniforms = {
    u_time: { value: 0.0 },
    u_pulse: { value: params.actividadSol },
    u_sunTex: { value: crearTexturaFallback(255, 190, 60) },
  };
  cargarTexturaShader("sun.jpg", (t) => {
    sunUniforms.u_sunTex.value = t;
  }, true);

  const material = new THREE.ShaderMaterial({
    uniforms: sunUniforms,
    vertexShader: sunVertexShader(),
    fragmentShader: sunFragmentShader(),
  });

  star = new THREE.Mesh(geometry, material);
  star.userData = { nombre: "Sol", info: DATOS_SOL, label: crearEtiqueta("Sol") };

  // Corona solar aditiva con shader Fresnel
  coronaUniforms = {
    u_time: { value: 0.0 },
  };
  const coronaGeo = new THREE.SphereGeometry(radius * 1.48, 48, 48);
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: coronaUniforms,
    vertexShader: coronaVertexShader(),
    fragmentShader: coronaFragmentShader(),
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const corona = new THREE.Mesh(coronaGeo, coronaMat);
  star.add(corona);

  scene.add(star);
}

function createPortal() {
  portalGroup = new THREE.Group();
  portalGroup.position.set(-14, -9, 3.2);
  // Orientado suavemente hacia la cámara general para lucir desde el inicio
  portalGroup.rotation.set(Math.PI * 0.35, 0.35, -0.25);

  portalUniforms = {
    u_time: { value: 0.0 },
  };

  const discGeo = new THREE.CircleGeometry(2.3, 64);
  const discMat = new THREE.ShaderMaterial({
    uniforms: portalUniforms,
    vertexShader: portalVertexShader(),
    fragmentShader: portalFragmentShader(),
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });

  portalDisc = new THREE.Mesh(discGeo, discMat);
  portalGroup.add(portalDisc);

  // Anillo exterior energético 3D
  const ringGeo = new THREE.TorusGeometry(2.32, 0.055, 16, 96);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x6ce5ff,
    transparent: true,
    opacity: 0.85,
  });
  portalGroup.add(new THREE.Mesh(ringGeo, ringMat));

  portalGroup.visible = params.mostrarPortal;
  portalGroup.userData = {
    nombre: "Portal S9",
    info: DATOS_PORTAL,
    label: crearEtiqueta("Portal S9"),
  };

  scene.add(portalGroup);
}

function createPlanet(def) {
  const group = new THREE.Group();

  // Cuerpo del planeta
  const geo = new THREE.SphereGeometry(def.radio, 64, 64);
  geo.rotateX(Math.PI / 2);

  let mat;
  if (def.nightTex) {
    // Shader 2: Tierra con doble textura Día/Noche + especular + terminador
    earthUniforms = {
      u_dayTex: { value: crearTexturaFallback(45, 95, 190) },
      u_nightTex: { value: crearTexturaFallback(0, 0, 0) },
      u_specTex: { value: crearTexturaFallback(0, 0, 0) },
      u_sunPos: { value: new THREE.Vector3(0, 0, 0) },
      u_nightIntensity: { value: params.lucesNocturnas },
      u_lightIntensity: { value: params.intensidadSol },
    };
    cargarTexturaShader(def.tex, (t) => (earthUniforms.u_dayTex.value = t));
    cargarTexturaShader(def.nightTex, (t) => (earthUniforms.u_nightTex.value = t));
    if (def.spec) {
      cargarTexturaShader(def.spec, (t) => (earthUniforms.u_specTex.value = t));
    }

    mat = new THREE.ShaderMaterial({
      uniforms: earthUniforms,
      vertexShader: earthVertexShader(),
      fragmentShader: earthFragmentShader(),
    });
  } else {
    mat = new THREE.MeshPhongMaterial({ color: def.color });
    if (def.tex) cargarMapa(mat, "map", def.tex, true);
    if (def.bump) {
      cargarMapa(mat, "bumpMap", def.bump);
      mat.bumpScale = 0.5;
    }
    if (def.spec) {
      cargarMapa(mat, "specularMap", def.spec);
      mat.specular = new THREE.Color("grey");
    }
  }

  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Halo atmosférico Fresnel para la Tierra
  if (def.nightTex) {
    const haloGeo = new THREE.SphereGeometry(def.radio * 1.14, 48, 48);
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { u_sunPos: earthUniforms.u_sunPos },
      vertexShader: earthHaloVertexShader(),
      fragmentShader: earthHaloFragmentShader(),
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(haloGeo, haloMat));
  }

  // Capa de nubes (Tierra)
  let nubes = null;
  if (def.nubes) {
    const cg = new THREE.SphereGeometry(def.radio * 1.03, 48, 48);
    cg.rotateX(Math.PI / 2);
    const cm = new THREE.MeshPhongMaterial({
      color: 0xffffff, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false,
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

  // Lunas
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

// Helpers para enfocar rápidamente cada uno de los 3 shaders
function enfocarObjeto(obj, dist) {
  if (!obj) return;
  siguiendoPlaneta = null;
  params.vista = "General";
  const pos = new THREE.Vector3();
  obj.getWorldPosition(pos);
  camControls.target.copy(pos);
  camera.position.set(pos.x, pos.y - dist, pos.z + dist * 0.45);
  camControls.update();
  refrescarGUI();
}

function enfocarTierraNoche() {
  const tierra = planets.find((p) => p.userData.nombre === "Tierra");
  if (!tierra) return;
  params.vista = "General";
  const p = tierra.position.clone();
  // Coloca la cámara en un ángulo lateral/nocturno respecto al Sol para apreciar el terminador y las luces
  const outDir = p.clone().normalize();
  const sideDir = new THREE.Vector3(-outDir.y, outDir.x, 0);
  const offset = outDir.multiplyScalar(1.05).add(sideDir.multiplyScalar(1.35));
  offset.z = 0.42;
  camControls.target.copy(p);
  camera.position.copy(p).add(offset);
  camControls.update();
  siguiendoPlaneta = tierra;
  _prevTargetPos.copy(p);
  refrescarGUI();
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
  if (siguiendoPlaneta === p) siguiendoPlaneta = null;

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

function actualizarGizmo() {
  const esPlaneta = seleccionado && seleccionado !== star && seleccionado !== portalGroup;
  const quiere = params.mover && params.vista === "General" && esPlaneta;
  if (quiere && tControls.object !== seleccionado) tControls.attach(seleccionado);
  else if (!quiere && tControls.object) tControls.detach();
}

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

function finalizarArrastre() {
  const p = tControls.object;
  if (!p) return;
  const u = p.userData;

  const x = p.position.x / u.f1;
  const y = p.position.y / u.f2;
  const d = Math.hypot(x, y);
  const a = Math.atan2(y, x);

  u.dist = d;
  u.speed = ORBIT_K / Math.pow(d, 1.5);
  u.initialAngle = a - tSim * u.speed;

  u.orbit.geometry.dispose();
  u.orbit.geometry = new THREE.BufferGeometry().setFromPoints(
    new THREE.EllipseCurve(0, 0, d * u.f1, d * u.f2).getPoints(128)
  );

  const datos = u.info.datos;
  if (datos["Distancia al Sol (unidades)"] !== undefined) {
    datos["Distancia al Sol (unidades)"] = d.toFixed(1);
    mostrarFicha(p);
  }
}

function mostrarFicha(obj) {
  const esPlaneta = obj !== star && obj !== portalGroup;
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
    (!esPlaneta
      ? ""
      : `<button id="f-nave" style="${btn}">🚀 Ver con la nave</button>` +
        `<button id="f-borrar" style="${btn}">🗑 Borrar</button>`);
  ficha.style.display = "block";

  ficha.querySelector("#f-cerrar").onclick = deseleccionar;
  if (esPlaneta) {
    ficha.querySelector("#f-nave").onclick = () => {
      params.planeta = planets.indexOf(obj);
      params.vista = "Nave";
      refrescarGUI();
    };
    ficha.querySelector("#f-borrar").onclick = () => removePlanet(obj);
  }
}

// Interfaz
function initGUI() {
  gui = new GUI();
  gui.add(params, "vista", ["General", "Nave", "Nave libre"]).name("Vista");
  gui.add(params, "velocidad", 0, 5, 0.1).name("Velocidad");
  gui
    .add(params, "intensidadSol", 0, 6, 0.1)
    .name("Luz del Sol")
    .onChange((v) => {
      sunLight.intensity = v * Math.PI;
      if (earthUniforms) earthUniforms.u_lightIntensity.value = v;
    });
  gui
    .add(params, "orbitas")
    .name("Mostrar órbitas")
    .onChange((v) => planets.forEach((p) => (p.userData.orbit.visible = v)));
  gui.add(params, "etiquetas").name("Mostrar nombres");
  gui.add(params, "mover").name("Mover con flechas");

  const fShaders = gui.addFolder("Shaders S9");
  fShaders
    .add(params, "actividadSol", 0, 0.22, 0.01)
    .name("Plasma solar")
    .onChange((v) => {
      if (sunUniforms) sunUniforms.u_pulse.value = v;
    });
  fShaders
    .add(params, "lucesNocturnas", 0, 3.0, 0.1)
    .name("Luces Tierra")
    .onChange((v) => {
      if (earthUniforms) earthUniforms.u_nightIntensity.value = v;
    });
  fShaders
    .add(params, "mostrarPortal")
    .name("Portal S9")
    .onChange((v) => {
      if (portalGroup) portalGroup.visible = v;
    });
  fShaders.add(params, "velocidadPortal", 0, 3, 0.1).name("Vel. portal");
  fShaders.add(params, "verSol").name("Enfocar Sol");
  fShaders.add(params, "verTierra").name("Enfocar Tierra (Día/Noche)");
  fShaders.add(params, "verPortal").name("Enfocar Portal S9");
  fShaders.open();

  const fNave = gui.addFolder("Nave");
  ctrlPlaneta = fNave
    .add(params, "planeta", 0, planets.length - 1, 1)
    .name("Planeta seguido");
  fNave.add(params, "distancia", 3, 40, 1).name("Distancia (radios)");
  fNave.add(params, "altura", 0, 1.5, 0.05).name("Altura");
  fNave.add(params, "mirar", ["Planeta", "Sol"]).name("Mirar a");
  fNave.add(flyControls, "movementSpeed", 1, 30, 1).name("Velocidad (libre)");

  const fPl = gui.addFolder("Planetas");
  fPl.add(params, "anadir").name("Añadir planeta");
  fPl.add(params, "borrar").name("Borrar último");
}

function actualizarGUIPlanetas() {
  if (!ctrlPlaneta) return;
  ctrlPlaneta.max(Math.max(planets.length - 1, 0));
  if (params.planeta > planets.length - 1) params.planeta = planets.length - 1;
  ctrlPlaneta.updateDisplay();
}

function refrescarGUI() {
  if (!gui) return;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

// Eventos
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
  if (portalDisc && params.mostrarPortal) objetivos.push(portalDisc);

  const golpe = raycaster.intersectObjects(objetivos, false);
  if (golpe.length > 0) {
    const o = golpe[0].object;
    if (o === star) seleccionar(star);
    else if (o === portalDisc) seleccionar(portalGroup);
    else seleccionar(o.parent);
    return;
  }

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

// Render
function camaraActiva() {
  if (params.vista === "Nave") return camNave;
  if (params.vista === "Nave libre") return camLibre;
  return camera;
}

function actualizarNave() {
  const p = planets[Math.min(params.planeta, planets.length - 1)];
  const r = p.userData.radio;
  const d = r * params.distancia;

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
  const dt = Math.min((now - tPrev) / 1000, 0.1);
  tPrev = now;
  const dts = dt * params.velocidad;
  tSim += dts;
  tReal += dt;

  // Actualizar tiempo de los shaders de S9
  if (sunUniforms) sunUniforms.u_time.value = tReal;
  if (coronaUniforms) coronaUniforms.u_time.value = tReal;
  if (portalUniforms) portalUniforms.u_time.value += dt * params.velocidadPortal;

  star.rotation.z += 0.05 * dts;
  if (portalGroup) portalGroup.position.z = 3.2 + Math.sin(tReal * 0.9) * 0.25;

  for (const p of planets) {
    const u = p.userData;
    const a = u.initialAngle + tSim * u.speed;
    if (!(arrastrando && tControls.object === p)) {
      p.position.set(Math.cos(a) * u.dist * u.f1, Math.sin(a) * u.dist * u.f2, 0);
    }

    u.body.rotation.z += u.spin * dts;
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

  // Si estamos enfocando la Tierra, desplazamos cámara y objetivo junto a su órbita
  if (siguiendoPlaneta && params.vista === "General") {
    const dx = siguiendoPlaneta.position.x - _prevTargetPos.x;
    const dy = siguiendoPlaneta.position.y - _prevTargetPos.y;
    const dz = siguiendoPlaneta.position.z - _prevTargetPos.z;
    camera.position.x += dx;
    camera.position.y += dy;
    camera.position.z += dz;
    camControls.target.x += dx;
    camControls.target.y += dy;
    camControls.target.z += dz;
    _prevTargetPos.copy(siguiendoPlaneta.position);
  }

  camControls.enabled = params.vista === "General" && !arrastrando;
  camControls.update();
  actualizarGizmo();
  actualizarNave();

  if (params.vista !== vistaPrev) {
    if (params.vista === "Nave libre" && !libreIniciada) {
      const origen = vistaPrev === "General" ? camera : camNave;
      camLibre.position.copy(origen.position);
      camLibre.quaternion.copy(origen.quaternion);
      libreIniciada = true;
    }
    vistaPrev = params.vista;
  }
  if (params.vista === "Nave libre") flyControls.update(dt);

  const p = planets[Math.min(params.planeta, planets.length - 1)];
  const texto =
    `three.js - sistema planetario + shaders S9 | Vista: ${params.vista}` +
    (params.vista === "Nave" ? ` (siguiendo a ${p.userData.nombre})` : "") +
    (params.vista === "Nave libre" ? " (pilotando)" : "") +
    `<br><span style="font-weight:normal">V: cambiar vista · N: siguiente planeta · ` +
    (params.vista === "Nave libre"
      ? `W/S/A/D: moverse · R/F: subir/bajar · Q/E: girar · arrastrar: mirar · `
      : "") +
    (params.vista === "General"
      ? `clic en un astro o portal: ficha · arrastrar flechas: mover planeta · clic en vacío: nuevo planeta · Esc: cerrar ficha`
      : `clic en un astro o portal: ficha · Esc: cerrar ficha`) +
    `</span>`;
  if (texto !== ultimoInfo) {
    info.innerHTML = texto;
    ultimoInfo = texto;
  }

  renderViews();
}

init();
render();
