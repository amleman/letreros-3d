import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { INSTITUTIONAL_LOGO_VECTORS } from './logoVectors.js';
import { createRoundedBoxGeometry } from './geometryBuilders.js';

// Caché de geometrías unitarias (1 x 1 x 1 mm) para reconstrucción instantánea
const unitGeometryCache = new Map();

// Almacenamiento para un logo personalizado subido por el usuario (.PNG, .JPG, .SVG o .STL)
let customLogoUnitGeometry = null;
let customLogoName = 'Personalizado';

/**
 * Une un arreglo de BufferGeometries en una sola BufferGeometry sólida
 */
function mergeBufferGeometries(geos) {
    let totalPos = 0;
    let totalIndices = 0;

    geos.forEach(g => {
        if (!g || !g.attributes.position) return;
        totalPos += g.attributes.position.array.length;
        if (g.index) {
            totalIndices += g.index.array.length;
        } else {
            totalIndices += g.attributes.position.count;
        }
    });

    if (totalPos === 0) return new THREE.BufferGeometry();

    const mergedPos = new Float32Array(totalPos);
    const mergedIndices = new Uint32Array(totalIndices);

    let posOffset = 0;
    let indexOffset = 0;
    let vertexCountOffset = 0;

    geos.forEach(g => {
        if (!g || !g.attributes.position) return;
        const pos = g.attributes.position;
        mergedPos.set(pos.array, posOffset);

        if (g.index) {
            const idxArr = g.index.array;
            for (let i = 0; i < g.index.count; i++) {
                mergedIndices[indexOffset + i] = idxArr[i] + vertexCountOffset;
            }
            indexOffset += g.index.count;
        } else {
            for (let i = 0; i < pos.count; i++) {
                mergedIndices[indexOffset + i] = i + vertexCountOffset;
            }
            indexOffset += pos.count;
        }

        posOffset += pos.array.length;
        vertexCountOffset += pos.count;
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
    merged.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
    merged.computeVertexNormals();
    return merged;
}

/**
 * Construye una BufferGeometry unitaria [-0.5..0.5, -0.5..0.5, 0..1] a partir de una lista de polígonos con huecos
 */
function buildUnitGeometryFromShapeDefs(shapeDefs) {
    const threeShapes = [];

    for (const def of shapeDefs) {
        if (!def.outer || def.outer.length < 3) continue;
        const s = new THREE.Shape();
        def.outer.forEach(([x, y], idx) => {
            if (idx === 0) s.moveTo(x, y);
            else s.lineTo(x, y);
        });
        s.closePath();

        if (def.holes && def.holes.length > 0) {
            for (const hPts of def.holes) {
                if (!hPts || hPts.length < 3) continue;
                const holePath = new THREE.Path();
                hPts.forEach(([hx, hy], idx) => {
                    if (idx === 0) holePath.moveTo(hx, hy);
                    else holePath.lineTo(hx, hy);
                });
                holePath.closePath();
                s.holes.push(holePath);
            }
        }
        threeShapes.push(s);
    }

    if (threeShapes.length === 0) return null;

    const geo = new THREE.ExtrudeGeometry(threeShapes, {
        steps: 1,
        depth: 1.0,
        bevelEnabled: false,
        curveSegments: 8
    });
    geo.computeVertexNormals();
    return geo;
}

/**
 * Obtiene la geometría 3D extruida de un escudo institucional ('usac', 'biblioteca', 'custom')
 * escalada exactamente al diámetro/ancho `sizeMm` y espesor de relieve `depthMm` (Z = 0 .. depthMm).
 */
export function getInstitutionalLogoGeometry(logoKey = 'usac', sizeMm = 42, depthMm = 1.8) {
    if (logoKey === 'custom' && customLogoUnitGeometry) {
        const cloned = customLogoUnitGeometry.clone();
        cloned.scale(sizeMm, sizeMm, depthMm);
        return cloned;
    }

    const effectiveKey = INSTITUTIONAL_LOGO_VECTORS[logoKey] ? logoKey : 'usac';

    if (!unitGeometryCache.has(effectiveKey)) {
        const unitGeo = buildUnitGeometryFromShapeDefs(INSTITUTIONAL_LOGO_VECTORS[effectiveKey]);
        if (unitGeo) {
            unitGeometryCache.set(effectiveKey, unitGeo);
        }
    }

    const cached = unitGeometryCache.get(effectiveKey);
    if (!cached) return null;

    const result = cached.clone();
    result.scale(sizeMm, sizeMm, depthMm);
    return result;
}

/**
 * Crea la guía / cajeado de encastre (Socket Ring) que se imprime sobre la placa principal
 * cuando el usuario elige el modo "Imprimir Medallones Aparte con Cajeado Guía".
 * Incluye holgura mecánica (+0.28 mm por lado) para que el medallón impreso aparte encaje sin lijar.
 */
export function createRecessedLogoSocketGeometry(diameterMm = 42, rimHeightMm = 1.4, toleranceMm = 0.28) {
    const innerR = (diameterMm / 2) + toleranceMm;
    const outerR = innerR + 2.2;

    const ringShape = new THREE.Shape();
    ringShape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
    ringShape.holes.push(hole);

    // Pequeñas muescas/guías centrales de referencia para gota de pegamento o encastre
    const crossW = Math.min(12, diameterMm * 0.28);
    const crossT = 1.4;
    const hBar = createRoundedBoxGeometry(crossW, crossT, rimHeightMm * 0.5, 0.4);
    const vBar = createRoundedBoxGeometry(crossT, crossW, rimHeightMm * 0.5, 0.4);

    const ringGeo = new THREE.ExtrudeGeometry(ringShape, {
        steps: 1,
        depth: rimHeightMm,
        bevelEnabled: false,
        curveSegments: 36
    });

    return mergeBufferGeometries([ringGeo, hBar, vBar]);
}

/**
 * Crea un Medallón Independiente completo (Disco base biselado + anillo perimetral + escudo en alto relieve)
 * listo para imprimirse por separado en la cama o exportarse como STL de alta resolución.
 */
export function createStandaloneMedallionAssembly(logoKey = 'usac', diameterMm = 42, discDepthMm = 2.6, reliefDepthMm = 1.6) {
    const radius = diameterMm / 2;

    // 1. Disco base circular con bisel suave para encajar en el cajeado guía
    const discShape = new THREE.Shape();
    discShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const baseGeo = new THREE.ExtrudeGeometry(discShape, {
        steps: 1,
        depth: discDepthMm,
        bevelEnabled: false,
        curveSegments: 40
    });

    // 2. Anillo perimetral fino de enmarcado (para el logo de Biblioteca o refuerzo exterior)
    const rimOuterR = radius - 0.8;
    const rimInnerR = radius - 2.4;
    const rimShape = new THREE.Shape();
    rimShape.absarc(0, 0, rimOuterR, 0, Math.PI * 2, false);
    const rimHole = new THREE.Path();
    rimHole.absarc(0, 0, rimInnerR, 0, Math.PI * 2, true);
    rimShape.holes.push(rimHole);

    const rimGeo = new THREE.ExtrudeGeometry(rimShape, {
        steps: 1,
        depth: reliefDepthMm * 0.75,
        bevelEnabled: false,
        curveSegments: 36
    });
    rimGeo.translate(0, 0, discDepthMm);

    // 3. Geometría del escudo interior ajustada al disco (relieve tipo moneda 1.05 mm para USAC, 1.5 mm para Biblioteca)
    const logoScale = logoKey === 'usac' ? (diameterMm * 0.92) : (diameterMm * 0.78);
    const effectiveReliefZ = logoKey === 'usac' ? Math.min(1.1, reliefDepthMm * 0.68) : reliefDepthMm;
    const logoGeo = getInstitutionalLogoGeometry(logoKey, logoScale, effectiveReliefZ);
    if (logoGeo) {
        logoGeo.translate(0, 0, discDepthMm);
    }

    const reliefGeo = logoGeo
        ? (logoKey === 'usac' ? logoGeo : mergeBufferGeometries([rimGeo, logoGeo]))
        : rimGeo;

    return {
        baseGeo,
        reliefGeo
    };
}

/**
 * Algoritmo Marching Squares + Ramer-Douglas-Peucker en navegador para convertir cualquier imagen (.PNG / .JPG / .SVG)
 * subida por el usuario en polígonos cerrados con jerarquía de huecos lista para extrusión 3D.
 */
function traceCanvasToShapeDefs(canvas, simplifyEps = 0.85, minAreaPx = 14) {
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, W, H).data;

    // Detectar si el fondo es transparente o claro/oscuro según las esquinas
    const cornerAlpha = (imgData[3] + imgData[(W - 1) * 4 + 3] + imgData[(H - 1) * W * 4 + 3]) / 3;
    const cornerLum = (imgData[0] * 0.299 + imgData[1] * 0.587 + imgData[2] * 0.114);

    const grid = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const idx = (y * W + x) * 4;
            const a = imgData[idx + 3];
            const lum = imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;

            if (cornerAlpha < 80) {
                // Imagen con fondo transparente: tomamos píxeles opacos
                if (a > 110) grid[y * W + x] = 1;
            } else if (cornerLum > 128) {
                // Fondo blanco/claro: tomamos trazos oscuros
                if (lum < 160 && a > 100) grid[y * W + x] = 1;
            } else {
                // Fondo oscuro: tomamos trazos claros
                if (lum > 125 && a > 100) grid[y * W + x] = 1;
            }
        }
    }

    const nextMap = new Map();
    const ptMap = new Map();

    function keyOf(px, py) {
        const ix = Math.round(px * 2);
        const iy = Math.round(py * 2);
        return (iy << 14) | ix;
    }

    function addSeg(x1, y1, x2, y2) {
        const k1 = keyOf(x1, y1);
        const k2 = keyOf(x2, y2);
        ptMap.set(k1, [x1, y1]);
        ptMap.set(k2, [x2, y2]);
        if (!nextMap.has(k1)) nextMap.set(k1, []);
        nextMap.get(k1).push(k2);
    }

    for (let y = 0; y < H - 1; y++) {
        const row = y * W;
        const nextRow = (y + 1) * W;
        for (let x = 0; x < W - 1; x++) {
            const tl = grid[row + x] ? 1 : 0;
            const tr = grid[row + x + 1] ? 1 : 0;
            const br = grid[nextRow + x + 1] ? 1 : 0;
            const bl = grid[nextRow + x] ? 1 : 0;
            const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
            if (code === 0 || code === 15) continue;

            const T = [x + 0.5, y];
            const R = [x + 1, y + 0.5];
            const B = [x + 0.5, y + 1];
            const L = [x, y + 0.5];

            switch (code) {
                case 1:  addSeg(B[0], B[1], L[0], L[1]); break;
                case 2:  addSeg(R[0], R[1], B[0], B[1]); break;
                case 3:  addSeg(R[0], R[1], L[0], L[1]); break;
                case 4:  addSeg(T[0], T[1], R[0], R[1]); break;
                case 5:
                    addSeg(T[0], T[1], R[0], R[1]);
                    addSeg(B[0], B[1], L[0], L[1]);
                    break;
                case 6:  addSeg(T[0], T[1], B[0], B[1]); break;
                case 7:  addSeg(T[0], T[1], L[0], L[1]); break;
                case 8:  addSeg(L[0], L[1], T[0], T[1]); break;
                case 9:  addSeg(B[0], B[1], T[0], T[1]); break;
                case 10:
                    addSeg(L[0], L[1], T[0], T[1]);
                    addSeg(R[0], R[1], B[0], B[1]);
                    break;
                case 11: addSeg(R[0], R[1], T[0], T[1]); break;
                case 12: addSeg(L[0], L[1], R[0], R[1]); break;
                case 13: addSeg(B[0], B[1], R[0], R[1]); break;
                case 14: addSeg(L[0], L[1], B[0], B[1]); break;
            }
        }
    }

    const loops = [];
    for (const [startK, outs] of nextMap.entries()) {
        while (outs.length > 0) {
            const loop = [];
            let currK = startK;
            while (true) {
                const pt = ptMap.get(currK);
                loop.push(pt);
                const arr = nextMap.get(currK);
                if (!arr || arr.length === 0) break;
                currK = arr.pop();
                if (currK === startK) break;
            }
            if (loop.length >= 4) loops.push(loop);
        }
    }

    function signedArea(pts) {
        let a = 0;
        for (let i = 0, n = pts.length; i < n; i++) {
            const p1 = pts[i];
            const p2 = pts[(i + 1) % n];
            a += (p1[0] * p2[1] - p2[0] * p1[1]);
        }
        return a * 0.5;
    }

    function smoothLoop(pts, alpha = 0.3) {
        const n = pts.length;
        return pts.map((curr, i) => {
            const prev = pts[(i - 1 + n) % n];
            const next = pts[(i + 1) % n];
            return [
                curr[0] * (1 - alpha) + (prev[0] + next[0]) * 0.5 * alpha,
                curr[1] * (1 - alpha) + (prev[1] + next[1]) * 0.5 * alpha
            ];
        });
    }

    function simplifyRDP(pts, eps) {
        if (pts.length <= 6) return pts;
        function distSqToSeg(p, a, b) {
            const dx = b[0] - a[0], dy = b[1] - a[1];
            const lenSq = dx * dx + dy * dy;
            if (lenSq === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
            const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
            return (p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2;
        }
        function rdpOpen(arr, sqEps) {
            if (arr.length <= 2) return arr;
            let maxD = 0, idx = 0;
            const first = arr[0], last = arr[arr.length - 1];
            for (let i = 1; i < arr.length - 1; i++) {
                const d = distSqToSeg(arr[i], first, last);
                if (d > maxD) { maxD = d; idx = i; }
            }
            if (maxD > sqEps) {
                const left = rdpOpen(arr.slice(0, idx + 1), sqEps);
                const right = rdpOpen(arr.slice(idx), sqEps);
                return left.slice(0, -1).concat(right);
            }
            return [first, last];
        }
        const half = Math.floor(pts.length / 2);
        const s1 = rdpOpen(pts.slice(0, half + 1), eps * eps);
        const s2 = rdpOpen(pts.slice(half).concat([pts[0]]), eps * eps);
        return s1.slice(0, -1).concat(s2.slice(0, -1));
    }

    const shapes = [];
    const holes = [];

    for (const rawLoop of loops) {
        const cart = rawLoop.map(([x, y]) => [x - W / 2, H / 2 - y]);
        const area = signedArea(cart);
        if (Math.abs(area) < minAreaPx) continue;
        const simp = simplifyRDP(smoothLoop(cart), simplifyEps);
        if (simp.length < 3) continue;
        const sArea = signedArea(simp);
        if (Math.abs(sArea) < minAreaPx) continue;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [px, py] of simp) {
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
        }

        const item = { pts: simp, area: Math.abs(sArea), bbox: [minX, minY, maxX, maxY], holes: [] };
        if (sArea > 0) shapes.push(item);
        else holes.push(item);
    }

    function pointInPoly(pt, poly) {
        const x = pt[0], y = pt[1];
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1];
            const xj = poly[j][0], yj = poly[j][1];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    shapes.sort((a, b) => a.area - b.area);
    for (const h of holes) {
        const testPt = h.pts[0];
        for (const s of shapes) {
            if (s.area <= h.area) continue;
            if (testPt[0] < s.bbox[0] || testPt[0] > s.bbox[2] || testPt[1] < s.bbox[1] || testPt[1] > s.bbox[3]) continue;
            if (pointInPoly(testPt, s.pts)) {
                s.holes.push(h.pts);
                break;
            }
        }
    }

    let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
    for (const s of shapes) {
        if (s.bbox[0] < gMinX) gMinX = s.bbox[0];
        if (s.bbox[2] > gMaxX) gMaxX = s.bbox[2];
        if (s.bbox[1] < gMinY) gMinY = s.bbox[1];
        if (s.bbox[3] > gMaxY) gMaxY = s.bbox[3];
    }
    const cx = (gMinX + gMaxX) / 2;
    const cy = (gMinY + gMaxY) / 2;
    const maxSpan = Math.max(gMaxX - gMinX, gMaxY - gMinY, 1);

    return shapes.map(s => ({
        outer: s.pts.map(([x, y]) => [(x - cx) / maxSpan, (y - cy) / maxSpan]),
        holes: s.holes.map(h => h.map(([x, y]) => [(x - cx) / maxSpan, (y - cy) / maxSpan]))
    }));
}

