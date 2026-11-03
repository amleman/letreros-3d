import * as THREE from 'three';
import { cadState } from '../config/state.js';
import { institutionalFonts } from '../config/fonts.js';
import { ensureFontLoaded } from './fontLoader.js';
import { createUTF8CharExtrudeGeometry } from './glyphConverter.js';
import {
    createChamferedBoxGeometry,
    createRoundedBoxGeometry,
    createLeftPuzzlePlaque,
    createRightPuzzlePlaque,
    createSolidMonolithBlock,
    createSteppedPlinthAssembly,
    createOrnateFrameMeshes,
    createTabulaAnsataAssembly,
    createShelfClipAssembly,
    createAngledWedgeAssembly,
    createCeilingSuspendedAssembly,
    clearGroupGeometries
} from './geometryBuilders.js';
import {
    getInstitutionalLogoGeometry,
    createRecessedLogoSocketGeometry,
    createStandaloneMedallionAssembly
} from './logoBuilder.js';
import { printableRoot, baseGroup, accentsGroup, lettersGroup } from '../scene/sceneManager.js';
import { updateBedAlertStatus } from '../scene/environment.js';
import { scheduleAutoSave } from '../config/persistence.js';

/**
 * Divide inteligentemente un texto en 1, 2 o múltiples líneas:
 * - Si contiene saltos de línea (\n) por pulsar Enter en el textarea, divide por cada línea.
 * - Si contiene '/' o '|', divide explícitamente por ese separador.
 * - Si autoWrapLong es true y el texto supera 19 caracteres con espacios (ej. "COORDINADOR DE SERVICIOS ESPECIALES"),
 *   lo equilibra automáticamente en 2 líneas centradas.
 */
function splitTextIntoLines(rawText, autoWrapLong = false) {
    if (!rawText) return ['A'];
    // 1. Saltos de línea reales por presionar Enter en textarea
    if (rawText.includes('\n')) {
        const lines = rawText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (lines.length > 0) return lines;
    }
    // 2. Divisores manuales '/' o '|'
    if (rawText.includes('/') || rawText.includes('|')) {
        const parts = rawText.split(/[\/|]/).map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
            return parts;
        }
    }
    // 3. Auto-wrap opcional para rótulos largos
    if (autoWrapLong && rawText.length > 19 && rawText.includes(' ')) {
        const words = rawText.split(/\s+/);
        if (words.length >= 2) {
            const mid = rawText.length / 2;
            let bestSplitIdx = 1;
            let bestDiff = Infinity;
            for (let i = 1; i < words.length; i++) {
                const l1 = words.slice(0, i).join(' ');
                const diff = Math.abs(l1.length - mid);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestSplitIdx = i;
                }
            }
            return [
                words.slice(0, bestSplitIdx).join(' '),
                words.slice(bestSplitIdx).join(' ')
            ];
        }
    }
    return [rawText];
}

/**
 * Construye los glifos 3D individuales de una línea de texto alineados a la línea base de 'H'
 */
function buildLineGlyphItems(otFont, textStr, letterSize, targetZ, bevelSize, spacing) {
    const refGeo = createUTF8CharExtrudeGeometry(otFont, 'H', letterSize, 2, 0);
    const refBaselineMinY = refGeo ? refGeo.boundingBox.min.y : 0;
    const refCapHeight = refGeo ? (refGeo.boundingBox.max.y - refGeo.boundingBox.min.y) : letterSize;
    if (refGeo) refGeo.dispose();

    const items = [];
    let totalW = 0;
    const chars = Array.from(textStr);

    chars.forEach((ch, idx) => {
        if (ch === ' ') {
            const spW = letterSize * 0.38;
            items.push({ isSpace: true, width: spW, height: letterSize });
            totalW += spW;
            return;
        }
        const charGeo = createUTF8CharExtrudeGeometry(otFont, ch, letterSize, targetZ, bevelSize);
        if (!charGeo) {
            const spW = letterSize * 0.36;
            items.push({ isSpace: true, width: spW, height: letterSize });
            totalW += spW;
            return;
        }
        const bb = charGeo.boundingBox;
        const w = bb.max.x - bb.min.x;
        const h = bb.max.y - bb.min.y;
        charGeo.translate(-bb.min.x - w / 2, -refBaselineMinY - refCapHeight / 2, 0);

        items.push({
            isSpace: false,
            char: ch,
            idx,
            geometry: charGeo,
            width: w,
            height: h
        });
        totalW += w + spacing;
    });

    if (items.length > 0 && !items[items.length - 1].isSpace) {
        totalW = Math.max(10, totalW - spacing);
    }

    return { items, totalW, refCapHeight };
}

let rebuildGenerationId = 0;

/**
 * Reconstruye el modelo CAD 3D completo según los parámetros paramétricos actuales
 */
