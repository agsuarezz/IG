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
const RADIO_OLAS = RADIO_TIERRA - 0.009;
const RADIO_LINEAS = RADIO_TIERRA + 0.007;
const RADIO_BARCOS = RADIO_TIERRA + 0.012;
const RADIO_NUBES = RADIO_TIERRA + 0.052;

const DENSIDAD_FLOTA = {
  major: 22.0,
  middle: 12.0,
  minor: 6.0,
};

const PRESETS_CAMARA = {
  global: { lat: 24, lon: -32, dist: 5.8 },
  gibraltar: { lat: 36.0, lon: -5.5, dist: 2.92 },
  suez: { lat: 29.8, lon: 32.5, dist: 3.0 },
  malaca: { lat: 2.2, lon: 102.5, dist: 3.05 },
  panama: { lat: 9.2, lon: -79.8, dist: 3.0 },
  atlantico: { lat: 41.0, lon: -42.0, dist: 3.65 },
};

let scene, renderer, camera, camcontrols;
let tierraMesh, olasMesh, atmosferaMesh, nubesMesh;
let ambientLight, dirLight;
let tierraShaderUniforms = null;

// Reloj y tiempo simulado
const clock = new THREE.Clock();
const fechaInicio = new Date(Date.UTC(2026, 10, 13, 18, 0, 0));
let minutosSimulados = 0;
let velocidadSim = 1.0;

// Capa 1: Corrientes, SST y Oleaje (ShaderMaterial + DataTextures)
const GRID_W = 144;
const GRID_H = 72;
let texturaCorrientes = null;
let texturaAmbiente = null; // R: wave_height, G: sst
let celdasCorrientes = []; // { lat, lon, u, v, waveHeight, sst }
let rejillaCorrientes = new Map();
const PASO_REJILLA = 10;

// Máscara oceánica (720x360)
let mascaraOceano = null;

// Capa 2: Tráfico marítimo (red global + barcos AIS reales)
let lineasRutas = null;
let mallaBarcos = null;
let mallaAIS = null;
let geoBarcoCompartida = null;
let matBarcoCompartido = null;
let rutasOriginales = [];
let rutasProcesadas = [];
let flotaBarcos = [];
let barcosAIS = [];
const cacheMetadatosAIS = new Map();

// Raycasting, Sonda, Seguimiento y Animación de cámara
const raycaster = new THREE.Raycaster();
const esferaMatematica = new THREE.Sphere(new THREE.Vector3(0, 0, 0), RADIO_TIERRA);
const pointerNDC = new THREE.Vector2();
let pointerDownPos = { x: 0, y: 0 };
let barcoSeleccionado = null; // { tipo: 'corredor' | 'ais', index: number }
let siguiendoBarco = false;
let vueloCamara = null; // { startPos, endPos, startTarget, endTarget, progress }

const dummyObj = new THREE.Object3D();
const tmpUp = new THREE.Vector3();
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpBasis = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpNext = new THREE.Vector3();
const tmpHit = new THREE.Vector3();
const tmpSunDir = new THREE.Vector3(6, 4, 7).normalize();
const tmpFollowPos = new THREE.Vector3();
const tmpFollowDelta = new THREE.Vector3();

// Referencias al HUD y controles
const ui = {
  hud: document.getElementById("hud"),
  btnHideHud: document.getElementById("btn-hide-hud"),
  btnShowHud: document.getElementById("btn-show-hud"),
  btnFullscreen: document.getElementById("btn-fullscreen"),
  simDatetime: document.getElementById("sim-datetime"),
  activeShips: document.getElementById("active-ships"),
  currentCells: document.getElementById("current-cells"),
  dataBadge: document.getElementById("data-badge"),
  statusMsg: document.getElementById("status-msg"),
  oceanMode: document.getElementById("ocean-mode"),
  trafficFilter: document.getElementById("traffic-filter"),
  toggleCurrents: document.getElementById("toggle-currents"),
  toggleTraffic: document.getElementById("toggle-traffic"),
  toggleClouds: document.getElementById("toggle-clouds"),
  toggleDayNight: document.getElementById("toggle-daynight"),
  toggleWireframe: document.getElementById("toggle-wireframe"),
  toggleAutorotate: document.getElementById("toggle-autorotate"),
  simSpeed: document.getElementById("sim-speed"),
  speedLabel: document.getElementById("speed-label"),
  btnRefreshApi: document.getElementById("btn-refresh-api"),
  btnReloadCsv: document.getElementById("btn-reload-csv"),
  btnDownloadCsv: document.getElementById("btn-download-csv"),
  oceanProbe: document.getElementById("ocean-probe"),
  scaleBar: document.getElementById("scale-bar"),
  scaleMin: document.getElementById("scale-min"),
  scaleMax: document.getElementById("scale-max"),
  shipInspector: document.getElementById("ship-inspector"),
  inspTitle: document.getElementById("insp-title"),
  inspBody: document.getElementById("insp-body"),
  btnCloseInspector: document.getElementById("btn-close-inspector"),
  btnFollowShip: document.getElementById("btn-follow-ship"),
  presetButtons: document.querySelectorAll(".preset-btn"),
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
    0.05,
    1000
  );
  camera.position.set(3.4, 2.1, 4.4);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  camcontrols = new OrbitControls(camera, renderer.domElement);
  camcontrols.enableDamping = true;
  camcontrols.dampingFactor = 0.06;
  camcontrols.minDistance = RADIO_TIERRA + 0.14;
  camcontrols.maxDistance = 12.0;
  camcontrols.enablePan = false;
  camcontrols.autoRotate = ui.toggleAutorotate.checked;
  camcontrols.autoRotateSpeed = 0.45;

  // Cancelar vuelo automático si el usuario interactúa manualmente
  camcontrols.addEventListener("start", () => {
    vueloCamara = null;
  });

  // Iluminación espacial (ajustada dinámicamente por el ciclo Día/Noche)
  ambientLight = new THREE.AmbientLight(0x4a6b94, 0.38);
  scene.add(ambientLight);

  dirLight = new THREE.DirectionalLight(0xfff4e0, 1.85);
  dirLight.position.set(6, 4, 7);
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.25);
  rimLight.position.set(-6, -3, -4);
  scene.add(rimLight);

  crearCampoEstrellas();
  crearAtmosfera();
  prepararModeloBarcoTexturizado();

  // Carga de texturas 4K / 2K / nubes / normales oceánicas
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const bathyTexture = loader.load(
    "src/gebco_bathy.5400x2700_8bit.jpg",
    undefined,
    undefined,
    () => console.warn("No se pudo cargar src/gebco_bathy.5400x2700_8bit.jpg")
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
    () => console.warn("No se pudo cargar src/water_mask_4k.png")
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

  const cloudsTexture = loader.load(
    "src/earth_clouds_1024.png",
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      crearCapaNubes(tex);
    },
    undefined,
    () => console.warn("Sin textura de nubes")
  );
  void cloudsTexture;

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
    () => {
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
  configurarEventosInteraccion();
  window.addEventListener("resize", onWindowResize);
}

