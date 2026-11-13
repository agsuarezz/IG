import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ============================================================================
// Configuración global y constantes geográficas
// ============================================================================
const MIN_LON = -180;
const MAX_LON = 180;
const MIN_LAT = -90;
const MAX_LAT = 90;

const RADIO_TIERRA = 2.4;
const RADIO_OLAS = RADIO_TIERRA - 0.009; // Superficie oceánica por encima de fosas y bajo continentes
const RADIO_LINEAS = RADIO_TIERRA + 0.007;
const RADIO_BARCOS = RADIO_TIERRA + 0.012;

const DENSIDAD_FLOTA = {
  major: 22.0, // Buques por unidad de arco en rutas principales
  middle: 12.0, // En rutas medias
  minor: 6.0, // En rutas secundarias
};

let scene, renderer, camera, camcontrols;
let tierraMesh, olasMesh, atmosferaMesh;

// Reloj y tiempo simulado
const clock = new THREE.Clock();
const fechaInicio = new Date(2026, 10, 13, 8, 0, 0);
let minutosSimulados = 0;
let velocidadSim = 1.0;

// Capa 1: Corrientes oceánicas como Olas 3D (ShaderMaterial + DataTexture)
const GRID_W = 144; // 2.5° de resolución longitudinal suave
const GRID_H = 72; // 2.5° de resolución latitudinal suave
let texturaCorrientes = null;
let celdasCorrientes = []; // { lat, lon, u, v }
let rejillaCorrientes = new Map();
const PASO_REJILLA = 10;

// Máscara oceánica (360x180) extraída del mapa de batimetría GEBCO
let mascaraOceano = null;

// Capa 2: Tráfico marítimo (red global + barcos AIS reales con textura)
let lineasRutas = null;
let mallaBarcos = null;
let mallaAIS = null;
let geoBarcoCompartida = null;
let matBarcoCompartido = null;
let rutasProcesadas = []; // { id, tipo, puntosEsfera: Vector3[], longitud }
let flotaBarcos = [];
let barcosAIS = [];

const dummyObj = new THREE.Object3D();
const tmpUp = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpBasis = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpNext = new THREE.Vector3();

// Referencias al HUD
const ui = {
  simDatetime: document.getElementById("sim-datetime"),
  activeShips: document.getElementById("active-ships"),
  currentCells: document.getElementById("current-cells"),
  dataBadge: document.getElementById("data-badge"),
  statusMsg: document.getElementById("status-msg"),
  toggleCurrents: document.getElementById("toggle-currents"),
  toggleTraffic: document.getElementById("toggle-traffic"),
  toggleWireframe: document.getElementById("toggle-wireframe"),
  toggleAutorotate: document.getElementById("toggle-autorotate"),
  simSpeed: document.getElementById("sim-speed"),
  speedLabel: document.getElementById("speed-label"),
  btnRefreshApi: document.getElementById("btn-refresh-api"),
  btnReloadCsv: document.getElementById("btn-reload-csv"),
  btnDownloadCsv: document.getElementById("btn-download-csv"),
};

init();
animate();

// ============================================================================
// Inicialización de escena, cámara, luces y globo terráqueo
// ============================================================================
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02050d);

  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  // Posición inicial enfocando Atlántico, Europa, África y América
  camera.position.set(3.4, 2.1, 4.4);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  camcontrols = new OrbitControls(camera, renderer.domElement);
  camcontrols.enableDamping = true;
  camcontrols.dampingFactor = 0.06;
  camcontrols.minDistance = RADIO_TIERRA + 0.35;
  camcontrols.maxDistance = 12.0;
  camcontrols.enablePan = false;
  camcontrols.autoRotate = ui.toggleAutorotate.checked;
  camcontrols.autoRotateSpeed = 0.45;

  // Iluminación espacial nocturna
  const ambientLight = new THREE.AmbientLight(0x4a6b94, 0.95);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xaad4ff, 1.55);
  dirLight.position.set(6, 4, 7);
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.45);
  rimLight.position.set(-6, -3, -4);
  scene.add(rimLight);

  crearCampoEstrellas();
  crearAtmosfera();
  prepararModeloBarcoTexturizado();

  // Carga de texturas de alta resolución (4K / 2K) y normales de olas
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const bathyTexture = loader.load(
    "src/gebco_bathy.5400x2700_8bit.jpg",
    undefined,
    undefined,
    () => {
      console.warn("No se pudo cargar src/gebco_bathy.5400x2700_8bit.jpg");
    }
  );

  const waterMaskTexture = loader.load(
    "src/water_mask_4k.png",
    (tex) => {
      tex.anisotropy = maxAniso;
      construirMascaraOceano(tex.image, true);
      if (olasMesh) {
        olasMesh.material.uniforms.uWaterMask.value = tex;
        olasMesh.material.uniforms.uHasMask.value = 1.0;
      }
      if (tierraMesh) {
        tierraMesh.material.specularMap = tex;
        tierraMesh.material.needsUpdate = true;
      }
    },
    undefined,
    () => {
      console.warn("No se pudo cargar src/water_mask_4k.png");
    }
  );

  const waterNormalsTexture = loader.load("src/waternormals.jpg", (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAniso;
  });

  const earthNormalTexture = loader.load("src/earth_normal_2k.jpg", (tex) => {
    tex.anisotropy = maxAniso;
  });

  const earthLightsTexture = loader.load("src/earth_lights_2k.png", (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
  });

  loader.load(
    "src/earth_4k.jpg",
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAniso;

      crearGloboTierra(
        texture,
        bathyTexture,
        earthNormalTexture,
        earthLightsTexture,
        waterMaskTexture
      );
      crearCapaOlas(waterNormalsTexture, waterMaskTexture);
      cargarDatosCorrientes();
      cargarDatosRutas();
      cargarDatosAIS();
    },
    undefined,
    (err) => {
      console.error("Error cargando textura 4K; usando respaldo 1K:", err);
      const fallbackTex = loader.load("src/earthmap1k.jpg", (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        crearGloboTierra(
          tex,
          bathyTexture,
          earthNormalTexture,
          earthLightsTexture,
          waterMaskTexture
        );
        crearCapaOlas(waterNormalsTexture, waterMaskTexture);
        cargarDatosCorrientes();
        cargarDatosRutas();
        cargarDatosAIS();
      });
      if (!fallbackTex) {
        crearGloboTierra(null, bathyTexture, null, null, waterMaskTexture);
        crearCapaOlas(waterNormalsTexture, waterMaskTexture);
        cargarDatosCorrientes();
        cargarDatosRutas();
        cargarDatosAIS();
      }
    }
  );

  configurarEventosUI();
  window.addEventListener("resize", onWindowResize);
}

// ============================================================================
// Mapeo geográfico esférico (estilo asignatura con Map2Range)
// ============================================================================
function Map2Range(val, vmin, vmax, dmin, dmax) {
  const t = 1 - (vmax - val) / (vmax - vmin);
  return dmin + t * (dmax - dmin);
}

// Convierte (lat, lon) a coordenadas 3D exactamente alineadas con UV de SphereGeometry
function latLonToVector3(lat, lon, radio = RADIO_TIERRA, target = null) {
  const phi = Map2Range(lon, MIN_LON, MAX_LON, 0, Math.PI * 2);
  const theta = Map2Range(lat, MIN_LAT, MAX_LAT, Math.PI, 0);

  const x = -radio * Math.cos(phi) * Math.sin(theta);
  const y = radio * Math.cos(theta);
  const z = radio * Math.sin(phi) * Math.sin(theta);

  if (target) return target.set(x, y, z);
  return new THREE.Vector3(x, y, z);
}

