import * as THREE from 'three';
import { cadState } from '../config/state.js';

let shelfMesh = null;
let buildPlateGroup = null;
let bedBorderMesh = null;

/**
 * Crea una textura de cuadrícula milimétrica para la cama de impresión 3D (250 x 250 mm / 25 cm²)
 */
function createBedTexture(isWarning = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Fondo oscuro tipo lámina PEI texturizada
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1024, 1024);

    // Cuadrícula fina (cada 10 mm en escala 1024px / 250mm => ~41px)
    const stepMm = 10;
    const totalMm = 250;
    const pxPerMm = 1024 / totalMm;

    // Líneas secundarias (cada 10 mm)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let mm = 0; mm <= totalMm; mm += stepMm) {
        const p = Math.round(mm * pxPerMm);
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, 1024);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(1024, p);
        ctx.stroke();
    }

    // Líneas principales (cada 50 mm / 5 cm)
    ctx.strokeStyle = isWarning ? '#ef4444' : '#334155';
    ctx.lineWidth = 2.5;
    for (let mm = 0; mm <= totalMm; mm += 50) {
        const p = Math.round(mm * pxPerMm);
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, 1024);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(1024, p);
        ctx.stroke();
    }

    // Ejes centrales (0,0)
    ctx.strokeStyle = isWarning ? '#f87171' : '#f59e0b';
    ctx.lineWidth = 3;
    const centerPx = 512;
    ctx.beginPath();
    ctx.moveTo(centerPx, 0);
    ctx.lineTo(centerPx, 1024);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, centerPx);
    ctx.lineTo(1024, centerPx);
    ctx.stroke();

    // Borde perimetral de 250 x 250 mm
    ctx.strokeStyle = isWarning ? '#dc2626' : '#f59e0b';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 1016, 1016);

    // Marcas de escala y texto impreso en la cama
    ctx.fillStyle = isWarning ? '#fca5a5' : '#fbbf24';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BAMBU / PRUSA • 250 × 250 mm (25 cm²) • CERO MÁXIMO', 512, 42);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('-125 mm', 60, 504);
    ctx.fillText('+125 mm', 960, 504);
    ctx.fillText('+125 mm', 512, 75);
    ctx.fillText('-125 mm', 512, 990);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    return texture;
}

/**
 * Construye y actualiza el entorno 3D (Cama de impresión Bambu Studio 25x25 cm + Estante opcional)
 */
export function buildEnvironment(scene) {
    // 1. Placa de Impresión 3D de 25 cm cuadrados (250 x 250 mm)
    if (!buildPlateGroup) {
        buildPlateGroup = new THREE.Group();
        buildPlateGroup.name = "Placa_Impresion_25cm";

        const size = cadState.bedSizeMm; // 250 mm

        // Plano de la lámina PEI con la cuadrícula
        const bedGeo = new THREE.PlaneGeometry(size, size);
        const bedMat = new THREE.MeshStandardMaterial({
            map: createBedTexture(cadState.isOverBedSize),
            roughness: 0.82,
            metalness: 0.15,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });
        const bedMesh = new THREE.Mesh(bedGeo, bedMat);
        bedMesh.name = "Lámina_PEI_25cm";
        bedMesh.position.set(0, 0, -0.1);
        bedMesh.receiveShadow = true;
        buildPlateGroup.add(bedMesh);

        // Borde exterior metálico de la cama con esquinas biseladas y pestaña frontal
        const borderShape = new THREE.Shape();
        const hs = size / 2 + 3;
        borderShape.moveTo(-hs + 6, -hs);
        borderShape.lineTo(hs - 6, -hs);
        borderShape.lineTo(hs, -hs + 6);
        borderShape.lineTo(hs, hs - 6);
        borderShape.lineTo(hs - 6, hs);
        // Pestaña frontal tipo Bambu Lab
        borderShape.lineTo(25, hs);
        borderShape.lineTo(18, hs + 12);
        borderShape.lineTo(-18, hs + 12);
        borderShape.lineTo(-25, hs);
        borderShape.lineTo(-hs + 6, hs);
        borderShape.lineTo(-hs, hs - 6);
        borderShape.lineTo(-hs, -hs + 6);
        borderShape.closePath();

        const borderHole = new THREE.Path();
        const ihs = size / 2;
        borderHole.moveTo(-ihs, -ihs);
        borderHole.lineTo(ihs, -ihs);
        borderHole.lineTo(ihs, ihs);
        borderHole.lineTo(-ihs, ihs);
        borderHole.closePath();
        borderShape.holes.push(borderHole);

        const borderGeo = new THREE.ExtrudeGeometry(borderShape, {
            depth: 1.8,
            bevelEnabled: false
        });
        borderGeo.translate(0, 0, -2.0);

        const borderMat = new THREE.MeshStandardMaterial({
            color: 0x334155,
            metalness: 0.7,
            roughness: 0.35
        });
        bedBorderMesh = new THREE.Mesh(borderGeo, borderMat);
        bedBorderMesh.name = "Borde_Placa_Acero";
        bedBorderMesh.receiveShadow = true;
        buildPlateGroup.add(bedBorderMesh);

        scene.add(buildPlateGroup);
    }

    // 2. Estante de Biblioteca de madera cálida (opcional)
    if (shelfMesh) {
        scene.remove(shelfMesh);
        if (shelfMesh.geometry) shelfMesh.geometry.dispose();
        shelfMesh = null;
    }

    if (cadState.showShelf) {
        const shelfGeo = new THREE.BoxGeometry(360, 110, 16);
        shelfGeo.translate(0, 0, -8.5);

        const shelfMat = new THREE.MeshStandardMaterial({
            color: 0x4a2e1b, // Nogal / roble oscuro
            roughness: 0.68,
            metalness: 0.04
        });

        shelfMesh = new THREE.Mesh(shelfGeo, shelfMat);
        shelfMesh.name = "Estante_Biblioteca_Madera";
        shelfMesh.receiveShadow = true;
        scene.add(shelfMesh);

        // Ocultar la placa de impresión si el estante está activo
        buildPlateGroup.visible = false;
    } else {
        buildPlateGroup.visible = cadState.showBedGrid;
    }
}

/**
 * Actualiza la textura y el color de advertencia de la cama si el rótulo supera los 25 cm
 */
export function updateBedAlertStatus(isOverSize) {
    cadState.isOverBedSize = isOverSize;
    if (buildPlateGroup) {
        const bedMesh = buildPlateGroup.getObjectByName("Lámina_PEI_25cm");
        if (bedMesh && bedMesh.material) {
            if (bedMesh.material.map) bedMesh.material.map.dispose();
            bedMesh.material.map = createBedTexture(isOverSize);
            bedMesh.material.needsUpdate = true;
        }
    }
}