// ============================================================================
// Mapeo geográfico esférico (estilo asignatura con Map2Range)
// ============================================================================
function Map2Range(val, vmin, vmax, dmin, dmax) {
  const t = 1 - (vmax - val) / (vmax - vmin);
  return dmin + t * (dmax - dmin);
}

function latLonToVector3(lat, lon, radio = RADIO_TIERRA, target = null) {
  const phi = Map2Range(lon, MIN_LON, MAX_LON, 0, Math.PI * 2);
  const theta = Map2Range(lat, MIN_LAT, MAX_LAT, Math.PI, 0);

  const x = -radio * Math.cos(phi) * Math.sin(theta);
  const y = radio * Math.cos(theta);
  const z = radio * Math.sin(phi) * Math.sin(theta);

  if (target) return target.set(x, y, z);
  return new THREE.Vector3(x, y, z);
}

function vector3ToLatLon(vec) {
  const n = vec.clone().normalize();
  const theta = Math.acos(THREE.MathUtils.clamp(n.y, -1, 1));
  let phi = Math.atan2(n.z, -n.x);
  if (phi < 0) phi += Math.PI * 2;
  const lat = Map2Range(theta, Math.PI, 0, MIN_LAT, MAX_LAT);
  const lon = Map2Range(phi, 0, Math.PI * 2, MIN_LON, MAX_LON);
  return { lat, lon };
}

