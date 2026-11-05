import { collectExportObjects, sanitizeFileName, downloadBlob } from './exportUtils.js';
import { build3MFBlob } from './threeMfWriter.js';
import { buildJointTestCoupons } from '../cad/segmentation.js';
import * as THREE from 'three';
import { printableRoot, baseGroup, lettersGroup, accentsGroup } from '../scene/sceneManager.js';
import { cadState } from '../config/state.js';
import { showToast } from '../ui/uiController.js';

/**
 * EXPORTADOR NATIVO .3MF MULTI-OBJETO PARA BAMBU STUDIO / ORCASLICER / PRUSASLICER
 * Empaqueta cada pieza como un <object id="..." name="..."> independiente dentro del contenedor ZIP .3mf
 */
export async function exportBambu3MF() {
    const splitMode = document.getElementById('bambu-split-mode')?.value || 'by_color_layer';
    const exportObjects = collectExportObjects(splitMode);

    if (exportObjects.length === 0) {
        showToast('No hay geometrías para exportar', 'Verifica el texto ingresado');
        return;
    }

    showToast('Empaquetando archivo .3MF Multi-Pieza...', 'Generando objetos separados para Bambu Studio');

    const blob = await build3MFBlob(exportObjects, { root: printableRoot });
    if (!blob) {
        showToast('No hay geometrías para exportar', 'Verifica el texto ingresado');
        return;
    }

    const rawName = sanitizeFileName(document.getElementById('sign-text')?.value || 'LETRERO');
    downloadBlob(blob, `BiblioSign_${rawName}_BAMBU_MULTICOLOR.3mf`);

    showToast(
        `¡Descargado: BiblioSign_${rawName}_BAMBU_MULTICOLOR.3mf!`,
        'Ábrelo en Bambu Studio -> Pestaña "Objetos" para cambiar el color de cada parte'
    );
}

/**
 * DIVISIÓN POR PARTES: descarga un .3MF por cada parte, centrada en su propia cama de impresión.
 * Cada archivo conserva las capas de color (base / letras / acentos) como objetos separados para el AMS.
 */
export async function exportSegmentParts3MF() {
    const seg = cadState.segmentation;
    if (!seg || seg.count < 1) {
        showToast('Activa la división por partes', 'Marca "División automática por partes" en el panel de la placa');
        return;
    }

    const rawName = sanitizeFileName(document.getElementById('sign-text')?.value || 'LETRERO');
    const layers = [
        { name: '1_Base_Estructura', group: baseGroup },
        { name: '2_Letras_Relieve', group: lettersGroup },
        { name: '3_Acentos_Y_Marco', group: accentsGroup }
    ];

    for (let k = 0; k < seg.count; k++) {
        const items = layers
            .map(l => ({ name: `${l.name}_P${k + 1}`, meshes: l.group.children.filter(m => m.userData.part === k) }))
            .filter(it => it.meshes.length > 0);
        if (items.length === 0) continue;

        // Origen del archivo = centro de la parte apoyada en Z = 0
        const box = new THREE.Box3();
        items.forEach(it => it.meshes.forEach(m => box.expandByObject(m)));
        const center = new THREE.Vector3();
        box.getCenter(center);
        const origin = new THREE.Object3D();
        origin.position.set(center.x, center.y, box.min.z);
        origin.updateMatrixWorld(true);

        const blob = await build3MFBlob(items, { root: origin });
        if (!blob) continue;
        downloadBlob(blob, `BiblioSign_${rawName}_Parte_${k + 1}_de_${seg.count}.3mf`);
        // Pausa corta: algunos navegadores bloquean varias descargas simultáneas
        await new Promise(r => setTimeout(r, 400));
    }

    showToast(
        `¡${seg.count} partes descargadas!`,
        'Imprime cada .3MF en su propia cama; ensambla bajando cada parte sobre las lengüetas de la anterior'
    );
}

/**
 * PRUEBA DE ENSAMBLE: 3 pares macho/hembra sin letras (holguras 0.10 / 0.15 / 0.20 mm) en una sola cama,
 * con el mismo espesor de la placa actual, para probar resistencia y ajuste antes de imprimir el letrero.
 */
export async function exportJointTest3MF() {
    const isCeiling = cadState.style === 'ceiling';
    const height = parseFloat(document.getElementById(isCeiling ? 'param-ceiling-height' : 'param-plaque-height')?.value) || 70;
    const depth = parseFloat(document.getElementById('param-base-depth')?.value) || 6;
    const radius = parseFloat(document.getElementById('param-plaque-radius')?.value) || 8;

    const pieces = buildJointTestCoupons({ height, depth, radius });
    const items = pieces.map(p => ({ name: p.name, meshes: p.geos.map(g => new THREE.Mesh(g)), ignoreRoot: true }));
    const blob = await build3MFBlob(items, { application: 'BiblioSign 3D - Prueba de ensamble' });
    if (!blob) return;

    downloadBlob(blob, `BiblioSign_Prueba_Ensamble_Cola_Milano_${depth}mm.3mf`);
    showToast(
        'Prueba de ensamble descargada',
        '3 pares: 1 punto = 0.10 mm, 2 puntos = 0.15 mm, 3 puntos = 0.20 mm de holgura'
    );
}