export async function rebuildSignCAD() {
    const myBuildId = ++rebuildGenerationId;
    const fontSelect = document.getElementById('param-font');
    if (!fontSelect) return;
    const fontKey = fontSelect.value;
    const fontHelper = document.getElementById('font-desc-helper');
    if (fontHelper && institutionalFonts[fontKey]) {
        fontHelper.textContent = institutionalFonts[fontKey].desc;
    }

    const otFont = await ensureFontLoaded(fontKey);
    if (!otFont || myBuildId !== rebuildGenerationId) return;

    const rawText = (document.getElementById('sign-text')?.value || 'INVESTIGACIÓN').toUpperCase().trim() || 'A';
    const subText = (document.getElementById('sign-subtext')?.value || '').toUpperCase().trim();
    const showSub = document.getElementById('show-subtext')?.checked ?? false;
    const stagger = document.getElementById('stagger-toggle')?.checked ?? true;
    const includeRail = document.getElementById('stand-rail-toggle')?.checked ?? true;

    const letterSize = parseFloat(document.getElementById('param-letter-size')?.value || 36);
    const baseDepth = parseFloat(document.getElementById('param-base-depth')?.value || 6);
    const letterDepth = parseFloat(document.getElementById('param-letter-depth')?.value || 5);
    const bevelSize = parseFloat(document.getElementById('param-bevel')?.value || 0.8);
    const spacing = parseFloat(document.getElementById('param-spacing')?.value || 4);

    // Actualizar etiquetas numéricas en UI
    updateParamLabels(letterSize, baseDepth, letterDepth, bevelSize, spacing);

    // Desplazamiento fino manual del texto (Horizontal X y Vertical Y)
    const userTextOffsetX = parseFloat(document.getElementById('param-text-offset-x')?.value || 0);
    const userTextOffsetY = parseFloat(document.getElementById('param-text-offset-y')?.value || 0);
    const lblTextOffsetX = document.getElementById('lbl-text-offset-x');
    if (lblTextOffsetX) {
        lblTextOffsetX.textContent = `${userTextOffsetX >= 0 ? '+' : ''}${userTextOffsetX} mm`;
    }
    const lblTextOffsetY = document.getElementById('lbl-text-offset-y');
    if (lblTextOffsetY) {
        lblTextOffsetY.textContent = `${userTextOffsetY >= 0 ? '+' : ''}${userTextOffsetY} mm`;
    }

    const faceHex = document.getElementById('color-face')?.value || '#f5f5f0';
    const accentHex = document.getElementById('color-accent')?.value || '#b07d4f';
    const baseHex = document.getElementById('color-base')?.value || '#1e242b';

    const matFace = new THREE.MeshStandardMaterial({
        color: new THREE.Color(faceHex),
        roughness: 0.42,
        metalness: 0.08,
        wireframe: cadState.wireframe
    });
    const matAccent = new THREE.MeshStandardMaterial({
        color: new THREE.Color(accentHex),
        roughness: 0.38,
        metalness: 0.18,
        wireframe: cadState.wireframe
    });
    const matBase = new THREE.MeshStandardMaterial({
        color: new THREE.Color(baseHex),
        roughness: 0.65,
        metalness: 0.05,
        wireframe: cadState.wireframe
    });

    // Parámetros y material independientes del texto secundario / subtítulo
    const subOptionsPanel = document.getElementById('subtext-options-panel');
    if (subOptionsPanel) {
        subOptionsPanel.classList.toggle('hidden', !showSub);
    }

    const subFontKey = document.getElementById('param-sub-font')?.value || fontKey;
    const subHex = document.getElementById('color-subtext')?.value || accentHex;
    const subColorLabel = document.getElementById('lbl-color-subtext');
    if (subColorLabel) subColorLabel.textContent = subHex.toUpperCase();

    const subSizeInput = document.getElementById('param-sub-size');
    const subSizeVal = subSizeInput ? parseFloat(subSizeInput.value) : Math.max(8, Math.round(letterSize * 0.28));
    const subSizeLabel = document.getElementById('lbl-sub-size');
    if (subSizeLabel) subSizeLabel.textContent = `${subSizeVal} mm`;

    const subGapInput = document.getElementById('param-sub-gap');
    const subGapVal = subGapInput ? parseFloat(subGapInput.value) : 0;
    const subGapLabel = document.getElementById('lbl-sub-gap');
    if (subGapLabel) subGapLabel.textContent = `${subGapVal >= 0 ? '+' : ''}${subGapVal} mm`;

    const subOtFont = await ensureFontLoaded(subFontKey);
    if (myBuildId !== rebuildGenerationId) return;

    clearGroupGeometries(baseGroup);
    clearGroupGeometries(accentsGroup);
    clearGroupGeometries(lettersGroup);

    const matSubText = new THREE.MeshStandardMaterial({
        color: new THREE.Color(subHex),
        roughness: 0.42,
        metalness: 0.1,
        wireframe: cadState.wireframe
    });

    // Letra de referencia ('H') para alinear todas las líneas base de glifos
    const refGeo = createUTF8CharExtrudeGeometry(otFont, 'H', letterSize, 2, 0);
    const refBaselineMinY = refGeo ? refGeo.boundingBox.min.y : 0;
    const refCapHeight = refGeo ? (refGeo.boundingBox.max.y - refGeo.boundingBox.min.y) : letterSize;
    if (refGeo) refGeo.dispose();

    const chars = Array.from(rawText.replace(/[\/|]/g, ' '));
    const letterItems = [];

    chars.forEach((ch, idx) => {
        if (ch === ' ') {
            letterItems.push({ isSpace: true, width: letterSize * 0.42, height: letterSize });
            return;
        }

        const isDropCap = (cadState.style === 'filigree' && idx === 0);
        const charSize = isDropCap ? letterSize * 1.24 : letterSize;
        const targetZ = letterDepth;

        const charGeo = createUTF8CharExtrudeGeometry(otFont, ch, charSize, targetZ, bevelSize);
        if (!charGeo) {
            letterItems.push({ isSpace: true, width: letterSize * 0.4, height: letterSize });
            return;
        }

        const bb = charGeo.boundingBox;
        const w = bb.max.x - bb.min.x;
        const h = bb.max.y - bb.min.y;

        // Centrado horizontal y alineación vertical estricta a línea base
        charGeo.translate(-bb.min.x - w / 2, -refBaselineMinY - refCapHeight / 2, 0);

        letterItems.push({
            isSpace: false,
            char: ch,
            idx: idx,
            isDropCap: isDropCap,
            geometry: charGeo,
            width: w,
            height: h
        });
    });

    const explodeZ = cadState.explodedView ? 18 : 0;

    // Ocultar paneles condicionales por defecto y activar según estilo
    const plaquePanelEl = document.getElementById('plaque-options-panel');
    const wedgePanelEl = document.getElementById('wedge-options-panel');
    const ceilingPanelEl = document.getElementById('ceiling-options-panel');
    const logosPanelEl = document.getElementById('institutional-logos-panel');
    const supportsInstitutionalLogos = (cadState.style === 'ceiling' || cadState.style === 'wedge' || cadState.style === 'plaque');

    if (plaquePanelEl) plaquePanelEl.classList.toggle('hidden', cadState.style !== 'plaque');
    if (wedgePanelEl) wedgePanelEl.classList.toggle('hidden', cadState.style !== 'wedge');
    if (ceilingPanelEl) ceilingPanelEl.classList.toggle('hidden', cadState.style !== 'ceiling');
    if (logosPanelEl) logosPanelEl.classList.toggle('hidden', !supportsInstitutionalLogos);

    // Parámetros de Escudos Institucionales (USAC & Biblioteca Central BC)
    const logoMode = supportsInstitutionalLogos
        ? (document.getElementById('logo-mode-select')?.value || 'none')
        : 'none';
    const leftLogoKey = document.getElementById('logo-left-select')?.value || 'usac';
    const rightLogoKey = document.getElementById('logo-right-select')?.value || 'biblioteca';
    const logoSizeVal = parseFloat(document.getElementById('param-logo-size')?.value || 40);
    const showSeparateOnBed = document.getElementById('logo-show-separate-toggle')?.checked ?? true;

    const lblLogoSize = document.getElementById('lbl-logo-size');
    if (lblLogoSize) lblLogoSize.textContent = `${Math.round(logoSizeVal)} mm`;
    const logoControlsSubpanel = document.getElementById('logo-active-controls');
    if (logoControlsSubpanel) logoControlsSubpanel.classList.toggle('hidden', logoMode === 'none');
    const separateToggleRow = document.getElementById('logo-separate-bed-row');
    if (separateToggleRow) {
        separateToggleRow.classList.toggle('hidden', !(logoMode === 'socket_separate' || logoMode === 'medallions_only'));
    }

    const placeOnSign = (logoMode === 'integrated' || logoMode === 'socket_separate');
    const hasLeftOnSign = placeOnSign && leftLogoKey !== 'none';
    const hasRightOnSign = placeOnSign && rightLogoKey !== 'none';
    let activeTextShiftX = 0;

    // =====================================================================
    // ESTILO 1: BLOQUES MODULARES (MAKER) — INTACTO
    // =====================================================================
    if (cadState.style === 'modular') {
        let cursorX = 0;
        const blockPadX = 10;
        const blockH = letterSize * 1.62;

        letterItems.forEach((item, idx) => {
            if (item.isSpace) {
                cursorX += item.width;
                return;
            }

            const blockW = Math.max(item.width + blockPadX * 2, letterSize * 1.02);
            const centerX = cursorX + blockW / 2;

            const offsetY = stagger ? (idx % 2 === 0 ? 4.0 : -4.0) : 0;
            const extraBaseZ = stagger ? (idx % 2 === 0 ? 1.8 : 0) : 0;
            const thisBaseDepth = baseDepth + extraBaseZ;

            const blockGeo = createChamferedBoxGeometry(blockW, blockH, thisBaseDepth, 2.2);
            blockGeo.translate(centerX, offsetY, 0);

            const isAccentBlock = (idx === 0 && stagger);
            const blockMat = cadState.useMultiColor
                ? new THREE.MeshStandardMaterial({ color: cadState.multiColors[idx % cadState.multiColors.length], roughness: 0.55, wireframe: cadState.wireframe })
                : (isAccentBlock ? matAccent : matBase);

            const blockMesh = new THREE.Mesh(blockGeo, blockMat);
            blockMesh.name = `Bloque_${idx + 1}_${item.char}`;
            blockMesh.castShadow = true;
            blockMesh.receiveShadow = true;

            if (isAccentBlock || (cadState.useMultiColor && idx % 2 === 1)) {
                accentsGroup.add(blockMesh);
            } else {
                baseGroup.add(blockMesh);
            }

            item.geometry.translate(centerX, offsetY - (letterSize * 0.06), thisBaseDepth + explodeZ);
            const letterMesh = new THREE.Mesh(item.geometry, matFace);
            letterMesh.name = `Letra_${idx + 1}_${item.char}`;
            letterMesh.castShadow = true;
            lettersGroup.add(letterMesh);

            cursorX += blockW + (spacing - 3);
        });

        if (includeRail && cursorX > 10) {
            const railW = cursorX - (spacing - 3) - 6;
            const railGeo = new THREE.BoxGeometry(railW, blockH * 0.42, Math.max(3, baseDepth * 0.6));
            railGeo.translate(railW / 2 + 3, 0, Math.max(1.5, baseDepth * 0.3));
            const railMesh = new THREE.Mesh(railGeo, matBase);
            railMesh.name = "Riel_Union_Trasero";
            baseGroup.add(railMesh);
        }
    }

    // =====================================================================
    // ESTILO 2 REDISEÑADO: CORPÓREO ABC (Monolitos Escalonados & Pedestal Arquitectónico)
    // =====================================================================
    else if (cadState.style === 'solid') {
        let cursorX = 0;
        const padX = 6.5;
        const baseMonoH = letterSize * 1.46;
        const collarDepth = Math.max(1.4, letterDepth * 0.32);
        const plinthY = -baseMonoH / 2 - 2.0;

        letterItems.forEach((item, idx) => {
            if (item.isSpace) {
                cursorX += item.width * 0.85;
                return;
            }

            const monoW = Math.max(item.width + padX * 2, letterSize * 0.82);
            const extraH = stagger ? (idx % 2 === 0 ? 5.0 : 0) : 0;
            const monoH = baseMonoH + extraH;
            const extraZ = stagger ? (idx % 2 === 0 ? 1.8 : 0) : 0;
            const thisBaseDepth = baseDepth + extraZ;

            const centerX = cursorX + monoW / 2;
            // Alinear la base de todos los monolitos sobre el pedestal inferior
            const centerY = plinthY + monoH / 2;

            const monolith = createSolidMonolithBlock(monoW, monoH, thisBaseDepth, collarDepth);
            monolith.baseGeo.translate(centerX, centerY, 0);
            monolith.collarGeo.translate(centerX, centerY, explodeZ * 0.45);

            const pillarMesh = new THREE.Mesh(monolith.baseGeo, matBase);
            pillarMesh.name = `Monolito_Base_${idx + 1}_${item.char}`;
            pillarMesh.castShadow = true;
            pillarMesh.receiveShadow = true;
            baseGroup.add(pillarMesh);

            const collarMat = cadState.useMultiColor
                ? new THREE.MeshStandardMaterial({ color: cadState.multiColors[idx % cadState.multiColors.length], roughness: 0.42, wireframe: cadState.wireframe })
                : matAccent;
            const collarMesh = new THREE.Mesh(monolith.collarGeo, collarMat);
            collarMesh.name = `Collarin_Acento_${idx + 1}_${item.char}`;
            collarMesh.castShadow = true;
            accentsGroup.add(collarMesh);

            // Letra corpórea en alto relieve sobre el escudo monolítico
            item.geometry.translate(centerX, centerY - letterSize * 0.04, thisBaseDepth + collarDepth * 0.4 + explodeZ);
            const letterMesh = new THREE.Mesh(item.geometry, matFace);
            letterMesh.name = `Letra_Corporea_${idx + 1}_${item.char}`;
            letterMesh.castShadow = true;
            letterMesh.receiveShadow = true;
            lettersGroup.add(letterMesh);

            cursorX += monoW + Math.max(1, spacing - 1.5);
        });

        // Pedestal Arquitectónico Escalonado de Doble Nivel que une sólidamente todos los monolitos
        const stepGap = Math.max(1, spacing - 1.5);
        const totalSpanW = Math.max(40, cursorX - stepGap);
        const plinthH = includeRail ? 15 : 10;
        const plinthCenterX = totalSpanW / 2;

        const plinth = createSteppedPlinthAssembly(totalSpanW, plinthH, baseDepth, collarDepth);
        plinth.baseGeo.translate(plinthCenterX, plinthY - plinthH * 0.15, 0);
        plinth.accentGeo.translate(plinthCenterX, plinthY - plinthH * 0.15, explodeZ * 0.45);

        const plinthBaseMesh = new THREE.Mesh(plinth.baseGeo, matBase);
        plinthBaseMesh.name = "Peana_Arquitectonica_Escalonada";
        plinthBaseMesh.castShadow = true;
        plinthBaseMesh.receiveShadow = true;
        baseGroup.add(plinthBaseMesh);

        const plinthAccentMesh = new THREE.Mesh(plinth.accentGeo, matAccent);
        plinthAccentMesh.name = "Filete_Ejecutivo_Peana";
        plinthAccentMesh.castShadow = true;
        accentsGroup.add(plinthAccentMesh);
    }

    // =====================================================================
    // ESTILO 3 REDISEÑADO: CAPITULAR CLÁSICA (Manuscrito Iluminado & Tabula Ansata Romana)
    // =====================================================================
    else if (cadState.style === 'filigree') {
        let cursorX = 0;
        const nonSpaceItems = letterItems.filter(it => !it.isSpace);

        if (!stagger || nonSpaceItems.length <= 1) {
            // Modo Todas Capitulares: Cada letra lleva su propia Cartela Clásica con Rosetones de 8 pétalos
            letterItems.forEach((item, idx) => {
                if (item.isSpace) {
                    cursorX += item.width;
                    return;
                }
                const blockW = Math.max(item.width + 26, letterSize * 1.52);
                const blockH = letterSize * 1.88;
                const centerX = cursorX + blockW / 2;

                const ornate = createOrnateFrameMeshes(blockW, blockH, baseDepth, letterDepth, matBase, matAccent);
                ornate.baseMeshes.forEach(m => {
                    m.geometry.translate(centerX, 0, 0);
                    m.castShadow = true;
                    baseGroup.add(m);
                });
                ornate.accentMeshes.forEach(m => {
                    m.geometry.translate(centerX, 0, explodeZ * 0.6);
                    m.castShadow = true;
                    accentsGroup.add(m);
                });

                item.geometry.translate(centerX, -letterSize * 0.04, baseDepth + (letterDepth * 0.25) + explodeZ);
                const lMesh = new THREE.Mesh(item.geometry, matFace);
                lMesh.name = `Letra_Capitular_${idx + 1}_${item.char}`;
                lMesh.castShadow = true;
                lettersGroup.add(lMesh);

                cursorX += blockW + spacing;
            });
        } else {
            // Modo Manuscrito Iluminado:
            // 1. Primera letra en Gran Cartela Clásica con Frontón, Pilastras Estriadas y 4 Rosetones Florales
            const firstItem = letterItems[0];
            const dropW = Math.max(firstItem.width + 28, letterSize * 1.62);
            const dropH = letterSize * 1.92;
            const dropCenterX = dropW / 2;

            const ornate = createOrnateFrameMeshes(dropW, dropH, baseDepth * 1.12, letterDepth, matBase, matAccent);
            ornate.baseMeshes.forEach(m => {
                m.geometry.translate(dropCenterX, 0, 0);
                m.castShadow = true;
                baseGroup.add(m);
            });
            ornate.accentMeshes.forEach(m => {
                m.geometry.translate(dropCenterX, 0, explodeZ * 0.6);
                m.castShadow = true;
                accentsGroup.add(m);
            });

            firstItem.geometry.translate(dropCenterX, -letterSize * 0.04, baseDepth * 1.12 + (letterDepth * 0.25) + explodeZ);
            const dropMesh = new THREE.Mesh(firstItem.geometry, matFace);
            dropMesh.name = `Letra_Capitular_1_${firstItem.char}`;
            dropMesh.castShadow = true;
            lettersGroup.add(dropMesh);

            // 2. Resto de las letras unificadas sobre una Placa Romana "Tabula Ansata" con orejeta cola de milano y cornisa
            const bodyStartX = dropW + 10;
            let bodyCursorX = bodyStartX;
            const bodyItems = letterItems.slice(1);

            bodyItems.forEach((item, idx) => {
                if (item.isSpace) {
                    bodyCursorX += item.width;
                    return;
                }
                const centerX = bodyCursorX + item.width / 2;
                const yOffset = showSub && subText ? letterSize * 0.12 : -letterSize * 0.05;
                item.geometry.translate(centerX, yOffset, baseDepth + explodeZ);

                const lMesh = new THREE.Mesh(item.geometry, matFace);
                lMesh.name = `Letra_${idx + 2}_${item.char}`;
                lMesh.castShadow = true;
                lettersGroup.add(lMesh);

                bodyCursorX += item.width + spacing;
            });

            const bodyTextSpan = Math.max(30, bodyCursorX - bodyStartX - spacing);
            const ansaExtraW = 28;
            const ansataW = bodyTextSpan + 24 + ansaExtraW;
            const ansataH = showSub && subText ? letterSize * 1.68 : letterSize * 1.48;
            const ansataCenterX = dropW - 2 + ansataW / 2;

            const tabula = createTabulaAnsataAssembly(ansataW, ansataH, baseDepth, letterDepth, matBase, matAccent);
            tabula.baseMesh.geometry.translate(ansataCenterX, 0, 0);
            tabula.baseMesh.castShadow = true;
            tabula.baseMesh.receiveShadow = true;
            baseGroup.add(tabula.baseMesh);

            tabula.accentMesh.geometry.translate(ansataCenterX, 0, explodeZ * 0.5);
            tabula.accentMesh.castShadow = true;
            accentsGroup.add(tabula.accentMesh);
        }
    }

    // =====================================================================
    // ESTILO 4: PLACA WAYFINDING DEWEY — INTACTO
    // =====================================================================
    else if (cadState.style === 'plaque') {
        const plaquePanel = document.getElementById('plaque-options-panel');
        if (plaquePanel) plaquePanel.classList.remove('hidden');

        // Controles de personalización de la placa de fondo
        const customWidthInput = document.getElementById('param-plaque-width');
        const customHeightInput = document.getElementById('param-plaque-height');
        const radiusInput = document.getElementById('param-plaque-radius');
        const splitToggle = document.getElementById('plaque-split-toggle');
        const gapInput = document.getElementById('param-plaque-gap');
        const offsetInput = document.getElementById('param-plaque-offset');

        const plaqueRadius = radiusInput ? parseFloat(radiusInput.value) : 12;
        const isSplit = splitToggle ? splitToggle.checked : false;
        const splitGap = (isSplit && gapInput) ? parseFloat(gapInput.value) : 0;
        const cutOffsetX = (isSplit && offsetInput) ? parseFloat(offsetInput.value) : 0;

        // Soporte de Múltiples Líneas (Enter en textarea o / o |)
        const plaqueLines = splitTextIntoLines(rawText, false);
        const isMultiLine = plaqueLines.length > 1;

        // Proporción de tamaño si son 2 o más líneas para mantener proporción y elegancia
        const effectiveLetterSize = isMultiLine ? Math.max(12, Math.round(letterSize * 0.78)) : letterSize;

        // Construir glifos 3D de cada línea
        const builtLines = plaqueLines.map(lineStr =>
            buildLineGlyphItems(otFont, lineStr, effectiveLetterSize, letterDepth, bevelSize, spacing)
        );

        // Medir ancho máximo requerido por las líneas
        const maxLineW = Math.max(...builtLines.map(b => b.totalW), 40);
        const padX = 26;
        const accentBarW = 16;
        const accentBarMargin = 5;

        // Altura automática según líneas e inclusión de subtítulo
        const lineStep = effectiveLetterSize * 1.25;
        const totalTextH = (plaqueLines.length - 1) * lineStep + effectiveLetterSize;
        const autoPlaqueH = isMultiLine
            ? Math.round(totalTextH + (showSub && subText ? subSizeVal * 2.2 + subGapVal : 28))
            : Math.round(showSub && subText ? letterSize * 2.15 : letterSize * 1.65);

        const effLogoDia = Math.min(logoSizeVal, Math.max(24, autoPlaqueH - 10));
        const leftReserve = hasLeftOnSign ? (effLogoDia + 14) : 0;
        const rightReserve = hasRightOnSign ? (effLogoDia + 14) : 0;

        // CENTRADO EXACTO ENTRE OBSTÁCULOS:
        // A la izquierda: barra Dewey (16 mm + 5 mm) + reserva de escudo izquierdo si existe
        // A la derecha: reserva de escudo derecho si existe
        const leftObstacle = accentBarW + accentBarMargin + leftReserve;
        const rightObstacle = rightReserve;
        const autoCenterShiftX = (leftObstacle - rightObstacle) / 2;

        activeTextShiftX = autoCenterShiftX;

        const autoPlaqueW = Math.round(maxLineW + padX * 2 + accentBarW + leftReserve + rightReserve);

        // Si el slider no ha sido ajustado manualmente por el usuario o es menor al texto, adaptarse al texto
        if (customWidthInput && (!customWidthInput.dataset.touched || parseFloat(customWidthInput.value) < autoPlaqueW)) {
            customWidthInput.min = Math.min(100, autoPlaqueW);
            customWidthInput.value = autoPlaqueW;
        }
        if (customHeightInput && (!customHeightInput.dataset.touched || parseFloat(customHeightInput.value) < autoPlaqueH)) {
            customHeightInput.value = autoPlaqueH;
        }

        const plaqueW = customWidthInput ? parseFloat(customWidthInput.value) : autoPlaqueW;
        const plaqueH = customHeightInput ? parseFloat(customHeightInput.value) : autoPlaqueH;

        // Actualizar valores en pantalla
        const lblW = document.getElementById('lbl-plaque-width');
        const lblH = document.getElementById('lbl-plaque-height');
        const lblR = document.getElementById('lbl-plaque-radius');
        const lblGap = document.getElementById('lbl-plaque-gap');
        const lblOffset = document.getElementById('lbl-plaque-offset');

        if (lblW) lblW.textContent = `${Math.round(plaqueW)} mm`;
        if (lblH) lblH.textContent = `${Math.round(plaqueH)} mm`;
        if (lblR) lblR.textContent = `${plaqueRadius} mm`;
        if (lblGap) lblGap.textContent = `${splitGap} mm`;
        if (lblOffset) lblOffset.textContent = `${cutOffsetX >= 0 ? '+' : ''}${cutOffsetX} mm`;

        const centerPlaqueX = maxLineW / 2;
        const cutWorldX = centerPlaqueX + cutOffsetX;

        // Centro objetivo para las líneas de texto (combinando auto-centrado y desplazamiento manual del usuario)
        const textTargetCenterX = centerPlaqueX + autoCenterShiftX + userTextOffsetX;

        // Colocar cada línea de texto centrada horizontalmente
        let globalCharIdx = 0;
        builtLines.forEach((lineObj, lineIdx) => {
            const lineW = lineObj.totalW;
            let lineCursorX = textTargetCenterX - lineW / 2;

            const lineY = (isMultiLine
                ? ((plaqueLines.length - 1) / 2 - lineIdx) * lineStep + (showSub && subText ? subSizeVal * 0.7 : 0)
                : (showSub && subText ? letterSize * 0.18 : -letterSize * 0.05)
            ) + userTextOffsetY;

            lineObj.items.forEach(item => {
                if (item.isSpace) {
                    lineCursorX += item.width;
                    return;
                }
                const centerX = lineCursorX + item.width / 2;
                const onLeft = centerX < cutWorldX;
                const shiftX = isSplit ? (onLeft ? -splitGap / 2 : splitGap / 2) : 0;

                item.geometry.translate(centerX + shiftX, lineY, baseDepth + explodeZ);

                const lMat = cadState.useMultiColor
                    ? new THREE.MeshStandardMaterial({
                        color: cadState.multiColors[globalCharIdx % cadState.multiColors.length],
                        roughness: 0.45,
                        wireframe: cadState.wireframe
                    })
                    : matFace;

                const lMesh = new THREE.Mesh(item.geometry, lMat);
                lMesh.name = `Letra_L${lineIdx + 1}_${globalCharIdx + 1}_${item.char}_${onLeft ? 'Parte1' : 'Parte2'}`;
                lMesh.castShadow = true;
                lettersGroup.add(lMesh);

                lineCursorX += item.width + spacing;
                globalCharIdx++;
            });
        });

        // Placa base
        if (!isSplit) {
            // Placa continua con bordes bien redonditos
            const plaqueGeo = createRoundedBoxGeometry(plaqueW, plaqueH, baseDepth, plaqueRadius);
            plaqueGeo.translate(centerPlaqueX, 0, 0);
            const plaqueMesh = new THREE.Mesh(plaqueGeo, matBase);
            plaqueMesh.name = "Placa_Base_Institucional";
            plaqueMesh.castShadow = true;
            plaqueMesh.receiveShadow = true;
            baseGroup.add(plaqueMesh);

            // Barra decorativa izquierda también con esquinas redondeadas
            const barGeo = createRoundedBoxGeometry(accentBarW, plaqueH - 8, letterDepth * 0.8, Math.min(plaqueRadius * 0.6, 6));
            barGeo.translate(centerPlaqueX - plaqueW / 2 + accentBarW / 2 + 5, 0, baseDepth + explodeZ * 0.5);
            const barMesh = new THREE.Mesh(barGeo, matAccent);
            barMesh.name = "Barra_Codigo_Dewey";
            barMesh.castShadow = true;
            accentsGroup.add(barMesh);
        } else {
            // Mitad izquierda con conector macho de rompecabezas
            const leftGeo = createLeftPuzzlePlaque(plaqueW, plaqueH, baseDepth, plaqueRadius, 24, 14, 14, cutOffsetX);
            leftGeo.translate(centerPlaqueX - splitGap / 2, 0, 0);
            const leftMesh = new THREE.Mesh(leftGeo, matBase);
            leftMesh.name = "Placa_Parte1_Izquierda_Macho";
            leftMesh.castShadow = true;
            leftMesh.receiveShadow = true;
            baseGroup.add(leftMesh);

            // Mitad derecha con cavidad hembra de rompecabezas (tolerancia 0.28 mm)
            const rightGeo = createRightPuzzlePlaque(plaqueW, plaqueH, baseDepth, plaqueRadius, 24, 14, 14, cutOffsetX, 0.28);
            rightGeo.translate(centerPlaqueX + splitGap / 2, 0, 0);
            const rightMesh = new THREE.Mesh(rightGeo, matBase);
            rightMesh.name = "Placa_Parte2_Derecha_Hembra";
            rightMesh.castShadow = true;
            rightMesh.receiveShadow = true;
            baseGroup.add(rightMesh);

            // Barra decorativa izquierda (sigue a la mitad izquierda)
            const barGeo = createRoundedBoxGeometry(accentBarW, plaqueH - 8, letterDepth * 0.8, Math.min(plaqueRadius * 0.6, 6));
            barGeo.translate(centerPlaqueX - plaqueW / 2 + accentBarW / 2 + 5 - splitGap / 2, 0, baseDepth + explodeZ * 0.5);
            const barMesh = new THREE.Mesh(barGeo, matAccent);
            barMesh.name = "Barra_Codigo_Dewey";
            barMesh.castShadow = true;
            accentsGroup.add(barMesh);
        }

        // Integrar Escudos Institucionales o Cajeados Guía en Placa Wayfinding
        const addPlaqueSideLogo = (key, side) => {
            const isLeftSide = side === 'left';
            const lx = isLeftSide
                ? (centerPlaqueX - plaqueW / 2 + accentBarW + 13 + effLogoDia / 2)
                : (centerPlaqueX + plaqueW / 2 - 10 - effLogoDia / 2);
            const onLeftHalf = lx < cutWorldX;
            const shiftX = isSplit ? (onLeftHalf ? -splitGap / 2 : splitGap / 2) : 0;

            if (logoMode === 'integrated') {
                const logoZ = key === 'usac' ? 1.15 : Math.max(1.5, letterDepth * 0.62);
                const lGeo = getInstitutionalLogoGeometry(key, effLogoDia, logoZ);
                if (lGeo) {
                    lGeo.translate(lx + shiftX, 0, baseDepth + explodeZ * 0.6);
                    const m = new THREE.Mesh(lGeo, matAccent);
                    m.name = `Escudo_${key.toUpperCase()}_${isLeftSide ? 'Izquierda_Parte1' : 'Derecha_Parte2'}`;
                    m.castShadow = true;
                    accentsGroup.add(m);
                }
            } else if (logoMode === 'socket_separate') {
                const sGeo = createRecessedLogoSocketGeometry(effLogoDia, 1.3, 0.28);
                sGeo.translate(lx + shiftX, 0, baseDepth + explodeZ * 0.35);
                const m = new THREE.Mesh(sGeo, matAccent);
                m.name = `Guia_Encastre_${key.toUpperCase()}_${isLeftSide ? 'Izquierda_Parte1' : 'Derecha_Parte2'}`;
                m.castShadow = true;
                accentsGroup.add(m);
            }
        };
        if (hasLeftOnSign) addPlaqueSideLogo(leftLogoKey, 'left');
        if (hasRightOnSign) addPlaqueSideLogo(rightLogoKey, 'right');
    }

    // =====================================================================
    // ESTILO 5 CORREGIDO: CANTO DE ANAQUEL (Pinza trasera en dirección -Z, opuesta a las letras)
    // =====================================================================
    else if (cadState.style === 'shelf_clip') {
        let cursorX = 0;
        const totalW_approx = letterItems.reduce((acc, it) => acc + (it.isSpace ? it.width : it.width + spacing), 0);
        const padX = 24;
        const clipW = Math.max(totalW_approx + padX * 2, 80);
        // Asegurar alto mínimo de 32 mm para alojar detrás la pinza de balda de 19 mm
        const clipH = Math.max(32, showSub && subText ? letterSize * 1.95 : letterSize * 1.45);
        const centerClipX = (totalW_approx - spacing) / 2;

        letterItems.forEach((item, idx) => {
            if (item.isSpace) {
                cursorX += item.width;
                return;
            }
            const centerX = cursorX + item.width / 2;
            const yOffset = showSub && subText ? letterSize * 0.16 : 0;
            item.geometry.translate(centerX, yOffset, baseDepth + explodeZ);

            const lMesh = new THREE.Mesh(item.geometry, matFace);
            lMesh.name = `Letra_${idx + 1}_${item.char}`;
            lMesh.castShadow = true;
            lettersGroup.add(lMesh);

            cursorX += item.width + spacing;
        });

        // Crear ensamble con placa frontal (+Z) y pinza en 'C' trasera (-Z, opuesta a las letras)
        const assembly = createShelfClipAssembly(clipW, clipH, baseDepth, 28, 19.2);
        assembly.baseGeo.translate(centerClipX, 0, 0);
        assembly.frameGeo.translate(centerClipX, 0, explodeZ * 0.5);

        const baseMesh = new THREE.Mesh(assembly.baseGeo, matBase);
        baseMesh.name = "Canto_Anaquel_Base";
        baseMesh.castShadow = true;
        baseMesh.receiveShadow = true;
        baseGroup.add(baseMesh);

        const frameMesh = new THREE.Mesh(assembly.frameGeo, matAccent);
        frameMesh.name = "Canto_Anaquel_Marco";
        frameMesh.castShadow = true;
        accentsGroup.add(frameMesh);
    }

    // =====================================================================
    // ESTILO 6 REDISEÑADO: CUÑA EJECUTIVA DE ESCRITORIO (Menos inclinada para Coordinadores y Jefatura)
    // =====================================================================
    else if (cadState.style === 'wedge') {
        // Liberar geometrías de 1 línea no usadas si se reconstruyen en multilínea
        letterItems.forEach(it => { if (it.geometry) it.geometry.dispose(); });

        const angleInput = document.getElementById('param-wedge-angle');
        const angleDeg = angleInput ? parseFloat(angleInput.value) : 12;
        const lblAngle = document.getElementById('lbl-wedge-angle');
        if (lblAngle) lblAngle.textContent = `${angleDeg}° (Suave Escritorio)`;

        const multiToggle = document.getElementById('wedge-multiline-toggle');
        const autoWrap = multiToggle ? multiToggle.checked : true;
        const textLines = splitTextIntoLines(rawText, autoWrap);
        const isTwoLines = textLines.length >= 2;

        // Ajustar tamaño de letra si son 2 líneas para que luzca proporcionado en escritorio
        const effectiveLetterSize = isTwoLines ? Math.max(12, Math.round(letterSize * 0.72)) : letterSize;
        const builtLines = textLines.map(lineStr =>
            buildLineGlyphItems(otFont, lineStr, effectiveLetterSize, letterDepth, bevelSize, spacing * 0.85)
        );

        const baseWedgeH = isTwoLines
            ? (showSub && subText ? letterSize * 2.45 : letterSize * 2.05)
            : (showSub && subText ? letterSize * 2.05 : letterSize * 1.58);
        const wedgeH = Math.max(46, baseWedgeH);

        const effLogoDia = Math.min(logoSizeVal, Math.max(24, wedgeH - 12));
        const leftReserve = hasLeftOnSign ? (effLogoDia + 12) : 0;
        const rightReserve = hasRightOnSign ? (effLogoDia + 12) : 0;
        activeTextShiftX = (leftReserve - rightReserve) / 2;

        const maxRawLineW = Math.max(...builtLines.map(b => b.totalW), 50);
        // Mantener el ancho total de la cuña dentro de ~242 mm para que quepa en la cama de 25 cm incluso con 2 escudos
        const maxAllowedTextW = Math.max(92, 206 - (leftReserve + rightReserve) * 0.82);
        const fitScale = maxRawLineW > maxAllowedTextW ? (maxAllowedTextW / maxRawLineW) : 1.0;
        const finalTextW = maxRawLineW * fitScale;

        const padX = 28;
        const wedgeW = Math.max(finalTextW + padX * 2 + leftReserve + rightReserve, 120);
        const centerWedgeX = 0;

        const alphaRad = (angleDeg * Math.PI) / 180;
        const frontLipZ = Math.max(4.2, baseDepth * 0.72);
        const backHeightZ = frontLipZ + wedgeH * Math.tan(alphaRad);

        const assembly = createAngledWedgeAssembly(wedgeW, wedgeH, frontLipZ, backHeightZ);
        assembly.baseGeo.translate(centerWedgeX, 0, 0);

        const baseMesh = new THREE.Mesh(assembly.baseGeo, matBase);
        baseMesh.name = "Cuna_Ejecutiva_Escritorio_Base";
        baseMesh.castShadow = true;
        baseMesh.receiveShadow = true;
        baseGroup.add(baseMesh);

        if (assembly.frameGeo) {
            assembly.frameGeo.translate(centerWedgeX, 0, explodeZ * 0.45);
            const frameMesh = new THREE.Mesh(assembly.frameGeo, matAccent);
            frameMesh.name = "Marco_Ejecutivo_Cuna";
            frameMesh.castShadow = true;
            accentsGroup.add(frameMesh);
        }

        // Integrar Escudos Institucionales o Cajeados Guía sobre la rampa inclinada de la Cuña Ejecutiva
        const addWedgeSideLogo = (key, side) => {
            const isLeftSide = side === 'left';
            const lx = isLeftSide
                ? (-wedgeW / 2 + 15 + effLogoDia / 2)
                : (wedgeW / 2 - 15 - effLogoDia / 2);
            const ly = 0;
            const lz = frontLipZ + (ly + assembly.hy) * assembly.tanAlpha;

            if (logoMode === 'integrated') {
                const logoZ = key === 'usac' ? 1.15 : Math.max(1.5, letterDepth * 0.62);
                const lGeo = getInstitutionalLogoGeometry(key, effLogoDia, logoZ);
                if (lGeo) {
                    lGeo.rotateX(assembly.alpha);
                    lGeo.translate(lx, ly, lz + explodeZ * 0.6);
                    const m = new THREE.Mesh(lGeo, matAccent);
                    m.name = `Escudo_Cuna_${key.toUpperCase()}_${isLeftSide ? 'Izq' : 'Der'}`;
                    m.castShadow = true;
                    accentsGroup.add(m);
                }
            } else if (logoMode === 'socket_separate') {
                const sGeo = createRecessedLogoSocketGeometry(effLogoDia, 1.3, 0.28);
                sGeo.rotateX(assembly.alpha);
                sGeo.translate(lx, ly, lz + explodeZ * 0.35);
                const m = new THREE.Mesh(sGeo, matAccent);
                m.name = `Guia_Encastre_Cuna_${key.toUpperCase()}_${isLeftSide ? 'Izq' : 'Der'}`;
                m.castShadow = true;
                accentsGroup.add(m);
            }
        };
        if (hasLeftOnSign) addWedgeSideLogo(leftLogoKey, 'left');
        if (hasRightOnSign) addWedgeSideLogo(rightLogoKey, 'right');

        // Posicionar 1 o 2 líneas de letras apoyadas exactamente sobre la rampa de ángulo suave
        const scaledCapH = effectiveLetterSize * fitScale;
        const lineStepY = scaledCapH * 1.38;
        const blockCenterY = (showSub && subText) ? (wedgeH * 0.14) : 0;

        builtLines.forEach((lineObj, lineIdx) => {
            const lineW = lineObj.totalW * fitScale;
            let cursorX = -lineW / 2 + activeTextShiftX;
            const lineY = isTwoLines
                ? (blockCenterY + (0.5 - lineIdx) * lineStepY)
                : blockCenterY;
            const lineZ = frontLipZ + (lineY + assembly.hy) * assembly.tanAlpha;

            lineObj.items.forEach((item, idx) => {
                if (item.isSpace) {
                    cursorX += item.width * fitScale;
                    return;
                }
                if (fitScale < 0.999) {
                    item.geometry.scale(fitScale, fitScale, 1.0);
                }
                const charW = item.width * fitScale;
                const centerX = cursorX + charW / 2;

                item.geometry.rotateX(assembly.alpha);
                item.geometry.translate(centerX, lineY, lineZ + explodeZ);

                const lMesh = new THREE.Mesh(item.geometry, matFace);
                lMesh.name = `Letra_L${lineIdx + 1}_${idx + 1}_${item.char}`;
                lMesh.castShadow = true;
                lettersGroup.add(lMesh);

                cursorX += charW + (spacing * 0.85 * fitScale);
            });
        });
    }

    // =====================================================================
    // NUEVO ESTILO 7: COLGANTE DE TECHO (Rieles Superior/Inferior + Argollas Tensores de Techo)
    // =====================================================================
    else if (cadState.style === 'ceiling') {
        letterItems.forEach(it => { if (it.geometry) it.geometry.dispose(); });

        const customWidthInput = document.getElementById('param-ceiling-width');
        const customHeightInput = document.getElementById('param-ceiling-height');
        const splitToggle = document.getElementById('ceiling-split-toggle');
        const gapInput = document.getElementById('param-ceiling-gap');
        const offsetInput = document.getElementById('param-ceiling-offset');

        const isSplit = splitToggle ? splitToggle.checked : false;
        const splitGap = (isSplit && gapInput) ? parseFloat(gapInput.value) : 0;
        const cutOffsetX = (isSplit && offsetInput) ? parseFloat(offsetInput.value) : 0;

        // Dividir texto en 1 o 2 líneas centradas (como "Sección / de Periódicos" o "Folletos / Sección Guatemala")
        const textLines = splitTextIntoLines(rawText, true);
        const isTwoLines = textLines.length >= 2;
        const effectiveLetterSize = isTwoLines ? Math.max(12, Math.round(letterSize * 0.76)) : letterSize;

        const builtLines = textLines.map(lineStr =>
            buildLineGlyphItems(otFont, lineStr, effectiveLetterSize, letterDepth, bevelSize, spacing * 0.88)
        );

        const autoPanelH = Math.max(78, Math.round(
            isTwoLines
                ? (showSub && subText ? letterSize * 2.75 : letterSize * 2.35)
                : (showSub && subText ? letterSize * 2.3 : letterSize * 1.95)
        ));
        if (customHeightInput && (!customHeightInput.dataset.touched || parseFloat(customHeightInput.value) < autoPanelH)) {
            customHeightInput.value = autoPanelH;
        }
        const panelH = customHeightInput ? parseFloat(customHeightInput.value) : autoPanelH;

        const effLogoDia = Math.min(logoSizeVal, Math.max(26, panelH - 18));
        const leftReserve = hasLeftOnSign ? (effLogoDia + 14) : 0;
        const rightReserve = hasRightOnSign ? (effLogoDia + 14) : 0;
        activeTextShiftX = (leftReserve - rightReserve) / 2;

        const maxRawLineW = Math.max(...builtLines.map(b => b.totalW), 60);
        const maxTargetW = isSplit
            ? Math.max(140, 390 - leftReserve - rightReserve)
            : Math.max(92, 212 - (leftReserve + rightReserve) * 0.82);
        const fitScale = maxRawLineW > maxTargetW ? (maxTargetW / maxRawLineW) : 1.0;
        const finalTextW = maxRawLineW * fitScale;

        const autoPanelW = Math.max(160, Math.round(finalTextW + 38 + leftReserve + rightReserve));

        if (customWidthInput && (!customWidthInput.dataset.touched || parseFloat(customWidthInput.value) < autoPanelW)) {
            customWidthInput.value = autoPanelW;
        }

        const panelW = customWidthInput ? parseFloat(customWidthInput.value) : autoPanelW;

        const lblCW = document.getElementById('lbl-ceiling-width');
        const lblCH = document.getElementById('lbl-ceiling-height');
        const lblCGap = document.getElementById('lbl-ceiling-gap');
        const lblCOff = document.getElementById('lbl-ceiling-offset');
        if (lblCW) lblCW.textContent = `${Math.round(panelW)} mm`;
        if (lblCH) lblCH.textContent = `${Math.round(panelH)} mm`;
        if (lblCGap) lblCGap.textContent = `${splitGap} mm`;
        if (lblCOff) lblCOff.textContent = `${cutOffsetX >= 0 ? '+' : ''}${cutOffsetX} mm`;

        const assembly = createCeilingSuspendedAssembly(panelW, panelH, baseDepth, {
            isSplit,
            splitGap,
            cutOffsetX
        });

        assembly.baseMeshesInfo.forEach(info => {
            const m = new THREE.Mesh(info.geo, matBase);
            m.name = info.name;
            m.castShadow = true;
            m.receiveShadow = true;
            baseGroup.add(m);
        });

        assembly.accentGeos.forEach(info => {
            info.geo.translate(0, 0, explodeZ * 0.45);
            const m = new THREE.Mesh(info.geo, matAccent);
            m.name = info.name;
            m.castShadow = true;
            accentsGroup.add(m);
        });

        // Integrar Escudos Institucionales (USAC / Biblioteca Central) o Cajeados Guía a los lados del Colgante de Techo
        const addCeilingSideLogo = (key, side) => {
            const isLeftSide = side === 'left';
            const lx = isLeftSide
                ? (-panelW / 2 + 12 + effLogoDia / 2)
                : (panelW / 2 - 12 - effLogoDia / 2);
            const onLeftHalf = lx < cutOffsetX;
            const shiftX = isSplit ? (onLeftHalf ? -splitGap / 2 : splitGap / 2) : 0;

            if (logoMode === 'integrated') {
                const logoZ = key === 'usac' ? 1.15 : Math.max(1.6, letterDepth * 0.65);
                const lGeo = getInstitutionalLogoGeometry(key, effLogoDia, logoZ);
                if (lGeo) {
                    lGeo.translate(lx + shiftX, 0, baseDepth + explodeZ * 0.6);
                    // En colgante de techo usamos matFace (blanco) o matAccent para máximo contraste sobre fondo índigo
                    const m = new THREE.Mesh(lGeo, matFace);
                    m.name = `Escudo_Techo_${key.toUpperCase()}_${isLeftSide ? 'Izquierda_Parte1' : 'Derecha_Parte2'}`;
                    m.castShadow = true;
                    lettersGroup.add(m);
                }
            } else if (logoMode === 'socket_separate') {
                const sGeo = createRecessedLogoSocketGeometry(effLogoDia, 1.3, 0.28);
                sGeo.translate(lx + shiftX, 0, baseDepth + explodeZ * 0.35);
                const m = new THREE.Mesh(sGeo, matAccent);
                m.name = `Guia_Encastre_Techo_${key.toUpperCase()}_${isLeftSide ? 'Izquierda_Parte1' : 'Derecha_Parte2'}`;
                m.castShadow = true;
                accentsGroup.add(m);
            }
        };
        if (hasLeftOnSign) addCeilingSideLogo(leftLogoKey, 'left');
        if (hasRightOnSign) addCeilingSideLogo(rightLogoKey, 'right');

        // Posicionar las líneas de texto centradas en el panel colgante de techo
        const scaledCapH = effectiveLetterSize * fitScale;
        const lineStepY = scaledCapH * 1.38;
        const blockCenterY = (showSub && subText) ? (panelH * 0.12) : 0;

        builtLines.forEach((lineObj, lineIdx) => {
            const lineW = lineObj.totalW * fitScale;
            let cursorX = -lineW / 2 + activeTextShiftX;
            const lineY = isTwoLines
                ? (blockCenterY + (0.5 - lineIdx) * lineStepY)
                : blockCenterY;

            lineObj.items.forEach((item, idx) => {
                if (item.isSpace) {
                    cursorX += item.width * fitScale;
                    return;
                }
                if (fitScale < 0.999) {
                    item.geometry.scale(fitScale, fitScale, 1.0);
                }
                const charW = item.width * fitScale;
                const centerX = cursorX + charW / 2;
                const onLeft = centerX < cutOffsetX;
                const shiftX = isSplit ? (onLeft ? -splitGap / 2 : splitGap / 2) : 0;

                item.geometry.translate(centerX + shiftX, lineY, baseDepth + explodeZ);

                const lMesh = new THREE.Mesh(item.geometry, matFace);
                lMesh.name = `Letra_L${lineIdx + 1}_${idx + 1}_${item.char}_${onLeft ? 'Parte1' : 'Parte2'}`;
                lMesh.castShadow = true;
                lettersGroup.add(lMesh);

                cursorX += charW + (spacing * 0.88 * fitScale);
            });
        });
    }

    // =====================================================================
    // SUBTÍTULO / CLASIFICACIÓN DEWEY (Personalizable en Fuente, Color, Tamaño e Interlineado)
    // =====================================================================
    if (showSub && subText.length > 0) {
        const subSize = subSizeVal;
        const subDepth = Math.max(2.0, letterDepth * 0.55);
        const subGeo = createUTF8CharExtrudeGeometry(subOtFont || otFont, subText, subSize, subDepth, 0);

        if (subGeo) {
            const sbb = subGeo.boundingBox;
            const sw = sbb.max.x - sbb.min.x;
            const sh = sbb.max.y - sbb.min.y;

            const tempBox = new THREE.Box3().setFromObject(printableRoot);
            const mainCenterX = (tempBox.min.x + tempBox.max.x) / 2 + activeTextShiftX;

            // Manejo específico según el estilo para asegurar que NUNCA flote nada
            if (cadState.style === 'wedge') {
                // En cuña ejecutiva de escritorio: Se rota por el mismo ángulo suave y se coloca en la parte baja de la rampa
                const angleInput = document.getElementById('param-wedge-angle');
                const angleDeg = angleInput ? parseFloat(angleInput.value) : 12;
                const multiToggle = document.getElementById('wedge-multiline-toggle');
                const autoWrap = multiToggle ? multiToggle.checked : true;
                const isTwoLines = splitTextIntoLines(rawText, autoWrap).length >= 2;

                const wedgeH = Math.max(42, isTwoLines ? letterSize * 2.45 : letterSize * 2.05);
                const frontLipZ = Math.max(4.2, baseDepth * 0.72);
                const tanAlpha = Math.tan((angleDeg * Math.PI) / 180);
                const alpha = Math.atan(tanAlpha);
                const hy = wedgeH / 2;

                const subY = -hy + 7.5 + subGapVal;
                const subZ = frontLipZ + (subY + hy) * tanAlpha;

                // Escalar subtítulo si excede el ancho de la cuña
                const maxSubW = Math.max(80, (tempBox.max.x - tempBox.min.x) - 34);
                const subScale = sw > maxSubW ? (maxSubW / sw) : 1.0;
                if (subScale < 0.999) {
                    subGeo.scale(subScale, subScale, 1.0);
                }

                subGeo.rotateX(alpha);
                subGeo.translate((-sbb.min.x - sw / 2) * subScale + mainCenterX, subY, subZ + explodeZ * 0.5);

                const subMesh = new THREE.Mesh(subGeo, matSubText);
                subMesh.name = "Subtitulo_Clasificacion_Dewey";
                accentsGroup.add(subMesh);
            } else if (cadState.style === 'ceiling') {
                // En colgante de techo: ubicado en la parte inferior del panel sobre el riel de aluminio inferior
                const panelH = tempBox.max.y - tempBox.min.y;
                const subY = -panelH / 2 + 12.5 + subGapVal;
                const splitToggle = document.getElementById('ceiling-split-toggle');
                const isSplit = splitToggle ? splitToggle.checked : false;
                const gapInput = document.getElementById('param-ceiling-gap');
                const splitGap = (isSplit && gapInput) ? parseFloat(gapInput.value) : 0;
                const offsetInput = document.getElementById('param-ceiling-offset');
                const cutOffsetX = (isSplit && offsetInput) ? parseFloat(offsetInput.value) : 0;

                if (!isSplit || splitGap === 0) {
                    subGeo.translate(-sbb.min.x - sw / 2 + mainCenterX, -sbb.min.y - sh / 2 + subY, baseDepth + explodeZ * 0.5);
                    const subMesh = new THREE.Mesh(subGeo, matSubText);
                    subMesh.name = "Subtitulo_Colgante_Techo";
                    accentsGroup.add(subMesh);
                } else {
                    subGeo.dispose();
                    const subChars = Array.from(subText);
                    let subCursorX = -sw / 2 + mainCenterX;
                    subChars.forEach((ch, idx) => {
                        const cGeo = createUTF8CharExtrudeGeometry(subOtFont || otFont, ch, subSize, subDepth, 0);
                        if (!cGeo) {
                            subCursorX += subSize * 0.35;
                            return;
                        }
                        const cbb = cGeo.boundingBox;
                        const cw = cbb.max.x - cbb.min.x;
                        const charCenterX = subCursorX + cw / 2;
                        const onLeft = charCenterX < (mainCenterX + cutOffsetX);
                        const shiftX = onLeft ? -splitGap / 2 : splitGap / 2;
                        cGeo.translate(-cbb.min.x - cw / 2 + charCenterX + shiftX, -cbb.min.y - sh / 2 + subY, baseDepth + explodeZ * 0.5);
                        const cMesh = new THREE.Mesh(cGeo, matSubText);
                        cMesh.name = `Subtitulo_${idx + 1}_${ch}_${onLeft ? 'Parte1' : 'Parte2'}`;
                        accentsGroup.add(cMesh);
                        subCursorX += cw + 1.2;
                    });
                }
            } else if (cadState.style === 'shelf_clip') {
                // En canto anaquel: Queda en la parte baja de la placa frontal
                const clipH = Math.max(32, letterSize * 1.95);
                const subY = -clipH / 2 + 7.0 + subGapVal;

                subGeo.translate(-sbb.min.x - sw / 2 + mainCenterX, -sbb.min.y - sh / 2 + subY, baseDepth + explodeZ * 0.5);

                const subMesh = new THREE.Mesh(subGeo, matSubText);
                subMesh.name = "Subtitulo_Clasificacion_Dewey";
                accentsGroup.add(subMesh);
            } else if (cadState.style === 'plaque') {
                const plaqueLines = splitTextIntoLines(rawText, false);
                const isMultiLine = plaqueLines.length > 1;
                const effectiveLetterSize = isMultiLine ? Math.max(12, Math.round(letterSize * 0.78)) : letterSize;
                const lineStep = effectiveLetterSize * 1.25;
                const totalTextH = (plaqueLines.length - 1) * lineStep + effectiveLetterSize;

                const subY = (isMultiLine ? -totalTextH / 2 - subSizeVal * 0.82 : -letterSize * 0.56) + subGapVal + userTextOffsetY;
                const splitToggle = document.getElementById('plaque-split-toggle');
                const isSplit = splitToggle ? splitToggle.checked : false;
                const gapInput = document.getElementById('param-plaque-gap');
                const splitGap = (isSplit && gapInput) ? parseFloat(gapInput.value) : 0;
                const offsetInput = document.getElementById('param-plaque-offset');
                const cutOffsetX = (isSplit && offsetInput) ? parseFloat(offsetInput.value) : 0;

                const targetSubCenterX = mainCenterX + userTextOffsetX;
                const cutWorldX = targetSubCenterX + cutOffsetX;

                if (!isSplit || splitGap === 0) {
                    subGeo.translate(-sbb.min.x - sw / 2 + targetSubCenterX, -sbb.min.y - sh / 2 + subY, baseDepth + explodeZ * 0.5);
                    const subMesh = new THREE.Mesh(subGeo, matSubText);
                    subMesh.name = "Subtitulo_Clasificacion_Dewey";
                    accentsGroup.add(subMesh);
                } else {
                    const subChars = Array.from(subText);
                    let subCursorX = -sw / 2 + targetSubCenterX;

                    subChars.forEach((ch, idx) => {
                        const cGeo = createUTF8CharExtrudeGeometry(subOtFont || otFont, ch, subSize, subDepth, 0);
                        if (!cGeo) {
                            subCursorX += subSize * 0.35;
                            return;
                        }
                        const cbb = cGeo.boundingBox;
                        const cw = cbb.max.x - cbb.min.x;
                        const charCenterX = subCursorX + cw / 2;

                        const onLeft = charCenterX < cutWorldX;
                        const shiftX = onLeft ? -splitGap / 2 : splitGap / 2;

                        cGeo.translate(-cbb.min.x - cw / 2 + charCenterX + shiftX, -cbb.min.y - sh / 2 + subY, baseDepth + explodeZ * 0.5);
                        const cMesh = new THREE.Mesh(cGeo, matSubText);
                        cMesh.name = `Subtitulo_${idx + 1}_${ch}_${onLeft ? 'Parte1' : 'Parte2'}`;
                        accentsGroup.add(cMesh);

                        subCursorX += cw + 1.2;
                    });
                }
            } else if (cadState.style === 'filigree' && stagger && letterItems.filter(it => !it.isSpace).length > 1) {
                // En Capitular Clásica con Tabula Ansata: Integrar subtítulo en la banda inferior de la Tabula Ansata
                const firstItem = letterItems[0];
                const dropW = Math.max(firstItem.width + 28, letterSize * 1.62);
                const tabulaCenterX = (dropW + tempBox.max.x - 16) / 2;
                const subY = -letterSize * 0.52 + subGapVal;

                subGeo.translate(-sbb.min.x - sw / 2 + tabulaCenterX, -sbb.min.y - sh / 2 + subY, baseDepth + explodeZ * 0.5);
                const subMesh = new THREE.Mesh(subGeo, matSubText);
                subMesh.name = "Subtitulo_Clasificacion_Dewey";
                accentsGroup.add(subMesh);
            } else {
                // En estilos modulares y corpóreos: Lleva su placa de soporte inferior unida a Z=0
                const subY = tempBox.min.y - subSize * 1.15 + subGapVal;
                subGeo.translate(-sbb.min.x - sw / 2 + mainCenterX, -sbb.min.y - sh / 2 + subY, baseDepth + explodeZ * 0.5);

                const subMesh = new THREE.Mesh(subGeo, matSubText);
                subMesh.name = "Subtitulo_Clasificacion_Dewey";
                accentsGroup.add(subMesh);

                const subPlateGeo = createChamferedBoxGeometry(sw + 22, sh + 12, baseDepth, 2.5);
                subPlateGeo.translate(mainCenterX, subY + 1.5, 0);
                const subPlateMesh = new THREE.Mesh(subPlateGeo, matBase);
                subPlateMesh.name = "Placa_Subtitulo_Base";
                baseGroup.add(subPlateMesh);
            }
        }
    }

    // =====================================================================
    // MEDALLONES INDEPENDIENTES EN CAMA (Modo "Imprimir Aparte con Cajeado" o "Solo Medallones")
    // =====================================================================
    if ((logoMode === 'socket_separate' || logoMode === 'medallions_only') && showSeparateOnBed) {
        const preBox = new THREE.Box3().setFromObject(printableRoot);
        const signCenterX = preBox.isEmpty() ? 0 : (preBox.min.x + preBox.max.x) / 2;
        const signMinY = preBox.isEmpty() ? 0 : preBox.min.y;

        const activeMedallions = [];
        if (leftLogoKey !== 'none') activeMedallions.push({ key: leftLogoKey, side: 'Izq' });
        if (rightLogoKey !== 'none') activeMedallions.push({ key: rightLogoKey, side: 'Der' });

        const medDia = logoSizeVal;
        const medGap = 14;
        const totalMedW = activeMedallions.length * medDia + Math.max(0, activeMedallions.length - 1) * medGap;
        let medCursorX = signCenterX - totalMedW / 2 + medDia / 2;
        const medCenterY = signMinY - medDia / 2 - 12;

        activeMedallions.forEach((med, idx) => {
            const { baseGeo, reliefGeo } = createStandaloneMedallionAssembly(
                med.key,
                medDia,
                Math.max(2.4, baseDepth * 0.48),
                Math.max(1.5, letterDepth * 0.65)
            );
            baseGeo.translate(medCursorX, medCenterY, 0);
            reliefGeo.translate(medCursorX, medCenterY, explodeZ * 0.5);

            const bMesh = new THREE.Mesh(baseGeo, matBase);
            bMesh.name = `Medallon_Aparte_Base_${idx + 1}_${med.key.toUpperCase()}`;
            bMesh.castShadow = true;
            bMesh.receiveShadow = true;
            baseGroup.add(bMesh);

            const rMesh = new THREE.Mesh(reliefGeo, matAccent);
            rMesh.name = `Medallon_Aparte_Relieve_${idx + 1}_${med.key.toUpperCase()}`;
            rMesh.castShadow = true;
            accentsGroup.add(rMesh);

            medCursorX += medDia + medGap;
        });
    }

    // Aplicar Escala Global (si el usuario desea reducir o agrandar proporcionalmente todo el objeto)
    const globalScaleInput = document.getElementById('param-global-scale');
    const globalScaleVal = globalScaleInput ? parseFloat(globalScaleInput.value) : 100;
    const globalScale = globalScaleVal / 100;
    const globalScaleLabel = document.getElementById('lbl-global-scale');
    if (globalScaleLabel) {
        globalScaleLabel.textContent = `${Math.round(globalScaleVal)}% (${globalScale.toFixed(2)}x)`;
    }

    if (globalScale !== 1.0) {
        [baseGroup, accentsGroup, lettersGroup].forEach(grp => {
            grp.children.forEach(mesh => {
                mesh.geometry.scale(globalScale, globalScale, globalScale);
            });
        });
    }

    // Centrar todo el conjunto en el origen (0,0,0) de la cama de impresión 3D
    printableRoot.position.set(0, 0, 0);
    const fullBox = new THREE.Box3().setFromObject(printableRoot);
    if (!fullBox.isEmpty()) {
        const center = new THREE.Vector3();
        fullBox.getCenter(center);
        const shiftX = -center.x;
        const shiftY = -center.y;
        const shiftZ = -fullBox.min.z;

        [baseGroup, accentsGroup, lettersGroup].forEach(grp => {
            grp.children.forEach(mesh => {
                mesh.geometry.translate(shiftX, shiftY, shiftZ);
            });
        });

        const finalBox = new THREE.Box3().setFromObject(printableRoot);
        const size = new THREE.Vector3();
        finalBox.getSize(size);
        updateCADMetrics(size.x, size.y, size.z);
        scheduleAutoSave();
    }
}

