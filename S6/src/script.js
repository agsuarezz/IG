import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

let scene, camera, renderer;
let grid;
let star;
let info;

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
    info.innerHTML = "three.js - sol y planetas";
    document.body.appendChild(info);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    camera.position.set(0, 0, 10);

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    let camControls = new OrbitControls(camera, renderer.domElement);

    grid = new THREE.GridHelper(20, 40);
    grid.geometry.rotateX(Math.PI / 2);
    grid.position.set(0, 0, 0.05);
    scene.add(grid);

    createStar(1.8, 0xffff00);
}

function createStar(radius, color) {
    let geometry = new THREE.SphereGeometry(radius, 10, 10);
    let material = new THREE.MeshBasicMaterial( {color: color});
    star = new THREE.Mesh(geometry, material);
    scene.add(star);
}

function render() {
    requestAnimationFrame(render);
    renderer.render(scene, camera);
}

init();
render();