// ============================================================================
// Globo terráqueo 4K + Ciclo Día/Noche + Nubes + Atmósfera + Estrellas
// ============================================================================
function crearGloboTierra(txt, dismap, normalMap, lightsMap, waterMask) {
  const geometry = new THREE.SphereGeometry(RADIO_TIERRA, 240, 120);
  const material = new THREE.MeshPhongMaterial({
    color: 0xdce8f5,
    emissive: 0xffc66d,
    emissiveIntensity: lightsMap ? 1.15 : 0.0,
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

  // Parche shader para que las luces urbanas brillen solo en el hemisferio nocturno
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: tmpSunDir.clone() };
    shader.uniforms.uDayNight = {
      value: ui.toggleDayNight.checked ? 1.0 : 0.0,
    };
    tierraShaderUniforms = shader.uniforms;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vCustomWorldNormal;`
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vCustomWorldNormal = normalize(mat3(modelMatrix) * normal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 uSunDir;
        uniform float uDayNight;
        varying vec3 vCustomWorldNormal;`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float sunDot = dot(normalize(vCustomWorldNormal), normalize(uSunDir));
        float nightMask = mix(0.65, smoothstep(0.18, -0.22, sunDot), uDayNight);
        totalEmissiveRadiance *= nightMask;`
      );
  };

  tierraMesh = new THREE.Mesh(geometry, material);
  scene.add(tierraMesh);
  actualizarModoDiaNoche();
}

function crearCapaNubes(cloudsTex) {
  const geo = new THREE.SphereGeometry(RADIO_NUBES, 96, 48);
  const mat = new THREE.MeshPhongMaterial({
    map: cloudsTex,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    shininess: 4,
  });
  nubesMesh = new THREE.Mesh(geo, mat);
  nubesMesh.visible = ui.toggleClouds.checked;
  scene.add(nubesMesh);
}

function crearAtmosfera() {
  const geo = new THREE.SphereGeometry(RADIO_TIERRA * 1.045, 64, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: tmpSunDir.clone() },
      uDayNight: { value: 1.0 },
    },
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
      uniform vec3 uSunDir;
      uniform float uDayNight;
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;
      void main() {
        float rim = pow(clamp(0.65 - dot(vNormalWorld, vViewDir), 0.0, 1.0), 3.0);
        float daySide = mix(1.0, smoothstep(-0.35, 0.45, dot(vNormalWorld, normalize(uSunDir))) * 0.8 + 0.25, uDayNight);
        gl_FragColor = vec4(0.0, 0.72, 1.0, rim * 0.45 * daySide);
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

function actualizarSol(fechaActual) {
  if (!ui.toggleDayNight.checked) return;

  // Declinación solar aproximada y ángulo horario UTC
  const inicioAnio = Date.UTC(fechaActual.getUTCFullYear(), 0, 0);
  const diaAnio = (fechaActual.getTime() - inicioAnio) / 86400000;
  const declinacion = 23.44 * Math.sin(((2 * Math.PI) / 365) * (diaAnio - 81));
  const utcHoras =
    fechaActual.getUTCHours() +
    fechaActual.getUTCMinutes() / 60 +
    fechaActual.getUTCSeconds() / 3600;
  const solarLon = (12 - utcHoras) * 15;

  latLonToVector3(declinacion, solarLon, 1.0, tmpSunDir).normalize();
  dirLight.position.copy(tmpSunDir).multiplyScalar(12);

  if (tierraShaderUniforms) {
    tierraShaderUniforms.uSunDir.value.copy(tmpSunDir);
  }
  if (olasMesh) {
    olasMesh.material.uniforms.uLightDir.value.copy(tmpSunDir);
  }
  if (atmosferaMesh) {
    atmosferaMesh.material.uniforms.uSunDir.value.copy(tmpSunDir);
  }
}

function actualizarModoDiaNoche() {
  const activo = ui.toggleDayNight.checked;
  if (tierraShaderUniforms) {
    tierraShaderUniforms.uDayNight.value = activo ? 1.0 : 0.0;
  }
  if (atmosferaMesh) {
    atmosferaMesh.material.uniforms.uDayNight.value = activo ? 1.0 : 0.0;
  }
  if (tierraMesh) {
    tierraMesh.material.color.setHex(activo ? 0xdce8f5 : 0x7392b4);
  }
  ambientLight.intensity = activo ? 0.34 : 0.92;
  dirLight.intensity = activo ? 1.95 : 1.35;
}

// Máscara oceánica 720x360 desde water_mask_4k.png (o GEBCO)
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
// CAPA 1: Capa Oceánica Multi-Modo (Corrientes Olas 3D / SST / Altura de Ola)
// ============================================================================
function crearCapaOlas(waterNormalsTex, waterMaskTex) {
  const datosIniciales = new Uint8Array(GRID_W * GRID_H * 4);
  const envInicial = new Uint8Array(GRID_W * GRID_H * 4);
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    datosIniciales[i * 4] = 128;
    datosIniciales[i * 4 + 1] = 128;
    datosIniciales[i * 4 + 2] = 0;
    datosIniciales[i * 4 + 3] = 255;

    envInicial[i * 4] = 40;
    envInicial[i * 4 + 1] = 128;
    envInicial[i * 4 + 2] = 255;
    envInicial[i * 4 + 3] = 255;
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

  texturaAmbiente = new THREE.DataTexture(
    envInicial,
    GRID_W,
    GRID_H,
    THREE.RGBAFormat
  );
  texturaAmbiente.wrapS = THREE.RepeatWrapping;
  texturaAmbiente.wrapT = THREE.ClampToEdgeWrapping;
  texturaAmbiente.minFilter = THREE.LinearFilter;
  texturaAmbiente.magFilter = THREE.LinearFilter;
  texturaAmbiente.needsUpdate = true;

  const geoOlas = new THREE.SphereGeometry(RADIO_OLAS, 240, 120);
  const matOlas = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uOceanMode: { value: 0 }, // 0: Corrientes, 1: SST, 2: Oleaje
      uCurrentTex: { value: texturaCorrientes },
      uEnvTex: { value: texturaAmbiente },
      uWaterNormals: { value: waterNormalsTex || null },
      uWaterMask: { value: waterMaskTex || null },
      uHasMask: { value: waterMaskTex && waterMaskTex.image ? 1.0 : 0.0 },
      uLightDir: { value: tmpSunDir.clone() },
    },
    vertexShader: `
      uniform float uTime;
      uniform int uOceanMode;
      uniform sampler2D uCurrentTex;
      uniform sampler2D uEnvTex;
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
        vec4 env = texture2D(uEnvTex, uv);
        vec2 flow = (cur.rg - 0.5) * 2.0;
        float speed = cur.b;
        float waveH = env.r;

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

        float factorAltura = (uOceanMode == 2) ? (0.004 + waveH * 0.018) : (0.0035 + speed * 0.011);
        vec3 displaced = position + normal * (wave * factorAltura * oceanMask);

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
      uniform int uOceanMode;
      uniform sampler2D uCurrentTex;
      uniform sampler2D uEnvTex;
      uniform sampler2D uWaterNormals;
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

      vec3 sampleTriplanarWater(vec3 p, vec3 n, float scale) {
        vec3 w = pow(abs(n), vec3(4.0));
        w /= (w.x + w.y + w.z + 1e-5);
        vec3 nXY = texture2D(uWaterNormals, p.xy * scale).xyz * 2.0 - 1.0;
        vec3 nYZ = texture2D(uWaterNormals, p.yz * scale).xyz * 2.0 - 1.0;
        vec3 nXZ = texture2D(uWaterNormals, p.xz * scale).xyz * 2.0 - 1.0;
        return normalize(nXY * w.z + nYZ * w.x + nXZ * w.y);
      }

      vec3 paletaSST(float t) {
        // Azul polar -> cian -> verde -> amarillo -> naranja -> rojo tropical
        vec3 c0 = vec3(0.08, 0.24, 0.72);
        vec3 c1 = vec3(0.02, 0.72, 0.85);
        vec3 c2 = vec3(0.14, 0.78, 0.38);
        vec3 c3 = vec3(0.95, 0.78, 0.12);
        vec3 c4 = vec3(0.94, 0.22, 0.18);
        if (t < 0.25) return mix(c0, c1, t / 0.25);
        if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
        if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
        return mix(c3, c4, (t - 0.75) / 0.25);
      }

      vec3 paletaOleaje(float t) {
        vec3 c0 = vec3(0.04, 0.12, 0.26);
        vec3 c1 = vec3(0.06, 0.62, 0.92);
        vec3 c2 = vec3(0.55, 0.36, 0.96);
        vec3 c3 = vec3(0.96, 0.26, 0.42);
        vec3 c4 = vec3(0.98, 0.98, 1.0);
        if (t < 0.30) return mix(c0, c1, t / 0.30);
        if (t < 0.58) return mix(c1, c2, (t - 0.30) / 0.28);
        if (t < 0.82) return mix(c2, c3, (t - 0.58) / 0.24);
        return mix(c3, c4, (t - 0.82) / 0.18);
      }

      void main() {
        float oceanMask = uHasMask > 0.5
          ? smoothstep(0.25, 0.75, texture2D(uWaterMask, vUv).r)
          : 1.0;
        if (oceanMask < 0.02) discard;

        vec3 n = normalize(vSphereDir);
        vec4 cur = texture2D(uCurrentTex, vUv);
        vec4 env = texture2D(uEnvTex, vUv);
        vec2 flow = (cur.rg - 0.5) * 2.0;
        float speed = cur.b;
        float waveNorm = env.r; // 0..1 -> 0..6m
        float sstNorm = env.g;  // 0..1 -> -2..34C

        vec3 east = getEast(n);
        vec3 north = normalize(cross(n, east));
        vec3 flow3D = east * flow.x + north * flow.y;

        float cycle = uTime * (0.16 + speed * 0.24);
        float ph0 = fract(cycle);
        float ph1 = fract(cycle + 0.5);
        float blend = abs(2.0 * ph0 - 1.0);

        float advect = 0.045 * (0.35 + speed);
        vec3 p0 = normalize(n - flow3D * ph0 * advect);
        vec3 p1 = normalize(n - flow3D * ph1 * advect);

        vec3 wnMacro0 = sampleTriplanarWater(p0 + vec3(uTime * 0.002), n, 18.0);
        vec3 wnMacro1 = sampleTriplanarWater(p1 + vec3(uTime * 0.002), n, 18.0);
        vec3 wnMacro = normalize(mix(wnMacro0, wnMacro1, blend));

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

        vec3 eastW = normalize(vEastWorld);
        vec3 northW = normalize(vNorthWorld);
        vec3 waveNormal = normalize(
          vNormalWorld + (eastW * tangentN.x + northW * tangentN.y) * (0.50 + speed * 0.55)
        );

        float pendiente = length(tangentN.xy);
        float cresta = smoothstep(0.22, 0.74, pendiente * 0.9 + max(vWaveHeight, 0.0) * 0.35);

        float diff = max(dot(waveNormal, normalize(uLightDir)), 0.24);
        vec3 halfVec = normalize(normalize(uLightDir) + vViewDir);
        float spec = pow(max(dot(waveNormal, halfVec), 0.0), 54.0);
        float fresnel = pow(1.0 - max(dot(waveNormal, vViewDir), 0.0), 3.0);

        vec3 color;
        float alpha;

        if (uOceanMode == 1) {
          // Modo Temperatura Superficial del Mar (SST)
          vec3 sstColor = paletaSST(clamp(sstNorm, 0.0, 1.0));
          color = sstColor * (0.62 + 0.45 * diff) + vec3(0.45, 0.75, 0.9) * (spec * 0.4 + fresnel * 0.14);
          alpha = oceanMask * (0.52 + cresta * 0.18 + spec * 0.2);
        } else if (uOceanMode == 2) {
          // Modo Altura de Oleaje (m)
          vec3 whColor = paletaOleaje(clamp(waveNorm, 0.0, 1.0));
          color = mix(whColor, vec3(0.95, 0.99, 1.0), pow(cresta, 2.5) * waveNorm * 0.65);
          color *= (0.65 + 0.45 * diff);
          color += vec3(0.6, 0.85, 1.0) * (spec * 0.55 + fresnel * 0.16);
          alpha = oceanMask * (0.42 + waveNorm * 0.30 + cresta * 0.16);
        } else {
          // Modo Corrientes Oceánicas (Olas 3D)
          float intensidadCorriente = smoothstep(0.04, 0.75, speed);
          vec3 colorMarProfundo = vec3(0.01, 0.08, 0.19);
          vec3 colorCorriente = vec3(0.0, 0.74, 0.99);
          vec3 colorEspuma = vec3(0.75, 0.96, 1.0);

          color = mix(colorMarProfundo, colorCorriente, cresta * (0.35 + 0.65 * intensidadCorriente));
          color *= (0.72 + 0.42 * diff);
          color = mix(color, colorEspuma, pow(cresta, 2.4) * (0.20 + 0.60 * intensidadCorriente));
          color += vec3(0.42, 0.88, 1.0) * (spec * 0.65 + fresnel * 0.22);
          alpha = oceanMask * (0.20 + cresta * 0.38 + spec * 0.25 + intensidadCorriente * 0.08);
        }

        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.84));
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
    actualizarEstado("Datos oceánicos cargados desde src/corrientes.csv");
  } catch (err) {
    console.warn("Usando campo vectorial procedural de respaldo:", err.message);
    const celdas = generarCorrientesProcedurales();
    aplicarCampoCorrientes(celdas, "Procedural", "badge fallback");
    actualizarEstado("Usando modelo procedural oceánico");
  }
}

