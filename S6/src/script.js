import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

let scene, camera, renderer;
let grid, plano;
let star;
let info;
let raycaster;
let planets = [];
let t0 = Date.now();
let accglobal = 0.001;
let MAX_PLANETS = 3;
let NUM_PLANETS = 0;

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

    let geometryP = new THREE.PlaneGeometry(20, 20);
    let materialP = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
    });
    plano = new THREE.Mesh(geometryP, materialP);
    plano.visible = false;
    scene.add(plano);

    raycaster = new THREE.Raycaster();
    

    createStar(1.8, 0xffff00);

    document.addEventListener("mousedown", onDocumentMouseDown);
}

function createStar(radius, color) {
    let geometry = new THREE.SphereGeometry(radius, 10, 10);
    let material = new THREE.MeshBasicMaterial( {color: color});
    star = new THREE.Mesh(geometry, material);
    scene.add(star);
}

function render() {
    requestAnimationFrame(render);

    let now = Date.now();

    for (let planet of planets) {
        let timeSpawn = (now - planet.userData.creation) * accglobal;
        let angle = planet.userData.initialAngle + (timeSpawn * planet.userData.speed);

        planet.position.x = Math.cos(angle) * planet.userData.dist * planet.userData.f1;
        planet.position.y = Math.sin(angle) * planet.userData.dist * planet.userData.f2;
    }
    
    renderer.render(scene, camera);
}

function onDocumentMouseDown(event) {
    const mouse = {
        x: (event.clientX / renderer.domElement.clientWidth) * 2 - 1,
        y: -(event.clientY / renderer.domElement.clientHeight) * 2 + 1,
    };

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(plano);
    if (intersects.length > 0 && NUM_PLANETS < MAX_PLANETS) {
        const click = intersects[0].point;

        let dist = Math.sqrt(click.x * click.x + click.y * click.y);
        let initialAngle = Math.atan2(click.y, click.x);

        let radio = THREE.MathUtils.randFloat(0.15, 0.45);
        let speed = 1.0;
        let colour = THREE.MathUtils.randInt(0x222222, 0xffffff);
        let f1 = THREE.MathUtils.randFloat(0.8, 1.2);
        let f2 = THREE.MathUtils.randFloat(0.8, 1.2);

        createPlanet(radio, dist, speed, colour, f1, f2, initialAngle);
        NUM_PLANETS++;
    }
}

function createPlanet(radio, dist, speed, colour, f1, f2, angle) {
    let geometry = new THREE.SphereGeometry(radio, 10, 10);
    let material = new THREE.MeshBasicMaterial({color : colour});
    let planet = new THREE.Mesh(geometry, material);

    planet.userData.dist = dist;
    planet.userData.speed = speed;
    planet.userData.f1 = f1;
    planet.userData.f2 = f2;
    planet.userData.initialAngle = angle;
    planet.userData.creation = Date.now();

    planets.push(planet);
    scene.add(planet);

    let curve = new THREE.EllipseCurve(
        0, 0,
        dist * f1, dist * f2
    );

    let points = curve.getPoints(64);
    let orbitGeometry = new THREE.BufferGeometry().setFromPoints(points);
    let orbitMaterial = new THREE.LineBasicMaterial({ 
        color: colour,
        transparent: true, 
        opacity: 1 
    });

    let orbit = new THREE.Line(orbitGeometry, orbitMaterial);
    scene.add(orbit);
}

init();
render();