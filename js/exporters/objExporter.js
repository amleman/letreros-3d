import { collectExportObjects, sanitizeFileName, downloadBlob } from './exportUtils.js';
import { showToast } from '../ui/uiController.js';

/**
 * EXPORTADOR .OBJ MULTI-OBJETO
 * Incluye etiquetas 'o Nombre_Pieza' y 'g Nombre_Pieza' para que Bambu Studio y Blender reconozcan cada objeto
 */
export function exportMultiOBJ() {
    const splitMode = document.getElementById('bambu-split-mode')?.value || 'by_color_layer';
    const exportObjects = collectExportObjects(splitMode);

    if (exportObjects.length === 0) {
        showToast('No hay geometrías para exportar', 'Verifica el texto ingresado');
        return;
    }

    let objLines = [
        '# BiblioSign 3D CAD - Multi-Object OBJ for Bambu Studio',
        '# Unidades: Milimetros (mm)'
    ];
    let globalVertexOffset = 1;

    exportObjects.forEach(item => {
        objLines.push(`o ${item.name}`);
        objLines.push(`g ${item.name}`);

        item.meshes.forEach(mesh => {
            const geom = mesh.geometry;
            if (!geom || !geom.attributes.position) return;
            const pos = geom.attributes.position;
            const index = geom.index;

            for (let i = 0; i < pos.count; i++) {
                objLines.push(`v ${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)}`);
            }

            if (index) {
                for (let i = 0; i < index.count; i += 3) {
                    const a = index.getX(i) + globalVertexOffset;
                    const b = index.getX(i + 1) + globalVertexOffset;
                    const c = index.getX(i + 2) + globalVertexOffset;
                    objLines.push(`f ${a} ${b} ${c}`);
                }
            } else {
                for (let i = 0; i < pos.count; i += 3) {
                    const a = i + globalVertexOffset;
                    const b = i + 1 + globalVertexOffset;
                    const c = i + 2 + globalVertexOffset;
                    objLines.push(`f ${a} ${b} ${c}`);
                }
            }

            globalVertexOffset += pos.count;
        });
    });

    const blob = new Blob([objLines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const rawName = sanitizeFileName(document.getElementById('sign-text')?.value || 'LETRERO');
    downloadBlob(blob, `BiblioSign_${rawName}_MULTI_OBJETO.obj`);

    showToast(
        `Descargado: BiblioSign_${rawName}_MULTI_OBJETO.obj`,
        'En Bambu Studio haz clic derecho -> "Dividir en Objetos" para pintar cada pieza'
    );
}