function estimarAmbientePorLatitud(lat, u, v) {
  const speed = Math.hypot(u, v);
  const sst = THREE.MathUtils.clamp(
    28.5 * Math.cos((lat * Math.PI) / 145) ** 1.4 - 1.2,
    -1.8,
    30.5
  );
  const waveHeight = THREE.MathUtils.clamp(
    0.6 + speed * 1.4 + (Math.abs(lat) > 38 ? 1.8 : 0.3),
    0.3,
    5.5
  );
  return { waveHeight, sst };
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
  const idxWh = encabezados.indexOf("wave_height");
  const idxSst = encabezados.indexOf("sst");
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
      const est = estimarAmbientePorLatitud(lat, u, v);
      const wh = idxWh !== -1 ? parseFloat(cols[idxWh]) : NaN;
      const sst = idxSst !== -1 ? parseFloat(cols[idxSst]) : NaN;
      celdas.push({
        lat,
        lon,
        u,
        v,
        waveHeight: Number.isFinite(wh) ? wh : est.waveHeight,
        sst: Number.isFinite(sst) ? sst : est.sst,
      });
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

      const est = estimarAmbientePorLatitud(lat, u, v);
      celdas.push({
        lat,
        lon,
        u: Number(u.toFixed(4)),
        v: Number(v.toFixed(4)),
        waveHeight: Number(est.waveHeight.toFixed(2)),
        sst: Number(est.sst.toFixed(2)),
      });
    }
  }
  return celdas;
}

function getCeldaCorriente(lat, lon) {
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
  const est = estimarAmbientePorLatitud(lat, 0.08, 0);
  return { u: 0.08, v: 0, waveHeight: est.waveHeight, sst: est.sst };
}

function interpolarDatosSuaves(lat, lon) {
  const latIdx = (lat + 65) / PASO_REJILLA;
  const lonIdx = (lon + 175) / PASO_REJILLA;

  const lat0 = Math.floor(latIdx) * PASO_REJILLA - 65;
  const lat1 = lat0 + PASO_REJILLA;
  const lon0 = Math.floor(lonIdx) * PASO_REJILLA - 175;
  const lon1 = lon0 + PASO_REJILLA;

  const tx = THREE.MathUtils.clamp(lonIdx - Math.floor(lonIdx), 0, 1);
  const ty = THREE.MathUtils.clamp(latIdx - Math.floor(latIdx), 0, 1);
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const c00 = getCeldaCorriente(lat0, lon0);
  const c10 = getCeldaCorriente(lat0, lon1 > 175 ? -175 : lon1);
  const c01 = getCeldaCorriente(lat1, lon0);
  const c11 = getCeldaCorriente(lat1, lon1 > 175 ? -175 : lon1);

  const lerpBilin = (prop) => {
    const a = THREE.MathUtils.lerp(c00[prop], c10[prop], sx);
    const b = THREE.MathUtils.lerp(c01[prop], c11[prop], sx);
    return THREE.MathUtils.lerp(a, b, sy);
  };

  return {
    u: lerpBilin("u"),
    v: lerpBilin("v"),
    waveHeight: lerpBilin("waveHeight"),
    sst: lerpBilin("sst"),
  };
}

