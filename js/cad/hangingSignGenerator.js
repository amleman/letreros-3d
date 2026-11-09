import * as THREE from 'three';
import { cadState } from '../config/state.js';
import { ensureFontLoaded } from './fontLoader.js';
import { createUTF8CharExtrudeGeometry, glyphLayoutBounds } from './glyphConverter.js';
import {
    createOrnateBracketGeometry,
    createHangingPlateMesh,
    createChainLinkGeometry,
    clearGroupGeometries
} from './geometryBuilders.js';
import {
    hangingRoot,
    hangingBracketGroup,
    hangingChainsGroup,
    hangingPlatesGroup,
    hangingMountGroup
} from '../scene/sceneManager.js';

// Medidas del sistema (mm). Todo el conjunto está en el plano XY local: X a lo largo del brazo, Y hacia arriba.
const ARM_H = 10;
const BRACKET_T = 5.5;            // Espesor del brazo; las placas y cadenas se centran en su plano medio
const POST_GAP = 15;              // Holgura entre el montante y el borde izquierdo de la placa
const BRACKET_EYE = { outerR: 6, innerR: 3.2 };
const PLATE_EYE = { outerR: 6.5, innerR: 3.4, topAbove: 9, bottomInset: 3 };
const LINK = { length: 14, width: 11, wire: 2.5 };
const CLEARANCE = 0.4;            // Holgura de impresión entre piezas que se enganchan
const LINK_PITCH = LINK.length - 2 * LINK.wire - CLEARANCE;

/**
 * Coloca una cadena de `count` eslabones (impar) que cuelga del ojal con centro `upperY`
 * y devuelve el centro Y que debe tener el ojal inferior para quedar enganchado al último eslabón.
 * Los eslabones alternan 90° (el primero y el último quedan perpendiculares a los ojales).
 */
function addChain(x, upperY, upperInnerR, count, lowerInnerR, zMid, matChain, namePrefix) {
    const hl = LINK.length / 2;
    // El alambre superior del 1er eslabón descansa en el fondo del hueco del ojal superior
    const firstCenterY = upperY - upperInnerR + CLEARANCE + LINK.wire - hl;
    let centerY = firstCenterY;

    for (let k = 0; k < count; k++) {
        centerY = firstCenterY - k * LINK_PITCH;
        const link = new THREE.Mesh(createChainLinkGeometry(LINK.length, LINK.width, LINK.wire), matChain);
        link.position.set(x, centerY, zMid);
        if (k % 2 === 0) link.rotation.y = Math.PI / 2;
        link.name = `${namePrefix}_${k + 1}`;
        link.castShadow = true;
        hangingChainsGroup.add(link);
    }

    // El alambre inferior del último eslabón queda bajo la parte superior del ojal inferior
    return centerY - hl + LINK.wire + CLEARANCE - lowerInnerR;
}

function toOddCount(n) {
    const c = Math.max(1, Math.round(n));
    return c % 2 === 0 ? c + 1 : c;
}

/**
 * Reconstruye el sistema modular completo de Rótulos Colgantes para Anaqueles
 */
