import * as THREE from "three";

let scene, renderer, camera;
let uniforms;
let objetos = [];
let clock;

init();

async function init() {
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  scene = new THREE.Scene();

  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  uniforms = {
    u_time: {
      value: 0.0,
    },
    u_resolution: {
      value: new THREE.Vector2(),
    },
  };

  // Carga el único archivo del shader (< 512 bytes)
  const fragShader = await fetch("./shader.frag").then((res) => res.text());
  PlaneShader(2, 2, fragShader);

  onWindowResize();
  window.addEventListener("resize", onWindowResize, false);

  animationLoop();
}

// Redimensionado de la ventana
function onWindowResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.u_resolution.value.set(
    renderer.domElement.width,
    renderer.domElement.height
  );
}

// Plano a pantalla completa con ShaderMaterial
function PlaneShader(sx, sy, fragsh) {
  const geometry = new THREE.PlaneGeometry(sx, sy);
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    fragmentShader: fragsh,
    vertexShader: vertexShader(),
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  objetos.push(mesh);
}

// Bucle de visualización
function animationLoop() {
  requestAnimationFrame(animationLoop);

  uniforms.u_time.value += clock.getDelta();

  renderer.render(scene, camera);
}

function vertexShader() {
  return `
    void main() {
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;
}