function aplicarCampoCorrientes(celdas, etiquetaBadge, claseBadge) {
  celdasCorrientes = celdas;
  rejillaCorrientes.clear();

  for (const c of celdas) {
    const keyLat = Math.round(c.lat / PASO_REJILLA) * PASO_REJILLA;
    const keyLon = Math.round(c.lon / PASO_REJILLA) * PASO_REJILLA;
    rejillaCorrientes.set(`${keyLat},${keyLon}`, {
      u: c.u,
      v: c.v,
      waveHeight: c.waveHeight ?? 1.0,
      sst: c.sst ?? 16.0,
    });
  }

  if (texturaCorrientes && texturaAmbiente) {
    const dataCur = texturaCorrientes.image.data;
    const dataEnv = texturaAmbiente.image.data;

    for (let row = 0; row < GRID_H; row++) {
      const lat = Map2Range(row + 0.5, 0, GRID_H, -90, 90);
      for (let col = 0; col < GRID_W; col++) {
        const lon = Map2Range(col + 0.5, 0, GRID_W, -180, 180);
        const vec = interpolarDatosSuaves(lat, lon);
        const speed = Math.hypot(vec.u, vec.v);

        const idx = (row * GRID_W + col) * 4;
        dataCur[idx] = Math.round(
          THREE.MathUtils.clamp((vec.u / 1.5) * 0.5 + 0.5, 0, 1) * 255
        );
        dataCur[idx + 1] = Math.round(
          THREE.MathUtils.clamp((vec.v / 1.5) * 0.5 + 0.5, 0, 1) * 255
        );
        dataCur[idx + 2] = Math.round(
          THREE.MathUtils.clamp(speed / 1.1, 0, 1) * 255
        );
        dataCur[idx + 3] = 255;

        dataEnv[idx] = Math.round(
          THREE.MathUtils.clamp(vec.waveHeight / 5.5, 0, 1) * 255
        );
        dataEnv[idx + 1] = Math.round(
          THREE.MathUtils.clamp((vec.sst + 2.0) / 34.0, 0, 1) * 255
        );
        dataEnv[idx + 2] = 255;
        dataEnv[idx + 3] = 255;
      }
    }
    texturaCorrientes.needsUpdate = true;
    texturaAmbiente.needsUpdate = true;
  }

  ui.currentCells.textContent = celdas.length.toLocaleString("es-ES");
  ui.dataBadge.textContent = etiquetaBadge;
  ui.dataBadge.className = claseBadge;
}

// ============================================================================
// Geometría 3D y Textura Procedural para los Barcos
// ============================================================================
function crearTexturasBarco() {
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

  // Casco lateral
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, 128, 92);
  ctx.fillStyle = "#b91c1c";
  ctx.fillRect(0, 92, 128, 36);
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(0, 0, 128, 12);
  ectx.fillStyle = "#fbbf24";
  for (let x = 16; x < 116; x += 18) {
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(x, 36, 6, 5);
    ectx.fillRect(x, 36, 6, 5);
  }

  // Cubierta + contenedores
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

  // Puente blanco con ventanas
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 128, 128, 128);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(10, 146, 108, 22);
  ctx.fillRect(10, 184, 108, 16);
  ctx.fillStyle = "#fde047";
  ctx.fillRect(14, 150, 100, 14);
  ectx.fillStyle = "#fef08a";
  ectx.fillRect(14, 150, 100, 14);
  ectx.fillRect(16, 187, 96, 10);

  // Cubierta de proa + luces de navegación
  ctx.fillStyle = "#475569";
  ctx.fillRect(128, 128, 128, 128);
  ctx.fillStyle = "#ff6600";
  ctx.fillRect(148, 140, 88, 14);
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

function crearGeometriaBarco() {
  const positions = [];
  const uvs = [];

  function tri(a, b, c, uva, uvb, uvc) {
    positions.push(...a, ...b, ...c);
    uvs.push(...uva, ...uvb, ...uvc);
  }

  function quad(p0, p1, p2, p3, u0, v0, u1, v1) {
    tri(p0, p1, p2, [u0, v0], [u1, v0], [u1, v1]);
    tri(p0, p2, p3, [u0, v0], [u1, v1], [u0, v1]);
  }

  const w = 0.24;
  const h = 0.26;
  const zPopa = -0.65;
  const zHombro = 0.28;
  const zProa = 0.78;

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

  quad(pBL, mBL, mTL, pTL, 0.0, 0.5, 0.48, 1.0);
  quad(mBR, pBR, pTR, mTR, 0.0, 0.5, 0.48, 1.0);
  quad(pBR, pBL, pTL, pTR, 0.0, 0.5, 0.48, 1.0);

  quad(mBL, bowB, bowT, mTL, 0.0, 0.5, 0.48, 1.0);
  quad(bowB, mBR, mTR, bowT, 0.0, 0.5, 0.48, 1.0);

  tri(mTL, bowT, mTR, [0.5, 0.0], [0.75, 0.48], [1.0, 0.0]);
  quad(pTL, mTL, mTR, pTR, 0.52, 0.52, 0.98, 0.98);

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

  quad(ct00, ct01, ct11, ct10, 0.52, 0.52, 0.98, 0.98);
  quad(c00, c01, ct01, ct00, 0.52, 0.52, 0.98, 0.98);
  quad(c11, c10, ct10, ct11, 0.52, 0.52, 0.98, 0.98);
  quad(c01, c11, ct11, ct01, 0.52, 0.52, 0.98, 0.98);
  quad(c10, c00, ct00, ct10, 0.52, 0.52, 0.98, 0.98);

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

  quad(b01, b11, bt11, bt01, 0.02, 0.02, 0.48, 0.48);
  quad(b10, b00, bt00, bt10, 0.02, 0.02, 0.48, 0.48);
  quad(b00, b01, bt01, bt00, 0.02, 0.02, 0.48, 0.48);
  quad(b11, b10, bt10, bt11, 0.02, 0.02, 0.48, 0.48);
  quad(bt00, bt01, bt11, bt10, 0.02, 0.02, 0.48, 0.48);

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
    rutasOriginales = rutas;
    construirCapaTrafico(filtrarRutasActivas());
  } catch (err) {
    console.warn("Usando rutas marítimas de respaldo:", err.message);
    rutasOriginales = obtenerRutasRespaldo();
    construirCapaTrafico(filtrarRutasActivas());
  }
}

