import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setupLighting } from './lighting.js';
import { buildEnvironment } from './environment.js';
import { cadState } from '../config/state.js';

export let scene, camera, renderer, controls;
export let activeContainer = null;
// Grupos para letreros de mesa / sobremesa / anaquel fijo
export let printableRoot, baseGroup, accentsGroup, lettersGroup;
// Grupos para el espacio dedicado de rótulos colgantes modulares de anaquel
export let hangingRoot, hangingBracketGroup, hangingChainsGroup, hangingPlatesGroup;
// Solo exhibición (lateral de anaquel donde se atornilla el brazo): nunca se exporta
export let hangingMountGroup;

/**
 * Inicializa el visor 3D Three.js
 */
export function initScene(containerId = 'three-container') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Contenedor #${containerId} no encontrado`);
        return null;
    }
    activeContainer = container;

    // 1. Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    // 2. Cámara (Z-Up coordinada con slicers) con encuadre amplio para cama de 25 cm
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(40, aspect, 1, 3500);
    camera.position.set(0, -320, 270);
    camera.up.set(0, 0, 1);

    // 3. Renderer con sombras y antialiasing
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 4. OrbitControls con amortiguación suave
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 12);
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controls.minDistance = 40;
    controls.maxDistance = 1400;
    controls.update();

    // 5. Grupos de letreros de sobremesa / anaquel (Espacio 1)
    printableRoot = new THREE.Group();
    printableRoot.name = "Letrero_Imprimible_Raiz";

    baseGroup = new THREE.Group();
    baseGroup.name = "Capa_1_Base";

    accentsGroup = new THREE.Group();
    accentsGroup.name = "Capa_3_Acentos";

    lettersGroup = new THREE.Group();
    lettersGroup.name = "Capa_2_Letras";

    printableRoot.add(baseGroup);
    printableRoot.add(accentsGroup);
    printableRoot.add(lettersGroup);
    scene.add(printableRoot);

    // 6. Grupos de rótulos colgantes modulares de anaquel (Espacio 2)
    hangingRoot = new THREE.Group();
    hangingRoot.name = "Rotulo_Colgante_Modular_Raiz";
    hangingRoot.visible = false;

    hangingBracketGroup = new THREE.Group();
    hangingBracketGroup.name = "Soporte_Brazo_Hierro";

    hangingChainsGroup = new THREE.Group();
    hangingChainsGroup.name = "Cadenas_Eslabones";

    hangingPlatesGroup = new THREE.Group();
    hangingPlatesGroup.name = "Placas_Modulares";

    hangingRoot.add(hangingBracketGroup);
    hangingRoot.add(hangingChainsGroup);
    hangingRoot.add(hangingPlatesGroup);
    scene.add(hangingRoot);

    hangingMountGroup = new THREE.Group();
    hangingMountGroup.name = "Exhibicion_Lateral_Anaquel";
    hangingMountGroup.visible = false;
    scene.add(hangingMountGroup);

    // 7. Iluminación y Entorno (Cama 25x25 cm + Estante)
    setupLighting(scene);
    buildEnvironment(scene);

    // 8. Event listeners
    window.addEventListener('resize', onWindowResize);

    // 9. Bucle de animación continuo
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    return { scene, camera, renderer, controls, printableRoot, hangingRoot };
}

/**
 * Cambia la visibilidad entre el espacio de letreros de sobremesa y el rótulo colgante
 */
export function setSceneWorkspace(workspace) {
    cadState.activeWorkspace = workspace;
    const isHanging = workspace === 'hanging';
    if (printableRoot) printableRoot.visible = !isHanging;
    if (hangingRoot) hangingRoot.visible = isHanging;
    if (hangingMountGroup) hangingMountGroup.visible = isHanging;
    // El rótulo colgante se exhibe atornillado a un anaquel: la cama de impresión no aplica ahí
    if (scene) buildEnvironment(scene);
    resetCameraView();
}

/**
 * Ajusta la vista cuando cambia el tamaño de la ventana o panel
 */
export function onWindowResize() {
    const container = activeContainer || document.getElementById('three-container') || document.getElementById('visor-canvas-container');
    if (!container || !renderer || !camera || container.clientWidth === 0) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

/**
 * Re-centra la cámara sobre el objeto activo
 */
export function resetCameraView() {
    if (!camera || !controls) return;
    if (cadState.activeWorkspace === 'hanging') {
        const { center, size } = getActiveModelBounds();
        const dist = Math.max(480, Math.max(size.x, size.z) * 2.3);
        camera.position.set(center.x + dist * 0.28, center.y - dist, center.z + dist * 0.12);
        controls.target.copy(center);
    } else {
        const box = new THREE.Box3().setFromObject(printableRoot);
        const size = new THREE.Vector3();
        if (!box.isEmpty()) box.getSize(size);
        const maxDim = Math.max(size.x, size.y, 220);
        const dist = Math.max(340, maxDim * 1.35);
        camera.position.set(0, -dist * 0.88, dist * 0.72);
        controls.target.set(0, 0, 10);
    }
    controls.update();
}

/**
 * Centro y tamaño del modelo activo (para encuadres de cámara)
 */
export function getActiveModelBounds() {
    const root = cadState.activeWorkspace === 'hanging' ? hangingRoot : printableRoot;
    const center = new THREE.Vector3(0, 0, 12);
    const size = new THREE.Vector3(220, 220, 40);
    if (root) {
        const box = new THREE.Box3().setFromObject(root);
        if (!box.isEmpty()) {
            box.getCenter(center);
            box.getSize(size);
        }
    }
    return { center, size };
}

/**
 * Reconstruye el entorno (por ejemplo al alternar estante o cama)
 */
export function refreshEnvironment() {
    if (scene) {
        buildEnvironment(scene);
    }
}
