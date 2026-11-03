import * as THREE from 'three';

/**
 * Configura la iluminación de estudio 3D para realzar biseles, relieves y sombras CAD
 */
export function setupLighting(scene) {
    const lightsGroup = new THREE.Group();
    lightsGroup.name = "Lighting_Rig";

    // 1. Luz Ambiental equilibrada (evita negros puros en caras opuestas)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    lightsGroup.add(ambientLight);

    // 2. Luz Principal (Key Light) frontal superior con sombras suaves
    const keyLight = new THREE.DirectionalLight(0xfff8eb, 1.35);
    keyLight.position.set(120, -180, 240);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 800;
    const shadowD = 180;
    keyLight.shadow.camera.left = -shadowD;
    keyLight.shadow.camera.right = shadowD;
    keyLight.shadow.camera.top = shadowD;
    keyLight.shadow.camera.bottom = -shadowD;
    keyLight.shadow.bias = -0.0005;
    lightsGroup.add(keyLight);

    // 3. Luz de Relleno (Fill Light) fría y difusa desde el lado opuesto
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
    fillLight.position.set(-160, 100, 140);
    lightsGroup.add(fillLight);

    // 4. Luz de Borde / Rasante (Rim Light) para resaltar contornos biselados
    const rimLight = new THREE.DirectionalLight(0xffedd5, 0.65);
    rimLight.position.set(0, 180, 200);
    lightsGroup.add(rimLight);

    scene.add(lightsGroup);
    return lightsGroup;
}