function filtrarRutasActivas() {
  const filtro = ui.trafficFilter.value;
  if (filtro === "ais") return [];
  if (filtro === "major") {
    return rutasOriginales.filter((r) => (r.tipo || "major") === "major");
  }
  return rutasOriginales;
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

function muestrearArcoEsferico(rutas) {
  return rutas.map((r) => {
    const puntosEsfera = [];
    const wps = r.waypoints;

    for (let i = 0; i < wps.length - 1; i++) {
      const pA = latLonToVector3(wps[i].lat, wps[i].lon, 1.0);
      const pB = latLonToVector3(wps[i + 1].lat, wps[i + 1].lon, 1.0);
      const ang = pA.angleTo(pB);
      const pasos = Math.max(1, Math.ceil(ang / 0.05));

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
    lineasRutas = null;
  }
  if (mallaBarcos) {
    scene.remove(mallaBarcos);
    mallaBarcos = null;
  }

  if (rutas.length === 0) {
    rutasProcesadas = [];
    flotaBarcos = [];
    actualizarContadorBarcos();
    return;
  }

  rutasProcesadas = muestrearArcoEsferico(rutas);

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
        escala: 0.02 + Math.random() * 0.01,
        desvioLateral: sentido * 0.008 + (Math.random() - 0.5) * 0.012,
        nudosSim: (12 + Math.random() * 9).toFixed(1),
      });
    }
  }

  mallaBarcos = new THREE.InstancedMesh(
    geoBarcoCompartida,
    matBarcoCompartido,
    flotaBarcos.length
  );
  mallaBarcos.frustumCulled = false;
  mallaBarcos.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0, 0),
    RADIO_BARCOS + 0.5
  );
  mallaBarcos.visible = ui.toggleTraffic.checked;
  scene.add(mallaBarcos);

  actualizarContadorBarcos();
}

