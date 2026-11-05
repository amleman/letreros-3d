import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { baseGroup, accentsGroup, lettersGroup, printableRoot } from '../scene/sceneManager.js';
import { sanitizeFileName, downloadBlob } from './exportUtils.js';
import { createStandaloneMedallionAssembly } from '../cad/logoBuilder.js';
import { showToast } from '../ui/uiController.js';

/**
 * EXPORTADOR .STL POR CAPA DE COLOR
 * Comparte exactamente el mismo origen de coordenadas para ensamblaje automático al arrastrar juntos a Bambu Studio
 */
export function exportSTL(partMode = 'base') {
    const exporter = new STLExporter();
    let targetObject = baseGroup;
    let suffix = '1_SOLO_BASE';

    if (partMode === 'letters') {
        targetObject = lettersGroup;
        suffix = '2_SOLO_LETRAS';
    } else if (partMode === 'accents') {
        targetObject = accentsGroup;
        suffix = '3_SOLO_ACENTOS';
    } else if (partMode === 'all') {
        targetObject = printableRoot;
        suffix = 'UNIFICADO';
    }

    if (!targetObject || targetObject.children.length === 0) {
        showToast('Esta capa no tiene piezas en el estilo actual', 'Prueba con Base o Letras, o usa el botón .3MF');
        return;
    }

    const stlBinary = exporter.parse(targetObject, { binary: true });
    const blob = new Blob([stlBinary], { type: 'application/octet-stream' });
    const rawName = sanitizeFileName(document.getElementById('sign-text')?.value || 'LETRERO');

    downloadBlob(blob, `BiblioSign_${rawName}_${suffix}.stl`);
    showToast(
        `Descargado: BiblioSign_${rawName}_${suffix}.stl`,
        'Arrastra Base + Letras + Acentos juntos a Bambu Studio para alinearlos automáticamente'
    );
}

/**
 * Exporta los medallones institucionales independientes (USAC y/o Biblioteca Central BC)
 * centrados en (0,0,0) listos para imprimirse aparte a alta resolución (capa 0.12 mm o boquilla 0.2 mm).
 */
export function exportStandaloneMedallionsSTL() {
    const leftKey = document.getElementById('logo-left-select')?.value || 'usac';
    const rightKey = document.getElementById('logo-right-select')?.value || 'biblioteca';
    const logoDia = parseFloat(document.getElementById('param-logo-size')?.value || 40);

    const keysToExport = [];
    if (leftKey !== 'none') keysToExport.push(leftKey);
    if (rightKey !== 'none') keysToExport.push(rightKey);
    if (keysToExport.length === 0) keysToExport.push('usac', 'biblioteca');

    const tempGroup = new THREE.Group();
    const gap = 12;
    const totalW = keysToExport.length * logoDia + (keysToExport.length - 1) * gap;
    let cursorX = -totalW / 2 + logoDia / 2;

    keysToExport.forEach(key => {
        const { baseGeo, reliefGeo } = createStandaloneMedallionAssembly(key, logoDia, 2.6, 1.6);
        baseGeo.translate(cursorX, 0, 0);
        reliefGeo.translate(cursorX, 0, 0);

        tempGroup.add(new THREE.Mesh(baseGeo));
        tempGroup.add(new THREE.Mesh(reliefGeo));
        cursorX += logoDia + gap;
    });

    const exporter = new STLExporter();
    const stlBinary = exporter.parse(tempGroup, { binary: true });
    const blob = new Blob([stlBinary], { type: 'application/octet-stream' });

    const label = keysToExport.map(k => k.toUpperCase()).join('_');
    downloadBlob(blob, `BiblioSign_MEDALLONES_${label}_${Math.round(logoDia)}mm.stl`);
    showToast(
        `Descargado: Medallones ${label} (${Math.round(logoDia)} mm)`,
        'Imprímelos aparte con capa fina (0.12 mm) y encástralos en el cajeado guía del letrero'
    );
}