/**
 * Carga un archivo externo (.SVG, .PNG, .JPG, .WEBP o .STL) como logo personalizado
 */
export async function loadCustomLogoFromFile(file) {
    if (!file) return null;
    const ext = file.name.split('.').pop().toLowerCase();
    customLogoName = file.name.replace(/\.[^.]+$/, '');

    if (ext === 'stl') {
        const arrayBuffer = await file.arrayBuffer();
        const loader = new STLLoader();
        const geo = loader.parse(arrayBuffer);
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const cx = (bb.min.x + bb.max.x) / 2;
        const cy = (bb.min.y + bb.max.y) / 2;
        const spanXY = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, 1e-4);
        const spanZ = Math.max(bb.max.z - bb.min.z, 1e-4);
        geo.translate(-cx, -cy, -bb.min.z);
        geo.scale(1 / spanXY, 1 / spanXY, 1 / spanZ);
        geo.computeVertexNormals();
        customLogoUnitGeometry = geo;
        return { name: customLogoName, type: 'stl' };
    }

    // Para SVG, PNG, JPG, WEBP: Renderizar en un canvas 520x520 y vectorizar con Marching Squares
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });

    const W = 500;
    const H = Math.max(120, Math.round(500 * (img.height / Math.max(1, img.width))));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 12, 12, W - 24, H - 24);

    const shapeDefs = traceCanvasToShapeDefs(canvas, 0.75, 14);
    const unitGeo = buildUnitGeometryFromShapeDefs(shapeDefs);
    if (unitGeo) {
        customLogoUnitGeometry = unitGeo;
        return { name: customLogoName, type: ext, shapes: shapeDefs.length };
    }
    throw new Error('No se detectaron contornos válidos en la imagen seleccionada.');
}

export function hasCustomLogoLoaded() {
    return !!customLogoUnitGeometry;
}

export function getCustomLogoName() {
    return customLogoName;
}