// ============================================================================
// Globo terráqueo esférico 4K + batimetría + luces nocturnas + atmósfera
// ============================================================================
function crearGloboTierra(txt, dismap, normalMap, lightsMap, waterMask) {
  const geometry = new THREE.SphereGeometry(RADIO_TIERRA, 240, 120);
  const material = new THREE.MeshPhongMaterial({
    color: 0x8eaac7, // Tinte nocturno azulado que conserva nitidez 4K en continentes
    emissive: 0xffc66d, // Luces urbanas nocturnas doradas
    emissiveIntensity: lightsMap ? 0.38 : 0.0,
    specular: 0x1d3b5c,
    shininess: 22,
    wireframe: false,
  });

  if (txt) material.map = txt;
  if (normalMap) {
    material.normalMap = normalMap;
    material.normalScale = new THREE.Vector2(1.5, 1.5);
  }
  if (lightsMap) {
    material.emissiveMap = lightsMap;
  }
  if (waterMask) {
    material.specularMap = waterMask;
  }

  if (dismap) {
    material.displacementMap = dismap;
    material.displacementScale = 0.085;
    material.displacementBias = -0.055;
  }

  tierraMesh = new THREE.Mesh(geometry, material);
  scene.add(tierraMesh);
}

function crearAtmosfera() {
  const geo = new THREE.SphereGeometry(RADIO_TIERRA * 1.045, 64, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexShader: `
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;
      void main() {
        float rim = pow(clamp(0.65 - dot(vNormalWorld, vViewDir), 0.0, 1.0), 3.0);
        gl_FragColor = vec4(0.0, 0.72, 1.0, rim * 0.42);
      }
    `,
  });
  atmosferaMesh = new THREE.Mesh(geo, mat);
  scene.add(atmosferaMesh);
}

function crearCampoEstrellas() {
  const numEstrellas = 1800;
  const pos = new Float32Array(numEstrellas * 3);
  for (let i = 0; i < numEstrellas; i++) {
    const r = 24 + Math.random() * 25;
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const sinTheta = Math.sqrt(1 - u * u);
    pos[i * 3] = r * sinTheta * Math.cos(phi);
    pos[i * 3 + 1] = r * u;
    pos[i * 3 + 2] = r * sinTheta * Math.sin(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xcbd5e1,
    size: 0.08,
    transparent: true,
    opacity: 0.65,
  });
  scene.add(new THREE.Points(geo, mat));
}

// Máscara oceánica 720x360 desde water_mask_4k.png (o GEBCO como respaldo)
function construirMascaraOceano(img, esWaterMask = false) {
  const w = 720;
  const h = 360;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;

  mascaraOceano = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const val = pixels[i * 4];
    mascaraOceano[i] = esWaterMask ? (val >= 128 ? 1 : 0) : val < 128 ? 1 : 0;
  }
}

function esOceano(lat, lon) {
  if (!mascaraOceano) return true;
  const w = 720;
  const h = 360;
  const col = Math.min(w - 1, Math.max(0, Math.floor((lon + 180) * 2)));
  const row = Math.min(h - 1, Math.max(0, Math.floor((90 - lat) * 2)));
  return mascaraOceano[row * w + col] === 1;
}