/**
 * Ajusta automáticamente el rótulo para que quepa perfectamente dentro de los 25 cm (250 mm)
 */
export function fitSignTo25cmBed(maxTargetWidthMm = 245) {
    const fullBox = new THREE.Box3().setFromObject(printableRoot);
    if (fullBox.isEmpty()) return;

    const size = new THREE.Vector3();
    fullBox.getSize(size);
    const maxDim = Math.max(size.x, size.y);
    if (maxDim <= maxTargetWidthMm) return;

    const globalScaleInput = document.getElementById('param-global-scale');
    if (globalScaleInput) {
        const currentScale = parseFloat(globalScaleInput.value);
        const factor = (maxTargetWidthMm - 5) / maxDim;
        const newScale = Math.max(30, Math.floor(currentScale * factor));
        globalScaleInput.value = newScale;
        rebuildSignCAD();
        return;
    }

    const sizeInput = document.getElementById('param-letter-size');
    if (sizeInput) {
        const currentSize = parseFloat(sizeInput.value);
        const scaleFactor = (maxTargetWidthMm - 10) / maxDim;
        const newSize = Math.max(10, Math.floor(currentSize * scaleFactor));
        sizeInput.value = newSize;
        rebuildSignCAD();
    }
}

function updateParamLabels(letterSize, baseDepth, letterDepth, bevelSize, spacing) {
    const elSize = document.getElementById('lbl-letter-size');
    const elBase = document.getElementById('lbl-base-depth');
    const elDepth = document.getElementById('lbl-letter-depth');
    const elBevel = document.getElementById('lbl-bevel');
    const elSpacing = document.getElementById('lbl-spacing');
    const elZSwap = document.getElementById('z-swap-info');

    if (elSize) elSize.textContent = `${letterSize} mm`;
    if (elBase) elBase.textContent = `${baseDepth} mm`;
    if (elDepth) elDepth.textContent = `${letterDepth} mm`;
    if (elBevel) elBevel.textContent = `${bevelSize.toFixed(1)} mm`;
    if (elSpacing) elSpacing.textContent = `${spacing} mm`;
    if (elZSwap) elZSwap.textContent = `Pausa en Z = ${baseDepth.toFixed(1)} mm`;
}

