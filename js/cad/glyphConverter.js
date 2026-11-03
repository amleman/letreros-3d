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
    const otPath = otFont.getPath(charStr, 0, 0, fontScaleSize);
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
