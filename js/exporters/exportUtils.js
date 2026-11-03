import { baseGroup, accentsGroup, lettersGroup } from '../scene/sceneManager.js';

/**
 * Limpia nombres de archivo para compatibilidad en todos los sistemas operativos
 */
export function sanitizeFileName(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/Ñ/g, 'N')
        .replace(/[^A-Z0-9_]/gi, '_');
}

/**
 * Dispara la descarga de un Blob en el navegador
 */
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Agrupa las mallas según el modo seleccionado (Por Capas de Color vs. Por Pieza Individual)
 */
export function collectExportObjects(splitMode) {
    const list = [];
    if (splitMode === 'by_color_layer') {
        if (baseGroup.children.length > 0) {
            list.push({ name: '1_Base_Estructura', meshes: [...baseGroup.children] });
        }
        if (lettersGroup.children.length > 0) {
            list.push({ name: '2_Letras_Relieve', meshes: [...lettersGroup.children] });
        }
        if (accentsGroup.children.length > 0) {
            list.push({ name: '3_Acentos_Y_Marco', meshes: [...accentsGroup.children] });
        }
    } else {
        // Cada letra y bloque individualmente
        [...baseGroup.children, ...accentsGroup.children, ...lettersGroup.children].forEach((mesh, idx) => {
            const cleanName = sanitizeFileName(mesh.name || `Pieza_${idx + 1}`);
            list.push({ name: cleanName, meshes: [mesh] });
        });
    }
    return list;
}
