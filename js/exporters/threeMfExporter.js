import { collectExportObjects, sanitizeFileName, downloadBlob } from './exportUtils.js';
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

    let resourcesXml = '';
    let buildItemsXml = '';

    exportObjects.forEach((item, index) => {
        const objId = index + 1;
        const { verticesXml, trianglesXml } = build3MFMeshXml(item.meshes);
        if (!verticesXml || !trianglesXml) return;

        resourcesXml += `
        <object id="${objId}" name="${item.name}" type="model">
            <mesh>
                <vertices>${verticesXml}</vertices>
                <triangles>${trianglesXml}</triangles>
            </mesh>
        </object>`;

        buildItemsXml += `
        <item objectid="${objId}" />`;
    });

    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:space="preserve" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
    <metadata name="Application">BiblioSign 3D CAD Studio</metadata>
    <resources>${resourcesXml}
    </resources>
    <build>${buildItemsXml}
    </build>
</model>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
    <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

    const zip = new window.JSZip();
    zip.file('[Content_Types].xml', contentTypesXml);
    zip.folder('_rels').file('.rels', relsXml);
    zip.folder('3D').file('3dmodel.model', modelXml);

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const rawName = sanitizeFileName(document.getElementById('sign-text')?.value || 'LETRERO');
    downloadBlob(blob, `BiblioSign_${rawName}_BAMBU_MULTICOLOR.3mf`);

    showToast(
        `¡Descargado: BiblioSign_${rawName}_BAMBU_MULTICOLOR.3mf!`,
        'Ábrelo en Bambu Studio -> Pestaña "Objetos" para cambiar el color de cada parte'
    );
}

/**
 * Construye los nodos XML <vertex> y <triangle> para el estándar 3MF
 */
function build3MFMeshXml(meshList) {
    const vLines = [];
    const tLines = [];
    let vertexOffset = 0;

    meshList.forEach(mesh => {
        const geom = mesh.geometry;
        if (!geom || !geom.attributes.position) return;

        const pos = geom.attributes.position;
        const index = geom.index;

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i).toFixed(4);
            const y = pos.getY(i).toFixed(4);
            const z = pos.getZ(i).toFixed(4);
            vLines.push(`<vertex x="${x}" y="${y}" z="${z}" />`);
        }

        if (index) {
            for (let i = 0; i < index.count; i += 3) {
                const v1 = index.getX(i) + vertexOffset;
                const v2 = index.getX(i + 1) + vertexOffset;
                const v3 = index.getX(i + 2) + vertexOffset;
                tLines.push(`<triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
            }
        } else {
            for (let i = 0; i < pos.count; i += 3) {
                const v1 = i + vertexOffset;
                const v2 = i + 1 + vertexOffset;
                const v3 = i + 2 + vertexOffset;
                tLines.push(`<triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
            }
        }

        vertexOffset += pos.count;
    });

    return {
        verticesXml: vLines.join(''),
        trianglesXml: tLines.join('')
    };
}