// ============================================================================
// CAPA 1: Corrientes Oceánicas como Olas 3D con textura real (waternormals)
// ============================================================================
function crearCapaOlas(waterNormalsTex, waterMaskTex) {
  const datosIniciales = new Uint8Array(GRID_W * GRID_H * 4);
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    datosIniciales[i * 4] = 128;
    datosIniciales[i * 4 + 1] = 128;
    datosIniciales[i * 4 + 2] = 0;
    datosIniciales[i * 4 + 3] = 255;
  }

  texturaCorrientes = new THREE.DataTexture(
    datosIniciales,
    GRID_W,
    GRID_H,
    THREE.RGBAFormat
  );
  texturaCorrientes.wrapS = THREE.RepeatWrapping;
  texturaCorrientes.wrapT = THREE.ClampToEdgeWrapping;
  texturaCorrientes.minFilter = THREE.LinearFilter;
  texturaCorrientes.magFilter = THREE.LinearFilter;
  texturaCorrientes.needsUpdate = true;

  const geoOlas = new THREE.SphereGeometry(RADIO_OLAS, 240, 120);
  const matOlas = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uCurrentTex: { value: texturaCorrientes },
      uWaterNormals: { value: waterNormalsTex || null },
      uHasNormals: { value: waterNormalsTex ? 1.0 : 0.0 },
      uWaterMask: { value: waterMaskTex || null },
      uHasMask: { value: waterMaskTex && waterMaskTex.image ? 1.0 : 0.0 },
      uLightDir: { value: new THREE.Vector3(6, 4, 7).normalize() },
    },
    vertexShader: `
      uniform float uTime;
      uniform sampler2D uCurrentTex;
      uniform sampler2D uWaterMask;
      uniform float uHasMask;

      varying vec2 vUv;
      varying vec3 vSphereDir;
      varying vec3 vNormalWorld;
      varying vec3 vEastWorld;
      varying vec3 vNorthWorld;
      varying vec3 vViewDir;
      varying float vWaveHeight;

      vec3 getEast(vec3 n) {
        return length(vec2(n.z, n.x)) > 0.001
          ? normalize(vec3(n.z, 0.0, -n.x))
          : vec3(1.0, 0.0, 0.0);
      }

      void main() {
        vUv = uv;
        vec3 n = normalize(position);
        vSphereDir = n;

        vec4 cur = texture2D(uCurrentTex, uv);
        vec2 flow = (cur.rg - 0.5) * 2.0;
        float speed = cur.b;

        float oceanMask = uHasMask > 0.5
          ? smoothstep(0.25, 0.75, texture2D(uWaterMask, uv).r)
          : 1.0;

        vec3 east = getEast(n);
        vec3 north = normalize(cross(n, east));
        vec3 flow3D = east * flow.x + north * flow.y;
        vec3 flowDir3D = length(flow3D) > 0.01 ? normalize(flow3D) : east;
        vec3 perpDir3D = normalize(cross(n, flowDir3D));

        float warp = sin(n.x * 18.0 + n.y * 14.0 + uTime * 0.4) * 1.2
                   + cos(n.z * 21.0 - n.x * 12.0 - uTime * 0.3) * 0.9;

        float vel = 1.2 + speed * 2.5;
        float phase1 = dot(n, flowDir3D) * 30.0 + warp - uTime * vel;
        float phase2 = dot(n, flowDir3D * 0.8 + perpDir3D * 0.6) * 44.0 - warp * 0.6 - uTime * vel * 1.2;

        float wave = sin(phase1) * 0.6 + sin(phase2) * 0.4;
        vWaveHeight = wave;

        float amplitud = (0.0035 + speed * 0.011) * oceanMask;
        vec3 displaced = position + normal * (wave * amplitud);

        vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        vEastWorld = normalize(mat3(modelMatrix) * east);
        vNorthWorld = normalize(mat3(modelMatrix) * north);
        vViewDir = normalize(cameraPosition - worldPos.xyz);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D uCurrentTex;
      uniform sampler2D uWaterNormals;
      uniform float uHasNormals;
      uniform sampler2D uWaterMask;
      uniform float uHasMask;
      uniform vec3 uLightDir;

      varying vec2 vUv;
      varying vec3 vSphereDir;
      varying vec3 vNormalWorld;
      varying vec3 vEastWorld;
      varying vec3 vNorthWorld;
      varying vec3 vViewDir;
      varying float vWaveHeight;

      vec3 getEast(vec3 n) {
        return length(vec2(n.z, n.x)) > 0.001
          ? normalize(vec3(n.z, 0.0, -n.x))
          : vec3(1.0, 0.0, 0.0);
      }

      // Muestreo triplanar de waternormals.jpg sobre la esfera (sin costuras ni distorsión polar)
      vec3 sampleTriplanarWater(vec3 p, vec3 n, float scale) {
        vec3 w = pow(abs(n), vec3(4.0));
        w /= (w.x + w.y + w.z + 1e-5);

        vec3 nXY = texture2D(uWaterNormals, p.xy * scale).xyz * 2.0 - 1.0;
        vec3 nYZ = texture2D(uWaterNormals, p.yz * scale).xyz * 2.0 - 1.0;
        vec3 nXZ = texture2D(uWaterNormals, p.xz * scale).xyz * 2.0 - 1.0;

        return normalize(nXY * w.z + nYZ * w.x + nXZ * w.y);
      }

      void main() {
        float oceanMask = uHasMask > 0.5
          ? smoothstep(0.25, 0.75, texture2D(uWaterMask, vUv).r)
          : 1.0;
        if (oceanMask < 0.02) discard;

        vec3 n = normalize(vSphereDir);
        vec4 cur = texture2D(uCurrentTex, vUv);
        vec2 flow = (cur.rg - 0.5) * 2.0;
        float speed = cur.b;

        vec3 east = getEast(n);
        vec3 north = normalize(cross(n, east));
        vec3 flow3D = east * flow.x + north * flow.y;

        // Dual-phase flow-map blending sobre la textura real de normales de agua
        float cycle = uTime * (0.16 + speed * 0.24);
        float ph0 = fract(cycle);
        float ph1 = fract(cycle + 0.5);
        float blend = abs(2.0 * ph0 - 1.0);

        float advect = 0.045 * (0.35 + speed);
        vec3 p0 = normalize(n - flow3D * ph0 * advect);
        vec3 p1 = normalize(n - flow3D * ph1 * advect);

        // Capa 1: Olas oceánicas medias siguiendo la corriente
        vec3 wnMacro0 = sampleTriplanarWater(p0 + vec3(uTime * 0.002), n, 18.0);
        vec3 wnMacro1 = sampleTriplanarWater(p1 + vec3(uTime * 0.002), n, 18.0);
        vec3 wnMacro = normalize(mix(wnMacro0, wnMacro1, blend));

        // Capa 2: Micro-oleaje y rizos de superficie en mayor detalle
        vec3 pMicro0 = normalize(n - flow3D * ph0 * advect * 1.65);
        vec3 pMicro1 = normalize(n - flow3D * ph1 * advect * 1.65);
        vec3 wnMicro0 = sampleTriplanarWater(pMicro0 - vec3(0.0, uTime * 0.004, 0.0), n, 48.0);
        vec3 wnMicro1 = sampleTriplanarWater(pMicro1 - vec3(0.0, uTime * 0.004, 0.0), n, 48.0);
        vec3 wnMicro = normalize(mix(wnMicro0, wnMicro1, blend));

        vec3 tangentN = normalize(vec3(
          wnMacro.x * 0.65 + wnMicro.x * 0.45,
          wnMacro.y * 0.65 + wnMicro.y * 0.45,
          1.0
        ));

        // Normal del agua perturbada en espacio mundo para iluminación realista
        vec3 eastW = normalize(vEastWorld);
        vec3 northW = normalize(vNorthWorld);
        vec3 waveNormal = normalize(
          vNormalWorld + (eastW * tangentN.x + northW * tangentN.y) * (0.50 + speed * 0.55)
        );

        // Crestas extraídas de las pendientes reales del normal map + relieve 3D
        float pendiente = length(tangentN.xy);
        float cresta = smoothstep(0.22, 0.74, pendiente * 0.9 + max(vWaveHeight, 0.0) * 0.35);
        float intensidadCorriente = smoothstep(0.04, 0.75, speed);

        // Colores nocturnos de océano con reflejo de olas y espuma cian
        vec3 colorMarProfundo = vec3(0.01, 0.08, 0.19);
        vec3 colorCorriente = vec3(0.0, 0.74, 0.99);
        vec3 colorEspuma = vec3(0.75, 0.96, 1.0);

        float diff = max(dot(waveNormal, uLightDir), 0.15);
        vec3 halfVec = normalize(uLightDir + vViewDir);
        float spec = pow(max(dot(waveNormal, halfVec), 0.0), 54.0);
        float fresnel = pow(1.0 - max(dot(waveNormal, vViewDir), 0.0), 3.0);

        vec3 color = mix(colorMarProfundo, colorCorriente, cresta * (0.35 + 0.65 * intensidadCorriente));
        color *= (0.70 + 0.45 * diff);
        color = mix(color, colorEspuma, pow(cresta, 2.4) * (0.20 + 0.60 * intensidadCorriente));
        color += vec3(0.42, 0.88, 1.0) * (spec * 0.65 + fresnel * 0.22);

        float alpha = oceanMask * (0.22 + cresta * 0.38 + spec * 0.28 + intensidadCorriente * 0.08);
        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.82));
      }
    `,
  });

  olasMesh = new THREE.Mesh(geoOlas, matOlas);
  olasMesh.visible = ui.toggleCurrents.checked;
  scene.add(olasMesh);
}

async function cargarDatosCorrientes(cacheBust = false) {
  const url = cacheBust
    ? `src/corrientes.csv?t=${Date.now()}`
    : "src/corrientes.csv";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = await response.text();
    const celdas = procesarCSVCorrientes(content);

    if (celdas.length === 0) throw new Error("CSV de corrientes vacío");

    aplicarCampoCorrientes(celdas, "CSV Local", "badge");
    actualizarEstado("Olas de corriente cargadas desde src/corrientes.csv");
  } catch (err) {
    console.warn("Usando campo vectorial procedural de respaldo:", err.message);
    const celdas = generarCorrientesProcedurales();
    aplicarCampoCorrientes(celdas, "Procedural", "badge fallback");
    actualizarEstado("Usando modelo procedural de olas");
  }
}

function procesarCSVCorrientes(content) {
  const filas = content.trim().split(/\r?\n/);
  if (filas.length < 2) return [];

  const sep = filas[0].includes(";") ? ";" : ",";
  const encabezados = filas[0]
    .split(sep)
    .map((h) => h.trim().toLowerCase());

  const idxLat = encabezados.indexOf("lat");
  const idxLon = encabezados.indexOf("lon");
  const idxU = encabezados.indexOf("u");
  const idxV = encabezados.indexOf("v");
  if (idxLat === -1 || idxLon === -1 || idxU === -1 || idxV === -1) return [];

  const celdas = [];
  for (let i = 1; i < filas.length; i++) {
    const cols = filas[i].split(sep);
    if (cols.length < 4) continue;
    const lat = parseFloat(cols[idxLat]);
    const lon = parseFloat(cols[idxLon]);
    const u = parseFloat(cols[idxU]);
    const v = parseFloat(cols[idxV]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Number.isFinite(u) &&
      Number.isFinite(v)
    ) {
      celdas.push({ lat, lon, u, v });
    }
  }
  return celdas;
}

