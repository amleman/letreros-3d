import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { hangingRoot, hangingBracketGroup, hangingChainsGroup, hangingPlatesGroup } from '../scene/sceneManager.js';
import { sanitizeFileName, downloadBlob } from './exportUtils.js';
import { build3MFBlob } from './threeMfWriter.js';
import { createChainLinkGeometry } from '../cad/geometryBuilders.js';
import { showToast } from '../ui/uiController.js';
import { cadState } from '../config/state.js';

/**
 * EXPORTA EL RÓTULO COLGANTE MODULAR EN .3MF MULTI-PIEZA (Bambu Studio / OrcaSlicer)
 */
export async function exportHanging3MF() {
    if (!hangingRoot) return;

    showToast('Empaquetando Rótulo Colgante en .3MF...', 'Generando soporte, cadenas y placas separadas');

    const exportItems = [];

    // 1. Soporte
    if (hangingBracketGroup.children.length > 0) {
        exportItems.push({ name: '1_Soporte_Brazo_Hierro', meshes: [...hangingBracketGroup.children] });
    }

    // 2. Eslabones acostados en una fila sobre la cama (así se imprimen; se enganchan después por su abertura)
    const linkCount = hangingChainsGroup.children.length;
    if (linkCount > 0) {
        const plateBox = new THREE.Box3();
        [...hangingBracketGroup.children, ...hangingPlatesGroup.children].forEach(m => {
            m.geometry.computeBoundingBox();
            plateBox.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrix));
        });
        const perRow = 10;
        const startX = plateBox.isEmpty() ? 0 : plateBox.min.x + 10;
        const startY = plateBox.isEmpty() ? 0 : plateBox.min.y - 20;
        const flatLinks = [];
        for (let i = 0; i < linkCount; i++) {
            const link = new THREE.Mesh(createChainLinkGeometry(14, 11, 2.5));
            link.position.set(startX + (i % perRow) * 15, startY - Math.floor(i / perRow) * 19, 1.25 + 0.3);
            link.updateMatrixWorld(true);
            flatLinks.push(link);
        }
        exportItems.push({ name: `2_Eslabones_C_x${linkCount}`, meshes: flatLinks, ignoreRoot: true });
    }

    // 3. Cada placa en 3 objetos (base, marco y letras) para asignar un filamento AMS distinto a cada uno
    cadState.hanging.plates.forEach((p, idx) => {
        const prefix = `Placa_${idx + 1}_`;
        const meshes = hangingPlatesGroup.children.filter(c => (c.name || '').startsWith(prefix));
        const cleanTitle = sanitizeFileName(p.text || `Placa_${idx + 1}`);
        const parts = [
            { suffix: 'Base', match: n => n.endsWith('_Base') },
            { suffix: 'Marco', match: n => n.endsWith('_Marco') },
            { suffix: 'Letras', match: n => n.includes('_Letra_') }
        ];
        parts.forEach(part => {
            const partMeshes = meshes.filter(m => part.match(m.name));
            if (partMeshes.length > 0) {
                exportItems.push({ name: `3_Modulo_${idx + 1}_${cleanTitle}_${part.suffix}`, meshes: partMeshes });
            }
        });
    });

    // Relativo a hangingRoot: las piezas quedan acostadas sobre la cama (Z = espesor), no de pie
    const blob = await build3MFBlob(exportItems, {
        root: hangingRoot,
        application: 'BiblioSign 3D - Modulo Colgante de Anaquel'
    });
    if (!blob) {
        showToast('No hay piezas disponibles para exportar', 'Verifica la configuración');
        return;
    }

    const mainTitle = sanitizeFileName(cadState.hanging.plates[0]?.text || 'ROTULO_COLGANTE');
    downloadBlob(blob, `BiblioSign_COLGANTE_${mainTitle}_BAMBU.3mf`);

    showToast(
        `¡Descargado: BiblioSign_COLGANTE_${mainTitle}_BAMBU.3mf!`,
        'Ábrelo en Bambu Studio -> Pestaña Objetos para colorear cada placa y soporte'
    );
}

/**
 * EXPORTA STL DEL RÓTULO COLGANTE POR PARTES
 */
export function exportHangingSTL(part = 'all') {
    const exporter = new STLExporter();
    let target = hangingRoot;
    let suffix = 'COMPLETO_ENSAMBLADO';

    if (part === 'bracket') {
        target = hangingBracketGroup;
        suffix = '1_BRAZO_SOPORTE';
    } else if (part === 'chains') {
        target = hangingChainsGroup;
        suffix = '2_ESLABONES_CADENA';
    } else if (part === 'plates') {
        target = hangingPlatesGroup;
        suffix = '3_PLACAS_MODULARES';
    }

    if (!target || target.children.length === 0) {
        showToast('No hay piezas disponibles en esta sección', 'Verifica la configuración');
        return;
    }

    const stlBinary = exporter.parse(target, { binary: true });
    const blob = new Blob([stlBinary], { type: 'application/octet-stream' });
    const mainTitle = sanitizeFileName(cadState.hanging.plates[0]?.text || 'ROTULO_COLGANTE');

    downloadBlob(blob, `BiblioSign_COLGANTE_${mainTitle}_${suffix}.stl`);
    showToast(
        `Descargado: BiblioSign_COLGANTE_${mainTitle}_${suffix}.stl`,
        'Listo para laminar en tu cama de impresión de 25 cm'
    );
}
