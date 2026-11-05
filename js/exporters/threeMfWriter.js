import * as THREE from 'three';

/**
 * ESCRITOR .3MF COMÚN (Bambu Studio / OrcaSlicer / PrusaSlicer)
 *
 * Three.js genera geometrías "no indexadas" (ExtrudeGeometry, biseles...): cada triángulo trae sus
 * propios 3 vértices duplicados, así que en el archivo ningún triángulo comparte aristas con sus vecinos.
 * Los slicers interpretan eso como miles de bordes abiertos (malla no-manifold) y piden "reparar el modelo".
 *
 * Aquí se sueldan los vértices coincidentes (cuantizados a 1e-4 mm), se aplican las transformaciones de
 * cada malla relativas a la raíz y se descartan triángulos degenerados o duplicados.
 */

const WELD_PRECISION = 1e4; // 0.0001 mm

/**
 * @param {Array<{name: string, meshes: THREE.Mesh[], ignoreRoot?: boolean}>} items  Un objeto 3MF por item
 *        (ignoreRoot: mallas sueltas fuera de la escena, se exportan en sus propias coordenadas)
 * @param {object} opts
 * @param {THREE.Object3D} [opts.root]  Las coordenadas se exportan relativas a este nodo
 * @param {string} [opts.application]
 * @returns {Promise<Blob|null>} null si no hay geometría exportable
 */
export async function build3MFBlob(items, { root = null, application = 'BiblioSign 3D CAD Studio' } = {}) {
    const rootInverse = new THREE.Matrix4();
    if (root) {
        root.updateWorldMatrix(true, true);
        rootInverse.copy(root.matrixWorld).invert();
    }

    let resourcesXml = '';
    let buildItemsXml = '';
    let objId = 0;

    const identity = new THREE.Matrix4();
    items.forEach(item => {
        const { verticesXml, trianglesXml } = buildWeldedMeshXml(item.meshes, item.ignoreRoot ? identity : rootInverse);
        if (!verticesXml || !trianglesXml) return;

        objId++;
        resourcesXml += `
        <object id="${objId}" name="${escapeXml(item.name)}" type="model">
            <mesh>
                <vertices>${verticesXml}</vertices>
                <triangles>${trianglesXml}</triangles>
            </mesh>
        </object>`;

        buildItemsXml += `
        <item objectid="${objId}" />`;
    });

    if (objId === 0) return null;

    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="es-GT" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
    <metadata name="Application">${escapeXml(application)}</metadata>
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

    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * Fusiona varias mallas en una sola malla indexada con vértices soldados
 */
function buildWeldedMeshXml(meshList, rootInverse) {
    const vertexIndexByKey = new Map();
    const vLines = [];
    const tLines = [];
    const seenTriangles = new Set();

    const matrix = new THREE.Matrix4();
    const v = new THREE.Vector3();

    const weld = (x, y, z) => {
        const qx = Math.round(x * WELD_PRECISION);
        const qy = Math.round(y * WELD_PRECISION);
        const qz = Math.round(z * WELD_PRECISION);
        const key = `${qx},${qy},${qz}`;
        let idx = vertexIndexByKey.get(key);
        if (idx === undefined) {
            idx = vLines.length;
            vertexIndexByKey.set(key, idx);
            vLines.push(`<vertex x="${(qx / WELD_PRECISION).toFixed(4)}" y="${(qy / WELD_PRECISION).toFixed(4)}" z="${(qz / WELD_PRECISION).toFixed(4)}" />`);
        }
        return idx;
    };

    meshList.forEach(mesh => {
        const geom = mesh.geometry;
        if (!geom || !geom.attributes.position) return;

        mesh.updateWorldMatrix(true, false);
        matrix.multiplyMatrices(rootInverse, mesh.matrixWorld);
        // Una escala negativa invierte la orientación de las caras: hay que invertir el orden de los vértices
        const flip = matrix.determinant() < 0;

        const pos = geom.attributes.position;
        const index = geom.index;
        const triCount = index ? index.count / 3 : pos.count / 3;

        // Soldar cada vértice de la geometría una sola vez
        const local = new Int32Array(pos.count);
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
            local[i] = weld(v.x, v.y, v.z);
        }

        for (let t = 0; t < triCount; t++) {
            const a = local[index ? index.getX(t * 3) : t * 3];
            let b = local[index ? index.getX(t * 3 + 1) : t * 3 + 1];
            let c = local[index ? index.getX(t * 3 + 2) : t * 3 + 2];

            // Degenerado: dos esquinas colapsan en el mismo vértice
            if (a === b || b === c || a === c) continue;
            if (flip) [b, c] = [c, b];

            // Triángulo repetido (mismas 3 esquinas): se exporta solo una vez
            const triKey = [a, b, c].sort((m, n) => m - n).join(',');
            if (seenTriangles.has(triKey)) continue;
            seenTriangles.add(triKey);

            tLines.push(`<triangle v1="${a}" v2="${b}" v3="${c}" />`);
        }
    });

    return {
        verticesXml: vLines.join(''),
        trianglesXml: tLines.join('')
    };
}

function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