function generarCorrientesProcedurales() {
  const celdas = [];
  for (let lat = -65; lat <= 65; lat += PASO_REJILLA) {
    for (let lon = -175; lon <= 175; lon += PASO_REJILLA) {
      if (!esOceano(lat, lon)) continue;

      let u = 0;
      let v = 0;

      if (lat <= -40) {
        u = 0.85;
        v = 0.08 * Math.sin((lon * Math.PI) / 60);
      } else {
        u -= 0.6 * Math.exp(-(lat * lat) / 180);

        const dAtlN = Math.hypot((lat - 30) / 18, (lon + 42) / 28);
        if (dAtlN < 1.3) {
          u += ((lat - 30) / 18) * 0.65;
          v += (-(lon + 42) / 28) * 0.55;
        }
        if (lat > 24 && lat < 46 && lon > -78 && lon < -45) {
          u += 0.65;
          v += 0.45;
        }
        const dPacN = Math.hypot((lat - 30) / 18, (lon + 165) / 40);
        if (dPacN < 1.3) {
          u += ((lat - 30) / 18) * 0.6;
          v += (-(lon + 165) / 40) * 0.5;
        }
        const dAtlS = Math.hypot((lat + 25) / 16, (lon + 15) / 22);
        if (dAtlS < 1.2) {
          u += (-(lat + 25) / 16) * 0.55;
          v += ((lon + 15) / 22) * 0.5;
        }
        const dPacS = Math.hypot((lat + 25) / 16, (lon + 125) / 35);
        if (dPacS < 1.2) {
          u += (-(lat + 25) / 16) * 0.55;
          v += ((lon + 125) / 35) * 0.5;
        }
        const dInd = Math.hypot((lat + 20) / 15, (lon - 75) / 22);
        if (dInd < 1.2) {
          u += (-(lat + 20) / 15) * 0.55;
          v += ((lon - 75) / 22) * 0.5;
        }
      }

      celdas.push({
        lat,
        lon,
        u: Number(u.toFixed(4)),
        v: Number(v.toFixed(4)),
      });
    }
  }
  return celdas;
}

function getVectorCorriente(lat, lon) {
  const keyLat = Math.round(lat / PASO_REJILLA) * PASO_REJILLA;
  const keyLon = Math.round(lon / PASO_REJILLA) * PASO_REJILLA;
  const exact = rejillaCorrientes.get(`${keyLat},${keyLon}`);
  if (exact) return exact;

  for (let dLat = -PASO_REJILLA; dLat <= PASO_REJILLA; dLat += PASO_REJILLA) {
    for (let dLon = -PASO_REJILLA; dLon <= PASO_REJILLA; dLon += PASO_REJILLA) {
      const neighbor = rejillaCorrientes.get(
        `${keyLat + dLat},${keyLon + dLon}`
      );
      if (neighbor) return neighbor;
    }
  }
  return { u: 0.08, v: 0 };
}

function interpolarVectorSuave(lat, lon) {
  // Interpolación bilineal continua entre los 4 nodos de la malla más cercanos
  const latIdx = (lat + 65) / PASO_REJILLA;
  const lonIdx = (lon + 175) / PASO_REJILLA;

  const lat0 = Math.floor(latIdx) * PASO_REJILLA - 65;
  const lat1 = lat0 + PASO_REJILLA;
  const lon0 = Math.floor(lonIdx) * PASO_REJILLA - 175;
  const lon1 = lon0 + PASO_REJILLA;

  const tx = THREE.MathUtils.clamp(lonIdx - Math.floor(lonIdx), 0, 1);
  const ty = THREE.MathUtils.clamp(latIdx - Math.floor(latIdx), 0, 1);
  // Suavizado Hermite (smoothstep) para eliminar cualquier arista de celda
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const v00 = getVectorCorriente(lat0, lon0);
  const v10 = getVectorCorriente(lat0, lon1 > 175 ? -175 : lon1);
  const v01 = getVectorCorriente(lat1, lon0);
  const v11 = getVectorCorriente(lat1, lon1 > 175 ? -175 : lon1);

  const u0 = THREE.MathUtils.lerp(v00.u, v10.u, sx);
  const u1 = THREE.MathUtils.lerp(v01.u, v11.u, sx);
  const v0 = THREE.MathUtils.lerp(v00.v, v10.v, sx);
  const v1 = THREE.MathUtils.lerp(v01.v, v11.v, sx);

  return {
    u: THREE.MathUtils.lerp(u0, u1, sy),
    v: THREE.MathUtils.lerp(v0, v1, sy),
  };
}

function aplicarCampoCorrientes(celdas, etiquetaBadge, claseBadge) {
  celdasCorrientes = celdas;
  rejillaCorrientes.clear();

  for (const c of celdas) {
    const keyLat = Math.round(c.lat / PASO_REJILLA) * PASO_REJILLA;
    const keyLon = Math.round(c.lon / PASO_REJILLA) * PASO_REJILLA;
    rejillaCorrientes.set(`${keyLat},${keyLon}`, { u: c.u, v: c.v });
  }

  // Actualizamos la DataTexture con interpolación bilineal suavizada (sin cuadros)
  if (texturaCorrientes) {
    const data = texturaCorrientes.image.data;
    for (let row = 0; row < GRID_H; row++) {
      const lat = Map2Range(row + 0.5, 0, GRID_H, -90, 90);
      for (let col = 0; col < GRID_W; col++) {
        const lon = Map2Range(col + 0.5, 0, GRID_W, -180, 180);
        const vec = interpolarVectorSuave(lat, lon);
        const speed = Math.hypot(vec.u, vec.v);

        const idx = (row * GRID_W + col) * 4;
        data[idx] = Math.round(
          THREE.MathUtils.clamp((vec.u / 1.5) * 0.5 + 0.5, 0, 1) * 255
        );
        data[idx + 1] = Math.round(
          THREE.MathUtils.clamp((vec.v / 1.5) * 0.5 + 0.5, 0, 1) * 255
        );
        data[idx + 2] = Math.round(
          THREE.MathUtils.clamp(speed / 1.1, 0, 1) * 255
        );
        data[idx + 3] = 255;
      }
    }
    texturaCorrientes.needsUpdate = true;
  }

  ui.currentCells.textContent = celdas.length.toLocaleString("es-ES");
  ui.dataBadge.textContent = etiquetaBadge;
  ui.dataBadge.className = claseBadge;
}