function orientarBarcoEnEsfera(posNorm, forwardDir, escala, desvioLateral = 0) {
  tmpUp.copy(posNorm).normalize();
  tmpForward.copy(forwardDir);
  tmpForward.addScaledVector(tmpUp, -tmpForward.dot(tmpUp));
  if (tmpForward.lengthSq() < 1e-8) {
    tmpForward.set(0, 0, 1);
  } else {
    tmpForward.normalize();
  }

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
  const iMmsi = enc.indexOf("mmsi");
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
    const mmsi = iMmsi !== -1 ? c[iMmsi].trim() : `AIS_${i}`;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    barcos.push({
      mmsi,
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
  mallaAIS.frustumCulled = false;
  mallaAIS.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0, 0),
    RADIO_BARCOS + 0.5
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
// Raycasting: Sonda Oceanográfica + Inspección y Seguimiento de Buques
// ============================================================================
function configurarEventosInteraccion() {
  const dom = renderer.domElement;

  dom.addEventListener("pointerdown", (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  dom.addEventListener("pointermove", (e) => {
    actualizarNDC(e);
    actualizarSondaOceanografica();
  });

  dom.addEventListener("pointerup", (e) => {
    const dist = Math.hypot(
      e.clientX - pointerDownPos.x,
      e.clientY - pointerDownPos.y
    );
    if (dist < 5) {
      actualizarNDC(e);
      intentarSeleccionarBarco();
    }
  });
}

function actualizarNDC(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function formatearCoord(lat, lon) {
  const latStr = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "W"}`;
  return `${latStr}, ${lonStr}`;
}

function actualizarSondaOceanografica() {
  raycaster.setFromCamera(pointerNDC, camera);
  const hit = raycaster.ray.intersectSphere(esferaMatematica, tmpHit);
  if (!hit) {
    ui.oceanProbe.textContent =
      "Pasa el cursor sobre el océano para consultar sonda · Haz clic en un buque para inspeccionar";
    return;
  }

  const { lat, lon } = vector3ToLatLon(hit);
  if (!esOceano(lat, lon)) {
    ui.oceanProbe.textContent = `📍 ${formatearCoord(lat, lon)} · Tierra firme`;
    return;
  }

  const datos = interpolarDatosSuaves(lat, lon);
  const speed = Math.hypot(datos.u, datos.v);
  const nudos = speed * 1.94384;
  const rumbo = ((Math.atan2(datos.u, datos.v) * 180) / Math.PI + 360) % 360;

  ui.oceanProbe.textContent = `📍 ${formatearCoord(
    lat,
    lon
  )} · Corriente: ${speed.toFixed(2)} m/s (${nudos.toFixed(
    1
  )} kn) → ${Math.round(rumbo)}° · Ola: ${datos.waveHeight.toFixed(
    1
  )} m · SST: ${datos.sst.toFixed(1)} °C`;
}

function intentarSeleccionarBarco() {
  if (!ui.toggleTraffic.checked) return;

  raycaster.setFromCamera(pointerNDC, camera);
  const targets = [];
  if (mallaAIS && mallaAIS.visible) targets.push(mallaAIS);
  if (mallaBarcos && mallaBarcos.visible) targets.push(mallaBarcos);
  if (targets.length === 0) return;

  const hits = raycaster.intersectObjects(targets, false);
  let seleccionado = null;

  if (hits.length > 0 && hits[0].instanceId !== undefined) {
    seleccionado = {
      tipo: hits[0].object === mallaAIS ? "ais" : "corredor",
      index: hits[0].instanceId,
    };
  } else {
    // Respaldo de tolerancia de clic: busca el barco más cercano al punto clicado en el globo
    const hitEsfera = raycaster.ray.intersectSphere(esferaMatematica, tmpHit);
    if (hitEsfera) {
      let mejorDist = 0.08;
      const matTemp = new THREE.Matrix4();
      const posTemp = new THREE.Vector3();

      if (mallaAIS && mallaAIS.visible) {
        for (let i = 0; i < barcosAIS.length; i++) {
          mallaAIS.getMatrixAt(i, matTemp);
          posTemp.setFromMatrixPosition(matTemp);
          const d = posTemp.distanceTo(hitEsfera);
          if (d < mejorDist) {
            mejorDist = d;
            seleccionado = { tipo: "ais", index: i };
          }
        }
      }
      if (mallaBarcos && mallaBarcos.visible) {
        for (let i = 0; i < flotaBarcos.length; i++) {
          mallaBarcos.getMatrixAt(i, matTemp);
          posTemp.setFromMatrixPosition(matTemp);
          const d = posTemp.distanceTo(hitEsfera);
          if (d < mejorDist) {
            mejorDist = d;
            seleccionado = { tipo: "corredor", index: i };
          }
        }
      }
    }
  }

  if (!seleccionado) return;

  barcoSeleccionado = seleccionado;
  if (seleccionado.tipo === "ais") {
    consultarMetadatosAIS(barcosAIS[seleccionado.index].mmsi);
  }

  siguiendoBarco = false;
  actualizarBotonSeguir();
  ui.shipInspector.classList.remove("hidden");
  actualizarInspectorBarco();
}

async function consultarMetadatosAIS(mmsi) {
  if (!mmsi || cacheMetadatosAIS.has(mmsi)) return;
  cacheMetadatosAIS.set(mmsi, { cargando: true });
  try {
    const resp = await fetch(
      `https://meri.digitraffic.fi/api/ais/v1/vessels/${mmsi}`,
      { headers: { Accept: "application/json" } }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const info = await resp.json();
    cacheMetadatosAIS.set(mmsi, info);
    actualizarInspectorBarco();
  } catch {
    cacheMetadatosAIS.set(mmsi, { error: true });
  }
}

function obtenerEstadoBarcoSeleccionado() {
  if (!barcoSeleccionado) return null;

  if (barcoSeleccionado.tipo === "ais") {
    const b = barcosAIS[barcoSeleccionado.index];
    if (!b) return null;
    latLonToVector3(b.lat, b.lon, RADIO_BARCOS, tmpFollowPos);
    const meta = cacheMetadatosAIS.get(b.mmsi);
    const rad = (b.cog * Math.PI) / 180;
    return {
      titulo: meta?.name ? meta.name : `AIS ${b.mmsi}`,
      pos: tmpFollowPos.clone(),
      lat: b.lat,
      lon: b.lon,
      velNudos: b.sog.toFixed(1),
      rumboDeg: Math.round(b.cog),
      vecE: Math.sin(rad),
      vecN: Math.cos(rad),
      detalleA: ["MMSI", b.mmsi],
      detalleB: ["Destino", meta?.destination || "Tiempo real (Báltico)"],
    };
  }

  const barco = flotaBarcos[barcoSeleccionado.index];
  if (!barco) return null;
  const ruta = rutasProcesadas[barco.rutaIdx];
  if (!ruta) return null;

  const pts = ruta.puntosEsfera;
  const totalTramos = pts.length - 1;
  const progreso = barco.fase * totalTramos;
  const tramoIdx = Math.min(totalTramos - 1, Math.floor(progreso));
  const tLocal = progreso - tramoIdx;

  const p0 = pts[tramoIdx];
  const p1 = pts[tramoIdx + 1];
  const posNorm = new THREE.Vector3().lerpVectors(p0, p1, tLocal).normalize();
  const dir3D =
    barco.sentido > 0
      ? new THREE.Vector3().subVectors(p1, p0)
      : new THREE.Vector3().subVectors(p0, p1);
  dir3D.addScaledVector(posNorm, -dir3D.dot(posNorm)).normalize();

  const { lat, lon } = vector3ToLatLon(posNorm);
  const east = new THREE.Vector3(posNorm.z, 0, -posNorm.x).normalize();
  const north = new THREE.Vector3().crossVectors(posNorm, east).normalize();
  const vecE = dir3D.dot(east);
  const vecN = dir3D.dot(north);
  const rumboDeg = Math.round(((Math.atan2(vecE, vecN) * 180) / Math.PI + 360) % 360);

  return {
    titulo: `BUQUE ${ruta.id}`,
    pos: posNorm.clone().multiplyScalar(RADIO_BARCOS),
    lat,
    lon,
    velNudos: barco.nudosSim,
    rumboDeg,
    vecE,
    vecN,
    detalleA: ["Corredor", `${ruta.tipo.toUpperCase()} (${barco.sentido > 0 ? "Ida" : "Vuelta"})`],
    detalleB: ["Red", "Shipping Lanes v1"],
  };
}

function actualizarInspectorBarco() {
  if (!barcoSeleccionado || ui.shipInspector.classList.contains("hidden")) return;
  const info = obtenerEstadoBarcoSeleccionado();
  if (!info) return;

  const cur = interpolarDatosSuaves(info.lat, info.lon);
  const dotFlow = info.vecE * cur.u + info.vecN * cur.v;
  const aFavor = dotFlow >= 0;

  ui.inspTitle.textContent = info.titulo;
  ui.inspBody.innerHTML = `
    <div class="insp-row"><span class="insp-k">${info.detalleA[0]}</span><span class="insp-v">${info.detalleA[1]}</span></div>
    <div class="insp-row"><span class="insp-k">${info.detalleB[0]}</span><span class="insp-v">${info.detalleB[1]}</span></div>
    <div class="insp-row"><span class="insp-k">Posición</span><span class="insp-v">${formatearCoord(info.lat, info.lon)}</span></div>
    <div class="insp-row"><span class="insp-k">Velocidad / Rumbo</span><span class="insp-v">${info.velNudos} kn · ${info.rumboDeg}°</span></div>
    <div class="insp-row"><span class="insp-k">Corriente local</span><span class="insp-v ${aFavor ? "insp-tag-pro" : "insp-tag-contra"}">${aFavor ? "▲ A favor" : "▼ En contra"}</span></div>
  `;
}

function actualizarBotonSeguir() {
  ui.btnFollowShip.classList.toggle("following", siguiendoBarco);
  ui.btnFollowShip.textContent = siguiendoBarco
    ? "⏹ Dejar de seguir"
    : "🎥 Seguir buque";
}

// ============================================================================
// Vuelo suave de cámara a Presets y Seguimiento
// ============================================================================
function volarAPreset(nombre) {
  const preset = PRESETS_CAMARA[nombre];
  if (!preset) return;

  siguiendoBarco = false;
  actualizarBotonSeguir();

  ui.presetButtons.forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.preset === nombre)
  );

  const endPos = latLonToVector3(preset.lat, preset.lon, preset.dist);
  vueloCamara = {
    startPos: camera.position.clone(),
    endPos,
    startTarget: camcontrols.target.clone(),
    endTarget: new THREE.Vector3(0, 0, 0),
    progress: 0,
  };
}

function actualizarVueloCamara(dt) {
  if (!vueloCamara) return;
  vueloCamara.progress = Math.min(1, vueloCamara.progress + dt * 1.45);
  const t = vueloCamara.progress;
  const ease = t * t * (3 - 2 * t);

  // Interpolamos en dirección esférica para que la cámara rodee el globo sin atravesarlo
  const lenStart = vueloCamara.startPos.length();
  const lenEnd = vueloCamara.endPos.length();
  const dirStart = vueloCamara.startPos.clone().normalize();
  const dirEnd = vueloCamara.endPos.clone().normalize();

  const interpDir = dirStart.lerp(dirEnd, ease).normalize();
  const interpDist = THREE.MathUtils.lerp(lenStart, lenEnd, ease);
  camera.position.copy(interpDir).multiplyScalar(interpDist);
  camcontrols.target.lerpVectors(
    vueloCamara.startTarget,
    vueloCamara.endTarget,
    ease
  );

  if (t >= 1) vueloCamara = null;
}

function actualizarSeguimientoBarco() {
  if (!siguiendoBarco || !barcoSeleccionado) return;
  const info = obtenerEstadoBarcoSeleccionado();
  if (!info) return;

  tmpFollowDelta.subVectors(info.pos, camcontrols.target);
  camcontrols.target.copy(info.pos);
  camera.position.add(tmpFollowDelta);
}

// ============================================================================
// Retrieve en vivo: Open-Meteo (corrientes + SST + oleaje) + Digitraffic AIS
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
              mmsi: String(f.mmsi ?? ""),
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
      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&current=ocean_current_velocity,ocean_current_direction,wave_height,sea_surface_temperature`;

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
          const lat = batch[idx].lat;
          const u = Number((velMs * Math.sin(rad)).toFixed(4));
          const v = Number((velMs * Math.cos(rad)).toFixed(4));
          const est = estimarAmbientePorLatitud(lat, u, v);

          nuevasCeldas.push({
            lat,
            lon: batch[idx].lon,
            u,
            v,
            waveHeight:
              cur.wave_height !== null ? Number(cur.wave_height) : est.waveHeight,
            sst:
              cur.sea_surface_temperature !== null
                ? Number(cur.sea_surface_temperature)
                : est.sst,
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
          : `Datos actualizados (${hora})`
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
  const lineas = ["lat;lon;u;v;wave_height;sst"];
  for (const c of celdasCorrientes) {
    lineas.push(`${c.lat};${c.lon};${c.u};${c.v};${c.waveHeight};${c.sst}`);
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
function actualizarEscalaLeyenda(mode) {
  ui.scaleBar.className = "scale-gradient";
  if (mode === 1) {
    ui.scaleBar.classList.add("mode-sst");
    ui.scaleMin.textContent = "-2 °C";
    ui.scaleMax.textContent = "32 °C";
  } else if (mode === 2) {
    ui.scaleBar.classList.add("mode-waves");
    ui.scaleMin.textContent = "0.0 m";
    ui.scaleMax.textContent = "5.5+ m";
  } else {
    ui.scaleBar.classList.add("mode-currents");
    ui.scaleMin.textContent = "0.0 m/s";
    ui.scaleMax.textContent = "1.2+ m/s";
  }
}

function toggleHUD(ocultar) {
  ui.hud.classList.toggle("hidden", ocultar);
  ui.btnShowHud.classList.toggle("hidden", !ocultar);
}

function configurarEventosUI() {
  ui.oceanMode.addEventListener("change", (e) => {
    const mode = parseInt(e.target.value, 10);
    if (olasMesh) olasMesh.material.uniforms.uOceanMode.value = mode;
    actualizarEscalaLeyenda(mode);
  });

  ui.trafficFilter.addEventListener("change", () => {
    barcoSeleccionado = null;
    siguiendoBarco = false;
    ui.shipInspector.classList.add("hidden");
    construirCapaTrafico(filtrarRutasActivas());
    if (mallaAIS) {
      mallaAIS.visible = ui.toggleTraffic.checked;
    }
    actualizarContadorBarcos();
  });

  ui.toggleCurrents.addEventListener("change", (e) => {
    if (olasMesh) olasMesh.visible = e.target.checked;
  });

  ui.toggleTraffic.addEventListener("change", (e) => {
    if (lineasRutas) lineasRutas.visible = e.target.checked;
    if (mallaBarcos) mallaBarcos.visible = e.target.checked;
    if (mallaAIS) mallaAIS.visible = e.target.checked;
    actualizarContadorBarcos();
  });

  ui.toggleClouds.addEventListener("change", (e) => {
    if (nubesMesh) nubesMesh.visible = e.target.checked;
  });

  ui.toggleDayNight.addEventListener("change", () => {
    actualizarModoDiaNoche();
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

  ui.presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => volarAPreset(btn.dataset.preset));
  });

  ui.btnCloseInspector.addEventListener("click", () => {
    siguiendoBarco = false;
    barcoSeleccionado = null;
    ui.shipInspector.classList.add("hidden");
    actualizarBotonSeguir();
  });

  ui.btnFollowShip.addEventListener("click", () => {
    if (!barcoSeleccionado) return;
    siguiendoBarco = !siguiendoBarco;
    actualizarBotonSeguir();
    if (siguiendoBarco) {
      const info = obtenerEstadoBarcoSeleccionado();
      if (info) {
        const dir = info.pos.clone().normalize();
        camera.position.copy(dir).multiplyScalar(RADIO_TIERRA + 0.55);
        camcontrols.target.copy(info.pos);
      }
    } else {
      vueloCamara = {
        startPos: camera.position.clone(),
        endPos: camera.position.clone(),
        startTarget: camcontrols.target.clone(),
        endTarget: new THREE.Vector3(0, 0, 0),
        progress: 0,
      };
    }
  });

  ui.btnHideHud.addEventListener("click", () => toggleHUD(true));
  ui.btnShowHud.addEventListener("click", () => toggleHUD(false));

  ui.btnFullscreen.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "h" && e.target.tagName !== "INPUT") {
      toggleHUD(!ui.hud.classList.contains("hidden"));
    }
  });
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
    timeZone: "UTC",
  }) + " UTC";
  return fechaActual;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const fechaActual = actualizarRelojHUD(dt);
  actualizarSol(fechaActual);

  if (olasMesh && olasMesh.visible) {
    olasMesh.material.uniforms.uTime.value += dt * velocidadSim;
  }
  if (nubesMesh && nubesMesh.visible) {
    nubesMesh.rotation.y += dt * 0.006 * velocidadSim;
  }

  actualizarBarcos(dt);
  actualizarBarcosAIS(dt);
  actualizarVueloCamara(dt);
  actualizarSeguimientoBarco();
  actualizarInspectorBarco();

  camcontrols.update();
  renderer.render(scene, camera);
}
