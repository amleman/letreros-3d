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
    hangingMountGroup,
    scene,
    resetCameraView
} from '../scene/sceneManager.js';
import { buildEnvironment, setBedLayout, updateBedAlertStatus } from '../scene/environment.js';

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

    const isBedView = config.viewMode === 'bed';
    const bedPlateView = config.bedPlateView || 'all';
    const isSlotted = config.plateStyle !== 'fixed';
    const mountType = config.mountType || 'adhesive';

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

    // 2. Brazo de soporte arquitectónico (con tipo de anclaje: zapata 3M adhesiva, gancho o tornillos)
    const bracketGeo = createOrnateBracketGeometry({
        armLengthMm: armLength,
        armHeightMm: ARM_H,
        postHeightMm: Math.max(115, braceRadius + 45),
        postWidthMm: 14,
        thicknessMm: BRACKET_T,
        eyeletXs: [chainX1, chainX2],
        braceRadiusMm: braceRadius,
        mountType: mountType
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

    // 4. Placas modulares en cascada (con opción de tablilla deslizable tipo gasolinera)
    for (let pIdx = 0; pIdx < plates.length; pIdx++) {
        const plateData = plates[pIdx];
        const n = pIdx + 1;
        const isLastPlate = pIdx === plates.length - 1;

        const plateWidth = plateData.width || 210;
        const plateHeight = plateData.height || 50;
        const plateDepth = plateData.depth || 4.2;
        const hh = plateHeight / 2;
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
            plateWidth, plateHeight, plateDepth, !isLastPlate, matPlateBase, matPlateFrame, loopSpacing, isSlotted
        );
        plateAssembly.baseMesh.position.set(signCenterX, plateCenterY, plateZ);
        plateAssembly.frameMesh.position.set(signCenterX, plateCenterY, plateZ);
        plateAssembly.baseMesh.name = `Placa_${n}_Base`;
        plateAssembly.frameMesh.name = `Placa_${n}_Marco`;
        plateAssembly.baseMesh.castShadow = true;
        plateAssembly.frameMesh.castShadow = true;
        hangingPlatesGroup.add(plateAssembly.baseMesh);
        hangingPlatesGroup.add(plateAssembly.frameMesh);

        // Texto 3D sobre la placa o tablilla
        const otFont = await ensureFontLoaded(plateData.font || 'montserrat');
        const rawText = (plateData.text || 'LETRERO').trim();
        const letterSize = Math.max(12, Math.min(plateHeight * 0.48, 38));
        const letterDepth = 3.2;

        if (otFont && rawText.length > 0) {
            let cursorX = 0;
            const letterGeos = [];
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

    // =========================================================================
    // 5. MODOS DE VISTA: ENSAMBLADO EN ANAQUEL vs DISPOSICIÓN EN CAMA 25 CM
    // =========================================================================
    if (isBedView) {
        // --- MODO CAMA DE IMPRESIÓN (Plano sobre Z = 0) ---
        hangingRoot.position.set(0, 0, 0);
        hangingRoot.rotation.set(0, 0, 0); // No rotar hacia arriba: yace acostado en XY

        // Visibilidad según la vista de cama seleccionada
        const showBracket = bedPlateView === 'all' || bedPlateView === 'bracket';
        const showPlates = bedPlateView === 'all' || bedPlateView === 'plates';
        const showChains = bedPlateView === 'all' || bedPlateView === 'chains';

        hangingBracketGroup.visible = showBracket;
        hangingPlatesGroup.visible = showPlates;
        hangingChainsGroup.visible = showChains;
        hangingMountGroup.visible = false; // Sin madera en la vista de cama

        // Camas múltiples si vemos 'all', o cama única si vemos una pieza
        if (bedPlateView === 'all') {
            setBedLayout(3, 290);
        } else {
            setBedLayout(1);
        }

        // Posicionar Brazo
        if (showBracket) {
            const bracketXOffset = bedPlateView === 'all' ? -290 : 0;
            // Clonar y centrar la geometría para que la rotación diagonal ocurra perfectamente sobre el centro de la cama
            const bedBracketGeo = bracketGeo.clone();
            bedBracketGeo.center();
            bracketMesh.geometry = bedBracketGeo;
            bracketMesh.position.set(bracketXOffset, 0, 0);

            // Si se activa rotación 45° o si el brazo mide más de 220 mm, rotarlo diagonalmente
            const shouldAngle = config.bracketAngle45 || armLength > 220;
            bracketMesh.rotation.z = shouldAngle ? (Math.PI / 4) : 0;
        }

        // Posicionar Placas Modulares
        if (showPlates) {
            const platesXOffset = bedPlateView === 'all' ? 0 : 0;
            const numP = plates.length;
            plates.forEach((p, idx) => {
                const prefix = `Placa_${idx + 1}_`;
                const pMeshes = hangingPlatesGroup.children.filter(m => (m.name || '').startsWith(prefix));
                const py = (idx - (numP - 1) / 2) * -65;

                const pBox = new THREE.Box3();
                pMeshes.forEach(m => pBox.expandByObject(m));
                if (!pBox.isEmpty()) {
                    const origCx = (pBox.min.x + pBox.max.x) / 2;
                    const origCy = (pBox.min.y + pBox.max.y) / 2;
                    const origMinZ = pBox.min.z;

                    pMeshes.forEach(m => {
                        m.position.x += platesXOffset - origCx;
                        m.position.y += py - origCy;
                        m.position.z -= origMinZ;
                    });
                }
            });
        }

        // Posicionar Eslabones en cuadrícula limpia sobre la cama
        if (showChains) {
            const chainsXOffset = bedPlateView === 'all' ? 290 : 0;
            const links = hangingChainsGroup.children;
            const perRow = 4;
            links.forEach((l, idx) => {
                const col = idx % perRow;
                const row = Math.floor(idx / perRow);
                const lx = chainsXOffset - 35 + col * 24;
                const ly = 35 - row * 24;
                l.position.set(lx, ly, LINK.wire / 2);
                l.rotation.set(0, 0, 0); // Acostados planos sobre la cama
            });
        }

        hangingRoot.updateMatrixWorld(true);

        // Advertencia de cama: si alguna pieza excede los 250 mm
        const isOver = armLength > (config.bracketAngle45 ? 340 : 250);
        updateBedAlertStatus(isOver);
    } else {
        // --- MODO ENSAMBLADO EN ANAQUEL (Vertical Z-up con lateral de madera) ---
        hangingBracketGroup.visible = true;
        hangingPlatesGroup.visible = true;
        hangingChainsGroup.visible = true;
        hangingMountGroup.visible = true;

        bracketMesh.position.set(0, 0, 0);
        bracketMesh.rotation.set(0, 0, 0);

        // Configurar orientación vertical en el espacio
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

            buildShelfEndPanel(new THREE.Box3().setFromObject(hangingRoot), mountType);
        }

        setBedLayout(1);
        updateBedAlertStatus(false);
    }

    if (scene) buildEnvironment(scene);
    updateHangingMetrics();
}

/**
 * Módulo de exhibición del anaquel de madera de la biblioteca (reproduce la moldura y panel de las fotos)
 */
function buildShelfEndPanel(signBox, mountType = 'adhesive') {
    const panelT = 24;
    const panelDepth = 340;
    const topZ = signBox.max.z + 50;

    // 1. Moldura perimetral exterior de madera de nogal (como en la foto real de la biblioteca)
    const frameGeo = new THREE.BoxGeometry(panelT, panelDepth, topZ);
    frameGeo.translate(signBox.min.x - panelT / 2, 0, topZ / 2);
    const matWoodFrame = new THREE.MeshStandardMaterial({
        color: 0x5a3921, // Nogal oscuro institucional
        roughness: 0.65,
        metalness: 0.04
    });
    const frameMesh = new THREE.Mesh(frameGeo, matWoodFrame);
    frameMesh.name = "Moldura_Anaquel_Madera";
    frameMesh.receiveShadow = true;
    frameMesh.castShadow = true;
    hangingMountGroup.add(frameMesh);

    // 2. Tablero interior rebajado (panel central liso)
    const insetGeo = new THREE.BoxGeometry(panelT - 6, panelDepth - 45, topZ - 45);
    insetGeo.translate(signBox.min.x - panelT / 2 + 3.5, 0, topZ / 2);
    const matWoodInset = new THREE.MeshStandardMaterial({
        color: 0x754e2d, // Tono madera cálido central
        roughness: 0.72,
        metalness: 0.02
    });
    const insetMesh = new THREE.Mesh(insetGeo, matWoodInset);
    insetMesh.name = "Tablero_Central_Anaquel";
    insetMesh.receiveShadow = true;
    hangingMountGroup.add(insetMesh);

    // 3. Cornisa superior moldurada
    const crownGeo = new THREE.BoxGeometry(panelT + 12, panelDepth + 14, 16);
    crownGeo.translate(signBox.min.x - panelT / 2, 0, topZ - 8);
    const matCrown = new THREE.MeshStandardMaterial({ color: 0x482c16, roughness: 0.6 });
    const crown = new THREE.Mesh(crownGeo, matCrown);
    crown.name = "Cornisa_Superior_Anaquel";
    crown.castShadow = true;
    hangingMountGroup.add(crown);

    // 4. Si es montaje adhesivo 3M Command (sin perforar), mostrar la lengüeta elástica de retiro limpio
    if (mountType === 'adhesive') {
        const stripGeo = new THREE.BoxGeometry(1.5, 20, 35);
        stripGeo.translate(signBox.min.x + 0.8, -40, signBox.max.z - 95);
        const matStrip = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 });
        const stripMesh = new THREE.Mesh(stripGeo, matStrip);
        stripMesh.name = "Tira_3M_Command_Limpia";
        hangingMountGroup.add(stripMesh);

        // Pestaña inferior visible de retiro
        const tabGeo = new THREE.BoxGeometry(2, 14, 12);
        tabGeo.translate(signBox.min.x + 1, -40, signBox.max.z - 118);
        const matTab = new THREE.MeshStandardMaterial({ color: 0xf87171, roughness: 0.5 });
        const tabMesh = new THREE.Mesh(tabGeo, matTab);
        tabMesh.name = "Lengueta_Retiro_3M";
        hangingMountGroup.add(tabMesh);
    }
}