// ============================================================================
// Geometría 3D y Textura Procedural para los Barcos
// ============================================================================
function crearTexturasBarco() {
  // Atlas de textura 256x256:
  // - Cuadrante superior izq (u: 0..0.5, v: 0.5..1): Casco lateral y línea de flotación
  // - Cuadrante superior der (u: 0.5..1, v: 0.5..1): Cubierta + contenedores multicolores
  // - Cuadrante inferior izq (u: 0..0.5, v: 0..0.5): Puente de mando iluminado
  // - Cuadrante inferior der (u: 0.5..1, v: 0..0.5): Cubierta de proa + luces
  const albedo = document.createElement("canvas");
  albedo.width = 256;
  albedo.height = 256;
  const ctx = albedo.getContext("2d");

  const emissive = document.createElement("canvas");
  emissive.width = 256;
  emissive.height = 256;
  const ectx = emissive.getContext("2d");
  ectx.fillStyle = "#000000";
  ectx.fillRect(0, 0, 256, 256);

  // 1) Casco lateral (arriba izq: x=0..128, y=0..128 en coords canvas)
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, 128, 92);
  ctx.fillStyle = "#b91c1c"; // Línea de flotación roja
  ctx.fillRect(0, 92, 128, 36);
  ctx.fillStyle = "#94a3b8"; // Borda metálica superior
  ctx.fillRect(0, 0, 128, 12);
  // Ojos de buey iluminados en el casco
  ectx.fillStyle = "#fbbf24";
  for (let x = 16; x < 116; x += 18) {
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(x, 36, 6, 5);
    ectx.fillRect(x, 36, 6, 5);
  }

  // 2) Cubierta + Contenedores (arriba der: x=128..256, y=0..128)
  ctx.fillStyle = "#334155";
  ctx.fillRect(128, 0, 128, 128);
  const paletaContenedores = [
    "#ff6600",
    "#0284c7",
    "#dc2626",
    "#f59e0b",
    "#e2e8f0",
    "#0d9488",
  ];
  let cIdx = 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      ctx.fillStyle = paletaContenedores[cIdx % paletaContenedores.length];
      ctx.fillRect(136 + col * 23, 14 + row * 26, 19, 21);
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(136 + col * 23, 14 + row * 26, 19, 21);
      cIdx++;
    }
  }

  // 3) Puente blanco con ventanas luminosas (abajo izq: x=0..128, y=128..256)
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 128, 128, 128);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(10, 146, 108, 22);
  ctx.fillRect(10, 184, 108, 16);
  // Luces del puente de mando
  ctx.fillStyle = "#fde047";
  ctx.fillRect(14, 150, 100, 14);
  ectx.fillStyle = "#fef08a";
  ectx.fillRect(14, 150, 100, 14);
  ectx.fillRect(16, 187, 96, 10);

  // 4) Cubierta de proa + luces de navegación (abajo der: x=128..256, y=128..256)
  ctx.fillStyle = "#475569";
  ctx.fillRect(128, 128, 128, 128);
  ctx.fillStyle = "#ff6600"; // Franja naranja de señalización en proa
  ctx.fillRect(148, 140, 88, 14);
  // Faro de proa cálido + babor rojo + estribor verde
  ectx.fillStyle = "#ffffff";
  ectx.fillRect(184, 134, 16, 10);
  ectx.fillStyle = "#ef4444";
  ectx.fillRect(132, 190, 14, 14);
  ectx.fillStyle = "#22c55e";
  ectx.fillRect(238, 190, 14, 14);

  const mapTex = new THREE.CanvasTexture(albedo);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  const emissiveTex = new THREE.CanvasTexture(emissive);
  emissiveTex.colorSpace = THREE.SRGBColorSpace;

  return { mapTex, emissiveTex };
}

// Geometría estilizada de buque carguero orientada: +Z proa, +Y arriba, X manga
function crearGeometriaBarco() {
  const positions = [];
  const uvs = [];

  // Helper para añadir un triángulo con UVs
  function tri(a, b, c, uva, uvb, uvc) {
    positions.push(...a, ...b, ...c);
    uvs.push(...uva, ...uvb, ...uvc);
  }

  // Helper para cuadrilátero en una región UV del atlas (u0..u1, v0..v1)
  function quad(p0, p1, p2, p3, u0, v0, u1, v1) {
    tri(p0, p1, p2, [u0, v0], [u1, v0], [u1, v1]);
    tri(p0, p2, p3, [u0, v0], [u1, v1], [u0, v1]);
  }

  // Dimensiones base normalizadas del buque
  const w = 0.24; // Semimanga
  const h = 0.26; // Altura del casco
  const zPopa = -0.65;
  const zHombro = 0.28;
  const zProa = 0.78;

  // Coordenadas del casco
  const pBL = [-w, 0, zPopa];
  const pBR = [w, 0, zPopa];
  const pTL = [-w, h, zPopa];
  const pTR = [w, h, zPopa];

  const mBL = [-w, 0, zHombro];
  const mBR = [w, 0, zHombro];
  const mTL = [-w, h, zHombro];
  const mTR = [w, h, zHombro];

  const bowB = [0, 0.04, zProa];
  const bowT = [0, h * 1.15, zProa];

  // Costados del casco (región UV casco: u 0..0.5, v 0.5..1)
  quad(pBL, mBL, mTL, pTL, 0.0, 0.5, 0.48, 1.0); // Babor
  quad(mBR, pBR, pTR, mTR, 0.0, 0.5, 0.48, 1.0); // Estribor
  quad(pBR, pBL, pTL, pTR, 0.0, 0.5, 0.48, 1.0); // Popa

  // Proa afilada (babor y estribor)
  quad(mBL, bowB, bowT, mTL, 0.0, 0.5, 0.48, 1.0);
  quad(bowB, mBR, mTR, bowT, 0.0, 0.5, 0.48, 1.0);

  // Cubierta de proa (normal +Y, región UV proa: u 0.5..1, v 0..0.5)
  tri(mTL, bowT, mTR, [0.5, 0.0], [0.75, 0.48], [1.0, 0.0]);

  // Cubierta principal con carga (normal +Y, región UV contenedores: u 0.5..1, v 0.5..1)
  quad(pTL, mTL, mTR, pTR, 0.52, 0.52, 0.98, 0.98);

  // Bloque de contenedores sobre cubierta
  const cw = w * 0.76;
  const ch = h + 0.16;
  const cz0 = -0.24;
  const cz1 = 0.24;
  const c00 = [-cw, h, cz0];
  const c10 = [cw, h, cz0];
  const c11 = [cw, h, cz1];
  const c01 = [-cw, h, cz1];
  const ct00 = [-cw, ch, cz0];
  const ct10 = [cw, ch, cz0];
  const ct11 = [cw, ch, cz1];
  const ct01 = [-cw, ch, cz1];

  quad(ct00, ct01, ct11, ct10, 0.52, 0.52, 0.98, 0.98); // Techo contenedores (+Y)
  quad(c00, c01, ct01, ct00, 0.52, 0.52, 0.98, 0.98); // Lado izq (-X)
  quad(c11, c10, ct10, ct11, 0.52, 0.52, 0.98, 0.98); // Lado der (+X)
  quad(c01, c11, ct11, ct01, 0.52, 0.52, 0.98, 0.98); // Frente (+Z)
  quad(c10, c00, ct00, ct10, 0.52, 0.52, 0.98, 0.98); // Atrás (-Z)

  // Puente de mando elevado en popa (región UV puente: u 0..0.5, v 0..0.5)
  const bw = w * 0.86;
  const bh = h + 0.34;
  const bz0 = -0.58;
  const bz1 = -0.34;
  const b00 = [-bw, h, bz0];
  const b10 = [bw, h, bz0];
  const b11 = [bw, h, bz1];
  const b01 = [-bw, h, bz1];
  const bt00 = [-bw, bh, bz0];
  const bt10 = [bw, bh, bz0];
  const bt11 = [bw, bh, bz1];
  const bt01 = [-bw, bh, bz1];

  quad(b01, b11, bt11, bt01, 0.02, 0.02, 0.48, 0.48); // Ventanal frontal (+Z)
  quad(b10, b00, bt00, bt10, 0.02, 0.02, 0.48, 0.48); // Ventanal trasero (-Z)
  quad(b00, b01, bt01, bt00, 0.02, 0.02, 0.48, 0.48); // Lateral izq (-X)
  quad(b11, b10, bt10, bt11, 0.02, 0.02, 0.48, 0.48); // Lateral der (+X)
  quad(bt00, bt01, bt11, bt10, 0.02, 0.02, 0.48, 0.48); // Techo puente (+Y)

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function prepararModeloBarcoTexturizado() {
  const { mapTex, emissiveTex } = crearTexturasBarco();
  geoBarcoCompartida = crearGeometriaBarco();
  matBarcoCompartido = new THREE.MeshPhongMaterial({
    map: mapTex,
    emissiveMap: emissiveTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.75,
    shininess: 35,
  });
}

// ============================================================================
// CAPA 2: Tráfico Marítimo esférico (THREE.LineSegments + THREE.InstancedMesh)
// ============================================================================
async function cargarDatosRutas(cacheBust = false) {
  const url = cacheBust
    ? `src/rutas_maritimas.csv?t=${Date.now()}`
    : "src/rutas_maritimas.csv";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = await response.text();
    const rutas = procesarCSVRutas(content);
    if (rutas.length === 0) throw new Error("CSV de rutas vacío");
    construirCapaTrafico(rutas);
  } catch (err) {
    console.warn("Usando rutas marítimas de respaldo:", err.message);
    construirCapaTrafico(obtenerRutasRespaldo());
  }
}

