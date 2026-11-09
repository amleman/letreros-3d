import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { flipGeometryWindingOrder } from './geometryBuilders.js';

/**
 * Trazador de respaldo en Canvas 2D si las fuentes externas son bloqueadas por firewall
 */
export function traceCharFromCanvas2D(charStr, cssFamily, sizeMm, depthMm, bevelMm) {
    const res = 160;
    const pad = 36;
    const canvas = document.createElement('canvas');
    const widthPx = Math.max(res * Math.max(1, charStr.length * 0.85) + pad * 2, 220);
    const heightPx = res + pad * 2;
    canvas.width = widthPx;
    canvas.height = heightPx;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(res * 0.78)}px ${cssFamily}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(charStr, pad, heightPx - pad * 1.15);

    const img = ctx.getImageData(0, 0, widthPx, heightPx).data;
    const scale = sizeMm / (res * 0.65);

    const shapes = [];
    const step = 2;
    for (let x = 0; x < widthPx; x += step) {
        let yStart = -1;
        for (let y = 0; y < heightPx; y++) {
            const lum = img[(y * widthPx + x) * 4];
            if (lum > 128 && yStart === -1) {
                yStart = y;
            } else if ((lum <= 128 || y === heightPx - 1) && yStart !== -1) {
                const x0 = x * scale;
                const x1 = (x + step + 0.15) * scale;
                const y0 = (heightPx - y) * scale;
                const y1 = (heightPx - yStart) * scale;
                const s = new THREE.Shape();
                s.moveTo(x0, y0);
                s.lineTo(x1, y0);
                s.lineTo(x1, y1);
                s.lineTo(x0, y1);
                s.closePath();
                shapes.push(s);
                yStart = -1;
            }
        }
    }

    if (shapes.length === 0) return null;
    const geo = new THREE.ExtrudeGeometry(shapes, {
        depth: depthMm,
        steps: 1,
        bevelEnabled: false
    });
    geo.computeBoundingBox();
    return geo;
}

// Mapa glifo → glifo de "números alineados" (OpenType `lnum`) por fuente
const liningFigureMaps = new WeakMap();

/**
 * Algunas fuentes elegantes (p. ej. Playfair Display) usan por defecto números de estilo antiguo:
 * más bajos que las mayúsculas y con 3, 4, 5, 7, 9 bajando de la línea base. Si la fuente trae su
 * variante `lnum` (números a altura de mayúscula, dibujados por el propio tipógrafo), la usamos.
 */
function getLiningFigureMap(otFont) {
    if (liningFigureMaps.has(otFont)) return liningFigureMaps.get(otFont);
    const map = new Map();
    try {
        const subs = otFont.substitution?.getSingle('lnum', 'latn', 'dflt')
            || otFont.substitution?.getSingle('lnum', 'DFLT', 'dflt')
            || [];
        subs.forEach(({ sub, by }) => map.set(sub, by));
    } catch (e) {
        // Fuente sin tabla GSUB: se usan sus números tal cual
    }
    liningFigureMaps.set(otFont, map);
    return map;
}

/**
 * Igual que otFont.getPath, pero sustituyendo los dígitos por sus versiones alineadas a mayúsculas
 */
function getTextPath(otFont, text, fontSize) {
    const lining = getLiningFigureMap(otFont);
    if (lining.size === 0 || !/[0-9]/.test(text)) {
        return otFont.getPath(text, 0, 0, fontSize);
    }

    const scale = fontSize / otFont.unitsPerEm;
    const glyphs = otFont.stringToGlyphs(text).map(g => (lining.has(g.index) ? otFont.glyphs.get(lining.get(g.index)) : g));
    const path = new window.opentype.Path();
    let x = 0;
    glyphs.forEach((glyph, i) => {
        path.extend(glyph.getPath(x, 0, fontSize));
        x += glyph.advanceWidth * scale;
        if (i < glyphs.length - 1) x += otFont.getKerningValue(glyph, glyphs[i + 1]) * scale;
    });
    return path;
}

/**
 * Caja horizontal que se usa para ESPACIAR un carácter.
 * En letras acentuadas angostas (í, ì, ï) la tilde sobresale de la letra y ensanchaba su caja, dejando un
 * hueco visible después ("Económí a"). Se espacia con la caja de la letra base (sin tilde), como en tipografía
 * impresa: la tilde puede sobresalir sin empujar a la letra siguiente.
 * @returns {{minX: number, maxX: number} | null} null = usar la caja propia de la geometría
 */
export function glyphLayoutBounds(otFont, charStr, sizeMm, bevelMm = 0) {
    if (!otFont || otFont.isCanvasFallback || [...charStr].length !== 1) return null;
    const decomposed = charStr.normalize('NFD');
    if (decomposed === charStr) return null;

    const base = decomposed[0];
    const box = getTextPath(otFont, base, sizeMm * 1.32).getBoundingBox();
    if (!isFinite(box.x1) || !isFinite(box.x2) || box.x2 <= box.x1) return null;
    // El bisel engrosa el contorno (bevelSize = bevelMm * 0.65, igual que en la extrusión)
    const pad = bevelMm > 0 ? bevelMm * 0.65 : 0;
    return { minX: box.x1 - pad, maxX: box.x2 + pad };
}

/**
 * CONVERSOR VECTORIAL UTF-8: Convierte cualquier carácter (incluyendo Á, É, Í, Ó, Ú, Ñ, Ü) desde OpenType a THREE.ExtrudeGeometry
 */
export function createUTF8CharExtrudeGeometry(otFont, charStr, sizeMm, depthMm, bevelMm) {
    if (!otFont) return null;
    if (otFont.isCanvasFallback) {
        return traceCharFromCanvas2D(charStr, otFont.cssFamily, sizeMm, depthMm, bevelMm);
    }

    // Escala proporcional respecto al tamaño nominal en mm
    const fontScaleSize = sizeMm * 1.32;
    const otPath = getTextPath(otFont, charStr, fontScaleSize);
    const svgPathData = otPath.toPathData(3);

    if (!svgPathData || svgPathData.trim() === '') return null;

    // Parsear mediante SVGLoader para resolver contornos exteriores e interiores (huecos de O, A, B, D, R y tildes)
    const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${svgPathData}" /></svg>`;
    const svgLoader = new SVGLoader();
    const svgParsed = svgLoader.parse(svgMarkup);

    const shapes = [];
    svgParsed.paths.forEach(p => {
        const subShapes = SVGLoader.createShapes(p);
        subShapes.forEach(s => shapes.push(s));
    });

    if (shapes.length === 0) return null;

    const extrudeGeo = new THREE.ExtrudeGeometry(shapes, {
        depth: depthMm,
        steps: 1,
        curveSegments: 8,
        bevelEnabled: bevelMm > 0,
        bevelThickness: bevelMm,
        bevelSize: bevelMm * 0.65,
        bevelOffset: 0,
        bevelSegments: 3
    });

    // Invertir Y (el SVG tiene el origen arriba a la izquierda)
    extrudeGeo.scale(1, -1, 1);
    // Invertir orden de enrollado para mallas sólidas
    flipGeometryWindingOrder(extrudeGeo);

    extrudeGeo.computeBoundingBox();
    return extrudeGeo;
}