/**
 * Calcula y actualiza las métricas del rótulo colgante
 */
function updateHangingMetrics() {
    const isBed = cadState.hanging.viewMode === 'bed';
    const box = new THREE.Box3().setFromObject(hangingRoot);
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    box.getSize(size);

    const w = Math.round(size.x);
    const d = Math.round(size.y * 10) / 10;
    const h = Math.round(size.z);

    const badge = document.getElementById('dimensions-badge');
    if (badge) {
        if (isBed) {
            badge.textContent = `En Cama 25 cm: ${w} × ${d} mm`;
        } else {
            badge.textContent = `${w} × ${h} × ${d} mm`;
        }
    }

    const partsCount = hangingBracketGroup.children.length + hangingChainsGroup.children.length + hangingPlatesGroup.children.length;
    const partsBadge = document.getElementById('parts-count-badge');
    if (partsBadge) {
        if (isBed) {
            partsBadge.textContent = `Placas Despiezadas (${cadState.hanging.bedPlateView || 'all'})`;
        } else {
            partsBadge.textContent = `${partsCount} Piezas Modulares`;
        }
    }

    const bboxStat = document.getElementById('stat-bbox');
    if (bboxStat) {
        bboxStat.textContent = isBed ? `Cama 250×250 mm (${w}×${d} mm)` : `${w} × ${h} × ${d} mm`;
    }
}