function procesarCSVRutas(content) {
  const filas = content.trim().split(/\r?\n/);
  if (filas.length < 2) return [];

  const sep = filas[0].includes(";") ? ";" : ",";
  const enc = filas[0].split(sep).map((h) => h.trim().toLowerCase());

  if (enc.includes("lat_origen") && enc.includes("lat_destino")) {
    const iId = enc.indexOf("id_ruta");
    const iLatO = enc.indexOf("lat_origen");
    const iLonO = enc.indexOf("lon_origen");
    const iLatD = enc.indexOf("lat_destino");
    const iLonD = enc.indexOf("lon_destino");

    const rutas = [];
    for (let i = 1; i < filas.length; i++) {
      const c = filas[i].split(sep);
      if (c.length < 5) continue;
      const latO = parseFloat(c[iLatO]);
      const lonO = parseFloat(c[iLonO]);
      const latD = parseFloat(c[iLatD]);
      const lonD = parseFloat(c[iLonD]);
      if (![latO, lonO, latD, lonD].every(Number.isFinite)) continue;
      rutas.push({
        id: iId !== -1 ? c[iId].trim() : `RUTA_${i}`,
        tipo: "major",
        waypoints: [
          { lat: latO, lon: lonO, t: 0 },
          { lat: latD, lon: lonD, t: 100 },
        ],
      });
    }
    return rutas;
  }

  const iId = enc.indexOf("id_barco");
  const iTipo = enc.indexOf("tipo");
  const iTs = enc.indexOf("timestamp");
  const iLat = enc.indexOf("lat");
  const iLon = enc.indexOf("lon");
  if (iId === -1 || iLat === -1 || iLon === -1) return [];

  const mapaRutas = new Map();
  for (let i = 1; i < filas.length; i++) {
    const c = filas[i].split(sep);
    if (c.length < 4) continue;
    const id = c[iId].trim();
    const tipo = iTipo !== -1 ? c[iTipo].trim().toLowerCase() : "major";
    const ts = iTs !== -1 ? parseFloat(c[iTs]) : i;
    const lat = parseFloat(c[iLat]);
    const lon = parseFloat(c[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    if (!mapaRutas.has(id)) {
      mapaRutas.set(id, { id, tipo, waypoints: [] });
    }
    mapaRutas.get(id).waypoints.push({
      lat,
      lon,
      t: Number.isFinite(ts) ? ts : i,
    });
  }

  const rutas = Array.from(mapaRutas.values()).filter(
    (r) => r.waypoints.length >= 2
  );
  rutas.forEach((r) => r.waypoints.sort((a, b) => a.t - b.t));
  return rutas;
}

function obtenerRutasRespaldo() {
  const definiciones = [
    [
      "ATL_N_01",
      [
        [51.9, 4.1],
        [49.0, -6.5],
        [47.5, -20.0],
        [44.5, -40.0],
        [42.0, -58.0],
        [40.6, -74.0],
      ],
    ],
    [
      "SUEZ_01",
      [
        [36.1, -5.4],
        [35.5, 14.5],
        [31.2, 32.3],
        [20.0, 38.5],
        [12.6, 43.3],
        [8.0, 68.0],
        [5.5, 95.0],
        [1.3, 103.8],
        [31.2, 121.5],
      ],
    ],
    [
      "CABO_01",
      [
        [50.0, -5.0],
        [22.0, -18.0],
        [5.0, -15.0],
        [-34.5, 18.4],
        [-26.0, 42.0],
        [0.0, 82.0],
        [1.3, 103.8],
      ],
    ],
    [
      "PAN_01",
      [
        [25.8, -80.1],
        [9.4, -79.9],
        [8.9, -79.5],
        [14.0, -96.0],
        [33.7, -118.2],
        [36.0, -165.0],
        [35.6, 139.8],
      ],
    ],
  ];

  return definiciones.map(([id, pts]) => ({
    id,
    tipo: "major",
    waypoints: pts.map(([lat, lon], idx) => ({ lat, lon, t: idx * 20 })),
  }));
}

// Subdivide un tramo entre dos puntos 3D para que siga fielmente la curvatura esférica
function muestrearArcoEsferico(rutas) {
  return rutas.map((r) => {
    const puntosEsfera = [];
    const wps = r.waypoints;

    for (let i = 0; i < wps.length - 1; i++) {
      const pA = latLonToVector3(wps[i].lat, wps[i].lon, 1.0);
      const pB = latLonToVector3(wps[i + 1].lat, wps[i + 1].lon, 1.0);
      const ang = pA.angleTo(pB);
      const pasos = Math.max(1, Math.ceil(ang / 0.05)); // Mínimo cada ~2.8°

      for (let s = 0; s < pasos; s++) {
        const t = s / pasos;
        const v = new THREE.Vector3().lerpVectors(pA, pB, t).normalize();
        puntosEsfera.push(v);
      }
    }
    const ultimo = latLonToVector3(
      wps[wps.length - 1].lat,
      wps[wps.length - 1].lon,
      1.0
    );
    puntosEsfera.push(ultimo);

    let longitud = 0;
    for (let i = 0; i < puntosEsfera.length - 1; i++) {
      longitud += puntosEsfera[i].distanceTo(puntosEsfera[i + 1]) * RADIO_TIERRA;
    }

    return {
      id: r.id,
      tipo: r.tipo || "major",
      puntosEsfera,
      longitud: Math.max(longitud, 0.15),
    };
  });
}

function construirCapaTrafico(rutas) {
  if (lineasRutas) {
    scene.remove(lineasRutas);
    lineasRutas.geometry.dispose();
    lineasRutas.material.dispose();
  }
  if (mallaBarcos) {
    scene.remove(mallaBarcos);
  }

  rutasProcesadas = muestrearArcoEsferico(rutas);

  // 1) Líneas doradas sobre la esfera (sin saltos de antimeridiano en 3D)
  const verticesLineas = [];
  for (const ruta of rutasProcesadas) {
    const pts = ruta.puntosEsfera;
    for (let i = 0; i < pts.length - 1; i++) {
      verticesLineas.push(
        pts[i].x * RADIO_LINEAS,
        pts[i].y * RADIO_LINEAS,
        pts[i].z * RADIO_LINEAS
      );
      verticesLineas.push(
        pts[i + 1].x * RADIO_LINEAS,
        pts[i + 1].y * RADIO_LINEAS,
        pts[i + 1].z * RADIO_LINEAS
      );
    }
  }

  const geoLineas = new THREE.BufferGeometry();
  geoLineas.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(verticesLineas, 3)
  );
  const matLineas = new THREE.LineBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 0.16,
  });
  lineasRutas = new THREE.LineSegments(geoLineas, matLineas);
  lineasRutas.visible = ui.toggleTraffic.checked;
  scene.add(lineasRutas);

  // 2) Flota densa de barcos texturizados en InstancedMesh
  flotaBarcos = [];
  for (let rIdx = 0; rIdx < rutasProcesadas.length; rIdx++) {
    const ruta = rutasProcesadas[rIdx];
    const densidad = DENSIDAD_FLOTA[ruta.tipo] ?? DENSIDAD_FLOTA.middle;
    const numBarcos = Math.max(3, Math.round(ruta.longitud * densidad));

    for (let b = 0; b < numBarcos; b++) {
      const sentido = b % 2 === 0 ? 1 : -1;
      const rapidezVisual = 0.04 + Math.random() * 0.02;
      flotaBarcos.push({
        rutaIdx: rIdx,
        fase: (b + 0.2 + Math.random() * 0.6) / numBarcos,
        velocidad: rapidezVisual / ruta.longitud,
        sentido,
        escala: 0.020 + Math.random() * 0.010,
        desvioLateral: (sentido * 0.008) + (Math.random() - 0.5) * 0.012,
      });
    }
  }

  mallaBarcos = new THREE.InstancedMesh(
    geoBarcoCompartida,
    matBarcoCompartido,
    flotaBarcos.length
  );
  mallaBarcos.visible = ui.toggleTraffic.checked;
  scene.add(mallaBarcos);

  actualizarContadorBarcos();
}

