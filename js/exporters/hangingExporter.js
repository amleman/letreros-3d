import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { hangingRoot, hangingBracketGroup, hangingChainsGroup, hangingPlatesGroup } from '../scene/sceneManager.js';
import { sanitizeFileName, downloadBlob } from './exportUtils.js';
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

    // 2. Cadenas
    if (hangingChainsGroup.children.length > 0) {
        exportItems.push({ name: '2_Eslabones_Cadena_Desmontables', meshes: [...hangingChainsGroup.children] });
    }

    // 3. Placas y letras individuales
    cadState.hanging.plates.forEach((p, idx) => {
        const plateMeshes = [];
        hangingPlatesGroup.children.forEach(c => {
            if (c.name && (c.name.includes(`Placa_${idx + 1}`) || (idx === 0 && (c.name === 'Placa_Base' || c.name === 'Marco_Placa_Relieve')))) {
                plateMeshes.push(c);
            }
        });
        const cleanTitle = sanitizeFileName(p.text || `Placa_${idx + 1}`);
        exportItems.push({
            name: `3_Modulo_${idx + 1}_${cleanTitle}`,
            meshes: plateMeshes.length > 0 ? plateMeshes : [...hangingPlatesGroup.children]
        });
    });

    let resourcesXml = '';
    let buildItemsXml = '';

    exportItems.forEach((item, index) => {
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
    <metadata name="Application">BiblioSign 3D - Modulo Colgante de Anaquel</metadata>
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