export async function rebuildHangingSignCAD() {
    if (!hangingRoot) return;

    clearGroupGeometries(hangingBracketGroup);
    clearGroupGeometries(hangingChainsGroup);
    clearGroupGeometries(hangingPlatesGroup);
    clearGroupGeometries(hangingMountGroup);

    const config = cadState.hanging;
    const plates = config.plates || [];
    if (plates.length === 0) return;

    const matBracket = new THREE.MeshStandardMaterial({
        color: new THREE.Color(config.bracketColor || '#1e242b'),
        roughness: 0.62,
        metalness: 0.28,
        wireframe: cadState.wireframe
    });
    const matChain = new THREE.MeshStandardMaterial({
        color: new THREE.Color(config.chainColor || '#64748b'),
        roughness: 0.45,
        metalness: 0.55,
        wireframe: cadState.wireframe
    });

    // 1. Distribución: la placa más ancha define el brazo; la más angosta, la separación de argollas
    const widths = plates.map(p => p.width || 210);
    const maxW = Math.max(...widths);
    const minW = Math.min(...widths);
    const loopSpacing = Math.min(100, minW * 0.55);
    const signCenterX = POST_GAP + maxW / 2;
    const chainX1 = signCenterX - loopSpacing / 2;
    const chainX2 = signCenterX + loopSpacing / 2;
    const armLength = Math.max(config.bracketLengthMm || 220, POST_GAP + maxW + 22);
    const braceRadius = Math.max(18, Math.min(42, chainX1 - 14));
    const zMid = BRACKET_T / 2;

    // 2. Brazo de hierro forjado con refuerzo curvo y ojales alineados a las argollas de la placa
    const bracketGeo = createOrnateBracketGeometry({
        armLengthMm: armLength,
        armHeightMm: ARM_H,
        postHeightMm: Math.max(110, braceRadius + 45),
        thicknessMm: BRACKET_T,
        eyeletXs: [chainX1, chainX2],
        braceRadiusMm: braceRadius
    });
    const bracketMesh = new THREE.Mesh(bracketGeo, matBracket);
    bracketMesh.name = "Brazo_Ornamental_Hierro";
    bracketMesh.castShadow = true;
    bracketMesh.receiveShadow = true;
    hangingBracketGroup.add(bracketMesh);

    // 3. Cadena superior: del ojal del brazo a las argollas superiores de la 1ª placa
    const bracketEyeY = -ARM_H + 1 - BRACKET_EYE.outerR;
    const topLinks = toOddCount((config.chainLengthMm || 35) / LINK_PITCH);
    addChain(chainX1, bracketEyeY, BRACKET_EYE.innerR, topLinks, PLATE_EYE.innerR, zMid, matChain, 'Eslabon_Cadena_Izq');
    let nextTopEyeY = addChain(chainX2, bracketEyeY, BRACKET_EYE.innerR, topLinks, PLATE_EYE.innerR, zMid, matChain, 'Eslabon_Cadena_Der');

    // 4. Placas modulares en cascada, unidas por un eslabón intermedio
    for (let pIdx = 0; pIdx < plates.length; pIdx++) {
        const plateData = plates[pIdx];
        const n = pIdx + 1;
        const isLastPlate = pIdx === plates.length - 1;

        const plateWidth = plateData.width || 210;
        const plateHeight = plateData.height || 50;
        const plateDepth = plateData.depth || 4.2;
        const hh = plateHeight / 2;
        // Centro de la argolla superior = hh + topAbove - outerR sobre el centro de la placa
        const plateCenterY = nextTopEyeY - (hh + PLATE_EYE.topAbove - PLATE_EYE.outerR);
        const plateZ = zMid - plateDepth / 2;

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

        const plateAssembly = createHangingPlateMesh(
            plateWidth, plateHeight, plateDepth, !isLastPlate, matPlateBase, matPlateFrame, loopSpacing
        );
        plateAssembly.baseMesh.position.set(signCenterX, plateCenterY, plateZ);
        plateAssembly.frameMesh.position.set(signCenterX, plateCenterY, plateZ);
        plateAssembly.baseMesh.name = `Placa_${n}_Base`;
        plateAssembly.frameMesh.name = `Placa_${n}_Marco`;
        plateAssembly.baseMesh.castShadow = true;
        plateAssembly.frameMesh.castShadow = true;
        hangingPlatesGroup.add(plateAssembly.baseMesh);
        hangingPlatesGroup.add(plateAssembly.frameMesh);

        // Texto 3D sobre la placa, centrado y escalado para no desbordar el marco
        const otFont = await ensureFontLoaded(plateData.font || 'montserrat');
        const rawText = (plateData.text || 'LETRERO').trim();
        const letterSize = Math.max(12, Math.min(plateHeight * 0.48, 38));
        const letterDepth = 3.2;

        if (otFont && rawText.length > 0) {
            let cursorX = 0;
            const letterGeos = [];
            // Línea base común (letra 'H'): las letras con tilde no deben quedar más bajas que las demás
            const refGeo = createUTF8CharExtrudeGeometry(otFont, 'H', letterSize, 1, 0);
            const refMinY = refGeo ? refGeo.boundingBox.min.y : 0;
            const refCapH = refGeo ? refGeo.boundingBox.max.y - refGeo.boundingBox.min.y : letterSize;
            if (refGeo) refGeo.dispose();
            Array.from(rawText).forEach(ch => {
                if (ch === ' ') {
                    cursorX += letterSize * 0.4;
                    return;
                }
                const lGeo = createUTF8CharExtrudeGeometry(otFont, ch, letterSize, letterDepth, 0.5);
                if (lGeo) {
                    const bb = lGeo.boundingBox;
                    const lb = glyphLayoutBounds(otFont, ch, letterSize, 0.5) || { minX: bb.min.x, maxX: bb.max.x };
                    lGeo.translate(cursorX - lb.minX, -refMinY - refCapH / 2, 0);
                    letterGeos.push(lGeo);
                    cursorX += (lb.maxX - lb.minX) + 2.5;
                }
            });

            const totalTextW = Math.max(1, cursorX - 2.5);
            const maxAllowedW = Math.max(40, plateWidth - 36);
            const textScale = totalTextW > maxAllowedW ? (maxAllowedW / totalTextW) : 1.0;

            letterGeos.forEach((g, k) => {
                if (textScale < 0.999) g.scale(textScale, textScale, 1.0);
                g.translate(signCenterX - (totalTextW * textScale) / 2, plateCenterY, plateZ + plateDepth);
                const lMesh = new THREE.Mesh(g, matPlateText);
                lMesh.name = `Placa_${n}_Letra_${k + 1}`;
                lMesh.castShadow = true;
                hangingPlatesGroup.add(lMesh);
            });
        }

        // Eslabón intermedio entre la argolla inferior de esta placa y la superior de la siguiente
        if (!isLastPlate) {
            const bottomEyeY = plateCenterY - hh + PLATE_EYE.bottomInset - PLATE_EYE.outerR;
            addChain(chainX1, bottomEyeY, PLATE_EYE.innerR, 1, PLATE_EYE.innerR, zMid, matChain, `Eslabon_Intermedio_${n}_Izq`);
            nextTopEyeY = addChain(chainX2, bottomEyeY, PLATE_EYE.innerR, 1, PLATE_EYE.innerR, zMid, matChain, `Eslabon_Intermedio_${n}_Der`);
        }
    }

    // 5. Orientación de exhibición: colgado de pie (Y local -> Z mundo), atornillado al lateral de un anaquel
    hangingRoot.position.set(0, 0, 0);
    hangingRoot.rotation.set(Math.PI / 2, 0, 0);
    hangingRoot.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(hangingRoot);
    if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        const floorClearance = 60;
        hangingRoot.position.set(-center.x, -center.y, -box.min.z + floorClearance);
        hangingRoot.updateMatrixWorld(true);

        buildShelfEndPanel(new THREE.Box3().setFromObject(hangingRoot));
    }

    updateHangingMetrics();
}

/**
 * Lateral de madera del anaquel donde se atornilla el montante (solo exhibición, nunca se exporta)
 */
function buildShelfEndPanel(signBox) {
    const panelT = 18;
    const panelDepth = 300;
    const topZ = signBox.max.z + 45;
    const panelGeo = new THREE.BoxGeometry(panelT, panelDepth, topZ);
    panelGeo.translate(signBox.min.x - panelT / 2, 0, topZ / 2);

    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.7, metalness: 0.02 });
    const panel = new THREE.Mesh(panelGeo, wood);
    panel.name = "Lateral_Anaquel_Exhibicion";
    panel.receiveShadow = true;
    panel.castShadow = true;
    hangingMountGroup.add(panel);

    // Canto frontal más claro para que el lateral se lea como un mueble
    const edgeGeo = new THREE.BoxGeometry(panelT + 0.5, 4, topZ);
    edgeGeo.translate(signBox.min.x - panelT / 2, -panelDepth / 2 - 1.5, topZ / 2);
    const edge = new THREE.Mesh(edgeGeo, new THREE.MeshStandardMaterial({ color: 0xb98557, roughness: 0.6 }));
    edge.name = "Canto_Anaquel_Exhibicion";
    hangingMountGroup.add(edge);
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