function updateCADMetrics(widthMm, heightMm, depthMm) {
    const w = Math.round(widthMm);
    const h = Math.round(heightMm);
    const d = Math.round(depthMm * 10) / 10;

    const dimText = `${w} × ${h} × ${d} mm`;
    const bboxEl = document.getElementById('stat-bbox');
    const dimBadgeEl = document.getElementById('dimensions-badge');
    const bedAlertBadgeEl = document.getElementById('bed-alert-badge');
    const btnFitBed = document.getElementById('btn-fit-bed');

    if (bboxEl) bboxEl.textContent = dimText;
    if (dimBadgeEl) dimBadgeEl.textContent = dimText;

    const splitToggle = document.getElementById('plaque-split-toggle');
    const ceilingSplitToggle = document.getElementById('ceiling-split-toggle');
    const isPlaqueSplit = (cadState.style === 'plaque' && splitToggle && splitToggle.checked)
        || (cadState.style === 'ceiling' && ceilingSplitToggle && ceilingSplitToggle.checked);

    let isOverBed = (w > cadState.bedSizeMm || h > cadState.bedSizeMm);

    if (isPlaqueSplit) {
        // En modo placa dividida, medimos cada mitad por separado
        const leftBox = new THREE.Box3();
        const rightBox = new THREE.Box3();

        [baseGroup, accentsGroup, lettersGroup].forEach(grp => {
            grp.children.forEach(mesh => {
                const n = mesh.name || '';
                if (n.includes('Parte1') || n.includes('Izquierda') || n.includes('Barra_Codigo_Dewey')) {
                    leftBox.expandByObject(mesh);
                }
                if (n.includes('Parte2') || n.includes('Derecha')) {
                    rightBox.expandByObject(mesh);
                }
            });
        });

        const leftSize = new THREE.Vector3();
        const rightSize = new THREE.Vector3();
        if (!leftBox.isEmpty()) leftBox.getSize(leftSize);
        if (!rightBox.isEmpty()) rightBox.getSize(rightSize);

        const w1 = Math.round(leftSize.x);
        const w2 = Math.round(rightSize.x);
        const maxPartDim = Math.max(leftSize.x, leftSize.y, rightSize.x, rightSize.y);

        isOverBed = maxPartDim > cadState.bedSizeMm;

        if (bedAlertBadgeEl) {
            if (isOverBed) {
                bedAlertBadgeEl.textContent = `⚠️ Una mitad excede 25 cm (P1: ${w1} mm, P2: ${w2} mm)`;
                bedAlertBadgeEl.className = "text-[10px] px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse";
                btnFitBed?.classList.remove('hidden');
            } else {
                bedAlertBadgeEl.textContent = `✅ Ensamble 2 Piezas: Cada mitad cabe en 25 cm (P1: ${w1} mm, P2: ${w2} mm)`;
                bedAlertBadgeEl.className = "text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
                btnFitBed?.classList.add('hidden');
            }
        }
    } else {
        if (bedAlertBadgeEl) {
            if (isOverBed) {
                bedAlertBadgeEl.textContent = `⚠️ Excede cama 25 cm (${Math.max(w, h)} mm)`;
                bedAlertBadgeEl.className = "text-[10px] px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse";
                btnFitBed?.classList.remove('hidden');
            } else {
                bedAlertBadgeEl.textContent = `✅ Cabe en placa de 25 cm (250 mm)`;
                bedAlertBadgeEl.className = "text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
                btnFitBed?.classList.add('hidden');
            }
        }
    }

    updateBedAlertStatus(isOverBed);

    const totalParts = baseGroup.children.length + accentsGroup.children.length + lettersGroup.children.length;
    const partsBadgeEl = document.getElementById('parts-count-badge');
    if (partsBadgeEl) partsBadgeEl.textContent = `${totalParts} Piezas CAD`;

    const boundingVolumeCm3 = (widthMm * heightMm * depthMm) / 1000;
    const fillFactor = cadState.style === 'solid' ? 0.24 : 0.36;
    const estimatedGrams = Math.max(12, Math.round(boundingVolumeCm3 * fillFactor * 1.24));
    const printHours = (estimatedGrams / 30).toFixed(1);

    const weightEl = document.getElementById('stat-weight');
    if (weightEl) weightEl.textContent = `~${estimatedGrams} g PLA (${printHours} hrs)`;
}