function orientarBarcoEnEsfera(posNorm, forwardDir, escala, desvioLateral = 0) {
  tmpUp.copy(posNorm).normalize();
  tmpForward.copy(forwardDir);
  // Proyectamos la dirección al plano tangente de la esfera
  tmpForward.addScaledVector(tmpUp, -tmpForward.dot(tmpUp));
  if (tmpForward.lengthSq() < 1e-8) {
    tmpForward.set(0, 0, 1);
  } else {
    tmpForward.normalize();
  }

  // Base ortonormal dextrógira: X = right, Y = up (normal radial), Z = forward (proa)
  tmpRight.crossVectors(tmpUp, tmpForward).normalize();

  tmpBasis.makeBasis(tmpRight, tmpUp, tmpForward);
  dummyObj.quaternion.setFromRotationMatrix(tmpBasis);
  dummyObj.position
    .copy(tmpUp)
    .multiplyScalar(RADIO_BARCOS)
    .addScaledVector(tmpRight, desvioLateral);
  dummyObj.scale.setScalar(escala);
  dummyObj.updateMatrix();
}

function actualizarBarcos(dt) {
  if (!mallaBarcos || !mallaBarcos.visible || flotaBarcos.length === 0) return;

  for (let i = 0; i < flotaBarcos.length; i++) {
    const barco = flotaBarcos[i];
    barco.fase =
      (barco.fase + barco.sentido * barco.velocidad * dt * velocidadSim + 1) % 1;

    const pts = rutasProcesadas[barco.rutaIdx].puntosEsfera;
    const totalTramos = pts.length - 1;
    const progreso = barco.fase * totalTramos;
    const tramoIdx = Math.min(totalTramos - 1, Math.floor(progreso));
    const tLocal = progreso - tramoIdx;

    const p0 = pts[tramoIdx];
    const p1 = pts[tramoIdx + 1];

    tmpPos.lerpVectors(p0, p1, tLocal).normalize();
    if (barco.sentido > 0) {
      tmpNext.subVectors(p1, p0);
    } else {
      tmpNext.subVectors(p0, p1);
    }

    orientarBarcoEnEsfera(tmpPos, tmpNext, barco.escala, barco.desvioLateral);
    mallaBarcos.setMatrixAt(i, dummyObj.matrix);
  }

  mallaBarcos.instanceMatrix.needsUpdate = true;
}

// ============================================================================
// CAPA 2B: Buques AIS reales en vivo sobre la esfera
// ============================================================================
async function cargarDatosAIS(cacheBust = false) {
  const url = cacheBust
    ? `src/ais_live.csv?t=${Date.now()}`
    : "src/ais_live.csv";

  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const content = await response.text();
    const barcos = procesarCSVAIS(content);
    if (barcos.length > 0) {
      construirCapaAIS(barcos);
    }
  } catch (err) {
    console.warn("Sin datos AIS locales:", err.message);
  }
}

function procesarCSVAIS(content) {
  const filas = content.trim().split(/\r?\n/);
  if (filas.length < 2) return [];

  const sep = filas[0].includes(";") ? ";" : ",";
  const enc = filas[0].split(sep).map((h) => h.trim().toLowerCase());
  const iLat = enc.indexOf("lat");
  const iLon = enc.indexOf("lon");
  const iSog = enc.indexOf("sog");
  const iCog = enc.indexOf("cog");
  if (iLat === -1 || iLon === -1) return [];

  const barcos = [];
  for (let i = 1; i < filas.length; i++) {
    const c = filas[i].split(sep);
    if (c.length < 2) continue;
    const lat = parseFloat(c[iLat]);
    const lon = parseFloat(c[iLon]);
    const sog = iSog !== -1 ? parseFloat(c[iSog]) : 0;
    const cog = iCog !== -1 ? parseFloat(c[iCog]) : 0;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    barcos.push({
      lat,
      lon,
      origLat: lat,
      origLon: lon,
      sog: Number.isFinite(sog) ? sog : 0,
      cog: Number.isFinite(cog) ? cog : 0,
    });
  }
  return barcos;
}

function construirCapaAIS(barcos) {
  if (mallaAIS) {
    scene.remove(mallaAIS);
  }

  barcosAIS = barcos;
  mallaAIS = new THREE.InstancedMesh(
    geoBarcoCompartida,
    matBarcoCompartido,
    barcosAIS.length
  );
  mallaAIS.visible = ui.toggleTraffic.checked;
  scene.add(mallaAIS);

  actualizarContadorBarcos();
}

