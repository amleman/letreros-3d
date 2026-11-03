import * as THREE from 'three';
import { cadState } from '../config/state.js';
import { ensureFontLoaded } from './fontLoader.js';
import { createUTF8CharExtrudeGeometry } from './glyphConverter.js';
import {
    createOrnateBracketGeometry,
    createHangingPlateMesh,
    createChainLinkGeometry,
    clearGroupGeometries
} from './geometryBuilders.js';
import { hangingRoot, hangingBracketGroup, hangingChainsGroup, hangingPlatesGroup } from '../scene/sceneManager.js';

/**
 * Reconstruye el sistema modular completo de Rótulos Colgantes para Anaqueles (Imagen 2)
 */
export async function rebuildHangingSignCAD() {
    if (!hangingRoot) return;

    clearGroupGeometries(hangingBracketGroup);
    clearGroupGeometries(hangingChainsGroup);
    clearGroupGeometries(hangingPlatesGroup);

    const config = cadState.hanging;
    const bracketColor = config.bracketColor || '#1e242b';
    const chainColor = config.chainColor || '#64748b';

    const matBracket = new THREE.MeshStandardMaterial({
        color: new THREE.Color(bracketColor),
        roughness: 0.62,
        metalness: 0.28,
        wireframe: cadState.wireframe
    });

    const matChain = new THREE.MeshStandardMaterial({
        color: new THREE.Color(chainColor),
        roughness: 0.45,
        metalness: 0.55,
        wireframe: cadState.wireframe
    });

    // 1. BRAZO ORNAMENTAL DE HIERRO FORJADO CON PUNTA DE FLECHA (Imagen 2)
    const bracketGeo = createOrnateBracketGeometry(config.bracketLengthMm, 150, 5.5);
    const bracketMesh = new THREE.Mesh(bracketGeo, matBracket);
    bracketMesh.name = "Brazo_Ornamental_Hierro";
    bracketMesh.castShadow = true;
    bracketMesh.receiveShadow = true;
    hangingBracketGroup.add(bracketMesh);

    // Ojales del brazo (a X = 50 y X = 150 respecto al montante)
    const armLoopX1 = 50;
    const armLoopX2 = 150;
    const armBottomY = 150 * 0.45 - 10 - 12;

    const signCenterX = (armLoopX1 + armLoopX2) / 2; // 100 mm
    const loopSpacing = armLoopX2 - armLoopX1;      // 100 mm

    // 2. CADENAS SUPERIORES (Eslabones en C desmontables)
    const numLinksTop = 3;
    const linkSpacingMm = 10;
    for (let i = 0; i < numLinksTop; i++) {
        const linkY = armBottomY - 8 - (i * linkSpacingMm);

        const l1 = new THREE.Mesh(createChainLinkGeometry(14, 9, 2.5), matChain);
        l1.position.set(armLoopX1, linkY, 2.7);
        if (i % 2 === 1) l1.rotateY(Math.PI / 2);
        l1.name = `Eslabon_Cadena_Izq_${i + 1}`;
        hangingChainsGroup.add(l1);

        const l2 = new THREE.Mesh(createChainLinkGeometry(14, 9, 2.5), matChain);
        l2.position.set(armLoopX2, linkY, 2.7);
        if (i % 2 === 1) l2.rotateY(Math.PI / 2);
        l2.name = `Eslabon_Cadena_Der_${i + 1}`;
        hangingChainsGroup.add(l2);
    }

    // 3. PLACAS MODULARES APILADAS HACIA ABAJO (Quitables y ponibles)
    let currentY = armBottomY - 8 - (numLinksTop * linkSpacingMm) - 14;

    for (let pIdx = 0; pIdx < config.plates.length; pIdx++) {
        const plateData = config.plates[pIdx];
        const isLastPlate = (pIdx === config.plates.length - 1);

        const otFont = await ensureFontLoaded(plateData.font || 'montserrat');

        const matPlateBase = new THREE.MeshStandardMaterial({
            color: new THREE.Color(plateData.plateColor || '#1e242b'),
            roughness: 0.68,
            metalness: 0.05,
            wireframe: cadState.wireframe
        });
        const matPlateFrame = new THREE.MeshStandardMaterial({
            color: new THREE.Color(plateData.frameColor || '#d49b4b'),
            roughness: 0.38,
            metalness: 0.22,
            wireframe: cadState.wireframe
        });
        const matPlateText = new THREE.MeshStandardMaterial({
            color: new THREE.Color(plateData.textColor || '#f8f4e8'),
            roughness: 0.42,
            metalness: 0.1,
            wireframe: cadState.wireframe
        });

        // Crear la placa con sus argollas
        const plateWidth = plateData.width || 210;
        const plateHeight = plateData.height || 50;
        const plateDepth = plateData.depth || 4.2;
        const plateCenterY = currentY - (plateHeight / 2);

        const plateAssembly = createHangingPlateMesh(
            plateWidth,
            plateHeight,
            plateDepth,
            !isLastPlate,
            matPlateBase,
            matPlateFrame
        );

        plateAssembly.baseMesh.position.set(signCenterX, plateCenterY, 0);
        plateAssembly.frameMesh.position.set(signCenterX, plateCenterY, 0);
        plateAssembly.baseMesh.castShadow = true;
        plateAssembly.frameMesh.castShadow = true;

        hangingPlatesGroup.add(plateAssembly.baseMesh);
        hangingPlatesGroup.add(plateAssembly.frameMesh);

        // Texto 3D sobre la placa
        const rawText = (plateData.text || 'LETRERO').toUpperCase().trim();
        const letterSize = Math.max(12, Math.min(plateHeight * 0.48, 38));
        const letterDepth = 3.2;

        if (otFont && rawText.length > 0) {
            const chars = Array.from(rawText);
            const letterGroup = new THREE.Group();
            letterGroup.name = `Letras_Placa_${pIdx + 1}`;

            let cursorX = 0;
            const letterGeos = [];

            chars.forEach((ch, cIdx) => {
                if (ch === ' ') {
                    cursorX += letterSize * 0.4;
                    return;
                }
                const lGeo = createUTF8CharExtrudeGeometry(otFont, ch, letterSize, letterDepth, 0.5);
                if (lGeo) {
                    const bb = lGeo.boundingBox;
                    const lw = bb.max.x - bb.min.x;
                    lGeo.translate(cursorX - bb.min.x, -bb.min.y - (bb.max.y - bb.min.y) / 2, 0);
                    letterGeos.push(lGeo);
                    cursorX += lw + 2.5;
                }
            });

            // Centrar y escalar automáticamente el texto para que NUNCA desborde la placa
            const totalTextW = cursorX;
            const maxAllowedW = Math.max(40, plateWidth - 36);
            const textScale = totalTextW > maxAllowedW ? (maxAllowedW / totalTextW) : 1.0;

            letterGeos.forEach(g => {
                if (textScale < 0.999) {
                    g.scale(textScale, textScale, 1.0);
                }
                g.translate((-totalTextW * textScale) / 2 + signCenterX, plateCenterY, plateDepth);
                const lMesh = new THREE.Mesh(g, matPlateText);
                lMesh.castShadow = true;
                letterGroup.add(lMesh);
            });

            hangingPlatesGroup.add(letterGroup);
        }

        // Si hay una siguiente placa, añadimos los eslabones C intermedios
        if (!isLastPlate) {
            const interLinkY = plateCenterY - (plateHeight / 2) - 8;
            const linkX1 = signCenterX - loopSpacing / 2;
            const linkX2 = signCenterX + loopSpacing / 2;

            const il1 = new THREE.Mesh(createChainLinkGeometry(14, 9, 2.5), matChain);
            il1.position.set(linkX1, interLinkY, 2.7);
            il1.name = `Eslabon_Intermedio_${pIdx + 1}_Izq`;
            hangingChainsGroup.add(il1);

            const il2 = new THREE.Mesh(createChainLinkGeometry(14, 9, 2.5), matChain);
            il2.position.set(linkX2, interLinkY, 2.7);
            il2.name = `Eslabon_Intermedio_${pIdx + 1}_Der`;
            hangingChainsGroup.add(il2);

            currentY = interLinkY - 14;
        }
    }

    // Orientar verticalmente el conjunto para que cuelgue de pie con gravedad natural en Z
    // (Rotación de 90° alrededor del eje X para que la altura Y sea el eje Z de Three.js)
    hangingRoot.position.set(0, 0, 0);
    hangingRoot.rotation.set(Math.PI / 2, 0, 0);
    hangingRoot.updateMatrixWorld(true);

    const hangingBox = new THREE.Box3().setFromObject(hangingRoot);
    if (!hangingBox.isEmpty()) {
        const center = new THREE.Vector3();
        hangingBox.getCenter(center);
        hangingRoot.position.set(-center.x, -center.y, -hangingBox.min.z + 15);
    }

    updateHangingMetrics();
}

/**
 * Calcula y actualiza las métricas del rótulo colgante
 */
function updateHangingMetrics() {
    const box = new THREE.Box3().setFromObject(hangingRoot);
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    box.getSize(size);

    const w = Math.round(size.x);
    const d = Math.round(size.y * 10) / 10;
    const h = Math.round(size.z);

    const badge = document.getElementById('dimensions-badge');
    if (badge) badge.textContent = `${w} × ${h} × ${d} mm`;

    const partsCount = hangingBracketGroup.children.length + hangingChainsGroup.children.length + hangingPlatesGroup.children.length;
    const partsBadge = document.getElementById('parts-count-badge');
    if (partsBadge) partsBadge.textContent = `${partsCount} Piezas Modulares`;
}