function actualizarBarcosAIS(dt) {
  if (!mallaAIS || !mallaAIS.visible || barcosAIS.length === 0) return;

  for (let i = 0; i < barcosAIS.length; i++) {
    const b = barcosAIS[i];
    const rad = (b.cog * Math.PI) / 180;

    if (b.sog > 0.5) {
      const pasoDeg = b.sog * 0.0055 * dt * velocidadSim;
      b.lat += Math.cos(rad) * pasoDeg;
      b.lon +=
        (Math.sin(rad) * pasoDeg) /
        Math.max(Math.cos((b.lat * Math.PI) / 180), 0.2);

      if (
        !esOceano(b.lat, b.lon) ||
        Math.hypot(b.lat - b.origLat, b.lon - b.origLon) > 2.2
      ) {
        b.lat = b.origLat;
        b.lon = b.origLon;
      }
    }

    latLonToVector3(b.lat, b.lon, 1.0, tmpPos);
    // Vector rumbo pequeño sobre la esfera para orientar el barco AIS
    const dLat = Math.cos(rad) * 0.1;
    const dLon =
      (Math.sin(rad) * 0.1) /
      Math.max(Math.cos((b.lat * Math.PI) / 180), 0.2);
    latLonToVector3(b.lat + dLat, b.lon + dLon, 1.0, tmpNext);
    tmpNext.sub(tmpPos);

    orientarBarcoEnEsfera(tmpPos, tmpNext, 0.016, 0);
    mallaAIS.setMatrixAt(i, dummyObj.matrix);
  }

  mallaAIS.instanceMatrix.needsUpdate = true;
}

function actualizarContadorBarcos() {
  if (!ui.toggleTraffic.checked) {
    ui.activeShips.textContent = "0";
    return;
  }
  const total = flotaBarcos.length + barcosAIS.length;
  ui.activeShips.textContent = total.toLocaleString("es-ES");
}

// ============================================================================
// Retrieve en vivo: Open-Meteo Marine API + Digitraffic AIS API
// ============================================================================
async function actualizarDatosEnVivo() {
  ui.btnRefreshApi.disabled = true;
  actualizarEstado("Consultando APIs marinas en vivo...");

  const coords = [];
  for (let lat = -65; lat <= 65; lat += PASO_REJILLA) {
    for (let lon = -175; lon <= 175; lon += PASO_REJILLA) {
      if (esOceano(lat, lon)) {
        coords.push({ lat, lon });
      }
    }
  }

  const nuevasCeldas = [];
  const batchSize = 80;

  try {
    const aisPromise = fetch("https://meri.digitraffic.fi/api/ais/v1/locations", {
      headers: { Accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.features)) return 0;
        const vivos = data.features
          .filter((f) => f.geometry && Array.isArray(f.geometry.coordinates))
          .map((f) => {
            const [lon, lat] = f.geometry.coordinates;
            const props = f.properties || {};
            return {
              lat,
              lon,
              origLat: lat,
              origLon: lon,
              sog: props.sog ?? 0,
              cog: props.cog ?? 0,
            };
          });
        if (vivos.length > 0) construirCapaAIS(vivos);
        return vivos.length;
      })
      .catch(() => 0);

    for (let i = 0; i < coords.length; i += batchSize) {
      const batch = coords.slice(i, i + batchSize);
      const lats = batch.map((c) => c.lat).join(",");
      const lons = batch.map((c) => c.lon).join(",");
      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&current=ocean_current_velocity,ocean_current_direction`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const items = Array.isArray(json) ? json : [json];

      items.forEach((item, idx) => {
        const cur = item.current;
        if (
          cur &&
          cur.ocean_current_velocity !== null &&
          cur.ocean_current_direction !== null
        ) {
          const velMs = cur.ocean_current_velocity / 3.6;
          const rad = (cur.ocean_current_direction * Math.PI) / 180;
          nuevasCeldas.push({
            lat: batch[idx].lat,
            lon: batch[idx].lon,
            u: Number((velMs * Math.sin(rad)).toFixed(4)),
            v: Number((velMs * Math.cos(rad)).toFixed(4)),
          });
        }
      });

      const pct = Math.min(
        100,
        Math.round(((i + batch.length) / coords.length) * 100)
      );
      actualizarEstado(`Descargando datos en vivo... ${pct}%`);
    }

    const aisCount = await aisPromise;

    if (nuevasCeldas.length > 0) {
      aplicarCampoCorrientes(nuevasCeldas, "API en vivo", "badge live");
      const hora = new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      actualizarEstado(
        aisCount > 0
          ? `Actualizado (${hora}): ${nuevasCeldas.length} celdas + ${aisCount} AIS`
          : `Olas actualizadas (${hora})`
      );
    } else {
      throw new Error("No se recibieron celdas válidas");
    }
  } catch (err) {
    console.error("Error en retrieve API:", err);
    actualizarEstado("Error al consultar API; se mantienen datos actuales");
  } finally {
    ui.btnRefreshApi.disabled = false;
  }
}

function exportarCSVCorrientes() {
  if (celdasCorrientes.length === 0) return;
  const lineas = ["lat;lon;u;v"];
  for (const c of celdasCorrientes) {
    lineas.push(`${c.lat};${c.lon};${c.u};${c.v}`);
  }
  const blob = new Blob([lineas.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "corrientes_live.csv";
  a.click();
  URL.revokeObjectURL(url);
  actualizarEstado("Exportado corrientes_live.csv");
}

// ============================================================================
// Controles HUD y Bucle de animación
// ============================================================================
function configurarEventosUI() {
  ui.toggleCurrents.addEventListener("change", (e) => {
    if (olasMesh) olasMesh.visible = e.target.checked;
  });

  ui.toggleTraffic.addEventListener("change", (e) => {
    if (lineasRutas) lineasRutas.visible = e.target.checked;
    if (mallaBarcos) mallaBarcos.visible = e.target.checked;
    if (mallaAIS) mallaAIS.visible = e.target.checked;
    actualizarContadorBarcos();
  });

  ui.toggleWireframe.addEventListener("change", (e) => {
    if (tierraMesh) {
      tierraMesh.material.wireframe = e.target.checked;
      tierraMesh.material.needsUpdate = true;
    }
  });

  ui.toggleAutorotate.addEventListener("change", (e) => {
    camcontrols.autoRotate = e.target.checked;
  });

  ui.simSpeed.addEventListener("input", (e) => {
    velocidadSim = parseFloat(e.target.value);
    ui.speedLabel.textContent = `${velocidadSim.toFixed(1)}x`;
  });

  ui.btnRefreshApi.addEventListener("click", actualizarDatosEnVivo);
  ui.btnReloadCsv.addEventListener("click", () => {
    cargarDatosCorrientes(true);
    cargarDatosRutas(true);
    cargarDatosAIS(true);
  });
  ui.btnDownloadCsv.addEventListener("click", exportarCSVCorrientes);
}

function actualizarEstado(texto) {
  ui.statusMsg.textContent = texto;
}

function actualizarRelojHUD(dt) {
  minutosSimulados += dt * 45 * velocidadSim;
  const fechaActual = new Date(
    fechaInicio.getTime() + minutosSimulados * 60000
  );
  ui.simDatetime.textContent = fechaActual.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  actualizarRelojHUD(dt);

  if (olasMesh && olasMesh.visible) {
    olasMesh.material.uniforms.uTime.value += dt * velocidadSim;
  }

  actualizarBarcos(dt);
  actualizarBarcosAIS(dt);

  camcontrols.update();
  renderer.render(scene, camera);
}
