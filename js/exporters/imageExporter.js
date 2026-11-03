import * as THREE from 'three';
import { cadState } from '../config/state.js';
import { institutionalFonts } from '../config/fonts.js';
import { printableRoot, hangingRoot } from '../scene/sceneManager.js';
import { rebuildSignCAD } from '../cad/signGenerator.js';
import { rebuildHangingSignCAD } from '../cad/hangingSignGenerator.js';
import { sanitizeFileName, downloadBlob } from './exportUtils.js';

let cachedRenderer = null;
let cachedCanvas = null;

/**
 * Obtiene o inicializa un WebGLRenderer fuera de pantalla dedicado
 */
function getOffscreenRenderer(width, height) {
    if (!cachedRenderer) {
        cachedCanvas = document.createElement('canvas');
        cachedRenderer = new THREE.WebGLRenderer({
            canvas: cachedCanvas,
            antialias: true,
            preserveDrawingBuffer: true,
            alpha: false
        });
        cachedRenderer.outputColorSpace = THREE.SRGBColorSpace;
        cachedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        cachedRenderer.toneMappingExposure = 1.05;
        cachedRenderer.shadowMap.enabled = true;
        cachedRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    cachedCanvas.width = width;
    cachedCanvas.height = height;
    cachedRenderer.setSize(width, height, false);
    cachedRenderer.setClearColor(0xffffff, 1.0);
    return { renderer: cachedRenderer, canvas: cachedCanvas };
}

/**
 * Renderiza el diseño activo (sobremesa o colgante) en una imagen PNG con fondo blanco
 * @param {Object} options Opciones de exportación
 * @returns {Promise<Blob>} Blob de la imagen PNG generada
 */
export async function renderSignImageBlob(options = {}) {
    const {
        viewMode = 'orthographic',       // 'orthographic' (1:1 plano) o 'perspective' (3D frontal elevado como Imagen 2)
        includeGuides = true,            // Marcas de corte, cotas en mm y barra de calibración
        targetWidth = 2400,              // Ancho de resolución (ultra nítido para impresión)
        targetHeight = 1600              // Alto de resolución
    } = options;

    const isHanging = cadState.activeWorkspace === 'hanging';
    const sourceRoot = isHanging ? hangingRoot : printableRoot;

    if (!sourceRoot || sourceRoot.children.length === 0) {
        throw new Error('No hay diseño activo para exportar.');
    }

    // 1. Crear escena offscreen con fondo blanco puro
    const exportScene = new THREE.Scene();
    exportScene.background = new THREE.Color(0xffffff);

    // 2. Iluminación neutra de alta fidelidad para preservar colores reales sin oscurecer
    const ambLight = new THREE.AmbientLight(0xffffff, 1.05);
    exportScene.add(ambLight);

    // 3. Clonar la jerarquía del diseño para no alterar la escena en vivo
    const clonedGroup = sourceRoot.clone(true);
    exportScene.add(clonedGroup);
    exportScene.updateMatrixWorld(true);

    // 4. Calcular límites y centrar exactamente en el origen (0,0,0)
    const box = new THREE.Box3().setFromObject(clonedGroup);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    clonedGroup.position.sub(center);
    clonedGroup.updateMatrixWorld(true);

    // Dimensiones físicas reales del diseño
    const physicalWidthMm = Math.round(size.x);
    const physicalHeightMm = isHanging ? Math.round(size.z) : Math.round(size.y);
    const physicalDepthMm = isHanging ? Math.round(size.y * 10) / 10 : Math.round(size.z * 10) / 10;

    // Luz principal cenital-frontal que crea relieve y sombras suaves como en la Imagen 2
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.75);
    keyLight.position.set(size.x * 0.2, -Math.max(size.y * 1.5, 120), Math.max(size.z * 8, 260));
    keyLight.castShadow = true;
    exportScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
    fillLight.position.set(-size.x * 0.3, size.y * 0.9, 180);
    exportScene.add(fillLight);

    // 5. Configurar cámara según modo
    let camera;
    let pixelsPerMm = 1;
    let targetW = size.x;
    let targetH = isHanging ? size.z : size.y;

    if (viewMode === 'orthographic') {
        const marginFactor = includeGuides ? 1.42 : 1.15;
        let viewW = targetW * marginFactor;
        let viewH = targetH * marginFactor;

        const canvasAspect = targetWidth / targetHeight;
        const targetAspect = viewW / viewH;

        if (canvasAspect > targetAspect) {
            viewW = viewH * canvasAspect;
        } else {
            viewH = viewW / canvasAspect;
        }

        camera = new THREE.OrthographicCamera(
            -viewW / 2, viewW / 2,
            viewH / 2, -viewH / 2,
            1, 3500
        );

        if (isHanging) {
            // Rótulo colgante: Frente en plano XZ, mirar desde -Y hacia el frente
            camera.position.set(0, -900, 0);
            camera.up.set(0, 0, 1);
            camera.lookAt(0, 0, 0);
        } else {
            // Letrero de mesa: Frente en plano XY, mirar desde +Z hacia abajo
            camera.position.set(0, 0, 900);
            camera.up.set(0, 1, 0);
            camera.lookAt(0, 0, 0);
        }

        pixelsPerMm = targetWidth / viewW;
    } else {
        // MODO PERSPECTIVA 3D EXACTAMENTE COMO EN LA IMAGEN 2:
        // Placa horizontal en X (sin rotación lateral), vista desde el frente elevado a ~30°
        const fov = 30;
        camera = new THREE.PerspectiveCamera(fov, targetWidth / targetHeight, 10, 4500);

        const canvasAspect = targetWidth / targetHeight;
        const halfFovRad = (fov / 2) * (Math.PI / 180);
        const tanHalfHoriz = Math.tan(halfFovRad) * canvasAspect;

        // Calcular distancia óptima para encuadrar la placa horizontalmente con márgenes estéticos
        const fitW = size.x * (includeGuides ? 1.45 : 1.25);
        const distToFitX = (fitW / 2) / tanHalfHoriz;
        const fitY = (isHanging ? size.z : size.y) * (includeGuides ? 1.6 : 1.35);
        const distToFitY = (fitY / 2) / Math.tan(halfFovRad);
        const dist = Math.max(distToFitX, distToFitY, 260);

        if (isHanging) {
            // Rótulo colgante: Frente en plano XZ, cámara frontal con leve perspectiva
            camera.position.set(0, -dist * 0.98, dist * 0.12);
            camera.up.set(0, 0, 1);
            camera.lookAt(0, 0, 0);
        } else {
            // Letrero de sobremesa/anaquel: Placa horizontal en X, cámara en X = 0 elevada a 30°
            // Exactamente el ángulo y encuadre de la Imagen 2
            const elevAngle = 30 * (Math.PI / 180);
            const camY = -dist * Math.cos(elevAngle);
            const camZ = dist * Math.sin(elevAngle);
            camera.position.set(0, camY, camZ);
            camera.up.set(0, 0, 1);
            camera.lookAt(0, 0, 0);
        }
    }

    camera.updateProjectionMatrix();

    // 6. Renderizar en el canvas offscreen
    const { renderer, canvas } = getOffscreenRenderer(targetWidth, targetHeight);
    renderer.render(exportScene, camera);

    // 7. Crear canvas final 2D compuesto para agregar información técnica y marcas de corte
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetWidth;
    finalCanvas.height = targetHeight;
    const ctx = finalCanvas.getContext('2d');

    // Fondo blanco puro
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    // Dibujar el render 3D del letrero
    ctx.drawImage(canvas, 0, 0);

    // 8. Si se solicitaron guías, dibujar cotas métricas, marcas de corte y calibración
    if (includeGuides) {
        drawProofOverlays(ctx, {
            width: finalCanvas.width,
            height: finalCanvas.height,
            viewMode,
            isHanging,
            physicalWidthMm,
            physicalHeightMm,
            physicalDepthMm,
            pixelsPerMm,
            targetW,
            targetH
        });
    }

    // 9. Convertir a Blob PNG
    return new Promise((resolve, reject) => {
        finalCanvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('No se pudo generar el archivo PNG'));
        }, 'image/png');
    });
}

/**
 * Dibuja las cotas, marcas de corte L y regla de calibración sobre el lienzo
 */
function drawProofOverlays(ctx, info) {
    const {
        width,
        height,
        viewMode,
        isHanging,
        physicalWidthMm,
        physicalHeightMm,
        physicalDepthMm,
        pixelsPerMm,
        targetW,
        targetH
    } = info;

    const rawSignText = isHanging
        ? (cadState.hanging.plates[0]?.text || 'RÓTULO COLGANTE')
        : (document.getElementById('sign-text')?.value || 'LETRERO');
    const signText = rawSignText.replace(/[\r\n]+/g, ' / ');

    const styleLabels = {
        modular: 'Bloques Maker (Modular)',
        solid: 'Corpóreo ABC (Monolitos con Peana Escalonada)',
        filigree: 'Capitular Clásica (Cartela Iluminada & Tabula Ansata)',
        classic: 'Capitular Clásica (Marco Arquitectónico)',
        plaque: 'Placa Wayfinding (Franja Dewey)',
        shelf_clip: 'Canto de Anaquel (Pinza Trasera 19mm)',
        wedge: 'Cuña Ejecutiva de Escritorio (Ángulo Suave)',
        ceiling: 'Rótulo Colgante de Techo (Rieles y Tensores)'
    };
    const styleName = isHanging ? 'Rótulo Colgante Modular de Anaquel' : (styleLabels[cadState.style] || cadState.style);
    const fontKey = isHanging ? (cadState.hanging.plates[0]?.font || 'arial') : (document.getElementById('param-font')?.value || 'arial');
    const fontName = institutionalFonts[fontKey]?.name || fontKey;

    // Encabezado superior institucional
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 36px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillText('BIBLIOSIGN 3D CAD • PLANTILLA DE PRUEBA PARA IMPRESIÓN EN PAPEL', 80, 85);

    ctx.fillStyle = '#475569';
    ctx.font = '500 24px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillText(`Diseño: "${signText}"  |  Estilo: ${styleName}  |  Tipografía: ${fontName}`, 80, 125);

    // Recuadro de especificaciones físicas reales
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(80, 155, 680, 64, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillText(`📐 Medidas 1:1: ${physicalWidthMm} mm (Ancho) × ${physicalHeightMm} mm (Alto) × ${physicalDepthMm} mm (Espesor)`, 100, 195);
    ctx.restore();

    // En vista ortográfica: marcas de corte y cotas milimétricas precisas
    if (viewMode === 'orthographic') {
        const cx = width / 2;
        const cy = height / 2;
        const signW_px = targetW * pixelsPerMm;
        const signH_px = targetH * pixelsPerMm;

        const x1 = cx - signW_px / 2;
        const x2 = cx + signW_px / 2;
        const y1 = cy - signH_px / 2;
        const y2 = cy + signH_px / 2;

        ctx.save();
        // Marcas de corte en las 4 esquinas (L-marks)
        const markLen = 32;
        const offset = 8;
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;

        // Esquina superior izquierda
        ctx.beginPath();
        ctx.moveTo(x1 - offset, y1 - offset - markLen);
        ctx.lineTo(x1 - offset, y1 - offset);
        ctx.lineTo(x1 - offset - markLen, y1 - offset);
        // Esquina superior derecha
        ctx.moveTo(x2 + offset, y1 - offset - markLen);
        ctx.lineTo(x2 + offset, y1 - offset);
        ctx.lineTo(x2 + offset + markLen, y1 - offset);
        // Esquina inferior derecha
        ctx.moveTo(x2 + offset, y2 + offset + markLen);
        ctx.lineTo(x2 + offset, y2 + offset);
        ctx.lineTo(x2 + offset + markLen, y2 + offset);
        // Esquina inferior izquierda
        ctx.moveTo(x1 - offset, y2 + offset + markLen);
        ctx.lineTo(x1 - offset, y2 + offset);
        ctx.lineTo(x1 - offset - markLen, y2 + offset);
        ctx.stroke();

        // Línea de cota horizontal (Ancho mm)
        const dimY = y2 + 45;
        ctx.strokeStyle = '#0284c7';
        ctx.fillStyle = '#0284c7';
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.moveTo(x1, dimY);
        ctx.lineTo(x2, dimY);
        // Flechas de cota
        ctx.moveTo(x1 + 14, dimY - 7);
        ctx.lineTo(x1, dimY);
        ctx.lineTo(x1 + 14, dimY + 7);
        ctx.moveTo(x2 - 14, dimY - 7);
        ctx.lineTo(x2, dimY);
        ctx.lineTo(x2 - 14, dimY + 7);
        ctx.stroke();

        ctx.font = 'bold 22px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`⟵  ${physicalWidthMm} mm de Ancho Real  ⟶`, cx, dimY - 12);

        // Línea de cota vertical (Alto mm)
        const dimX = x2 + 45;
        ctx.beginPath();
        ctx.moveTo(dimX, y1);
        ctx.lineTo(dimX, y2);
        // Flechas
        ctx.moveTo(dimX - 7, y1 + 14);
        ctx.lineTo(dimX, y1);
        ctx.lineTo(dimX + 7, y1 + 14);
        ctx.moveTo(dimX - 7, y2 - 14);
        ctx.lineTo(dimX, y2);
        ctx.lineTo(dimX + 7, y2 - 14);
        ctx.stroke();

        ctx.save();
        ctx.translate(dimX + 28, cy);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`⟵  ${physicalHeightMm} mm de Alto  ⟶`, 0, 0);
        ctx.restore();

        ctx.restore();
    }

    // Pie de página: Regla de calibración de 50 mm y advertencia de escala de impresión
    ctx.save();
    const bottomY = height - 120;

    // Regla de calibración de 50 mm reales
    const rulerLenMm = 50;
    const rulerLenPx = rulerLenMm * (pixelsPerMm || 7.5);
    const rulerX = width - rulerLenPx - 100;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(rulerX, bottomY + 30, rulerLenPx, 8);

    // Ticks de la regla (cada 10 mm)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    for (let i = 0; i <= 5; i++) {
        const tx = rulerX + (i * 10 * (pixelsPerMm || 7.5));
        const tickH = (i === 0 || i === 5) ? 22 : 12;
        ctx.beginPath();
        ctx.moveTo(tx, bottomY + 30 - tickH);
        ctx.lineTo(tx, bottomY + 30);
        ctx.stroke();
    }

    ctx.font = 'bold 18px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.fillText('0', rulerX - 6, bottomY + 5);
    ctx.fillText('50 mm', rulerX + rulerLenPx - 30, bottomY + 5);

    ctx.font = '600 16px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('REGLA DE CALIBRACIÓN:', rulerX, bottomY - 18);
    ctx.font = '14px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillText('Verifica con regla física que mida 5 cm para confirmar escala 1:1', rulerX, bottomY + 60);

    // Instrucciones de impresión
    ctx.fillStyle = '#047857';
    ctx.font = 'bold 20px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillText('🖨️ INSTRUCCIONES DE IMPRESIÓN EN PAPEL:', 80, bottomY);
    ctx.fillStyle = '#334155';
    ctx.font = '16px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillText('1. Configura tu impresora en Escala 100% ("Tamaño real" / Sin ajustar a página ni márgenes automáticos).', 80, bottomY + 28);
    ctx.fillText('2. Recorta por las marcas grises con tijeras o cúter para probar en el anaquel físico antes de imprimir en 3D.', 80, bottomY + 52);
    ctx.restore();
}

/**
 * Descarga directamente la imagen PNG en alta resolución con fondo blanco
 * @param {Object} options Opciones de vista y cotas
 */
export async function downloadPaperProofPNG(options = {}) {
    try {
        const blob = await renderSignImageBlob(options);
        const isHanging = cadState.activeWorkspace === 'hanging';
        const signText = isHanging
            ? (cadState.hanging.plates[0]?.text || 'Rotulo_Colgante')
            : (document.getElementById('sign-text')?.value || 'Letrero');

        const cleanText = sanitizeFileName(signText);
        const styleSuffix = isHanging ? 'Colgante' : cadState.style;
        const fontKey = isHanging ? (cadState.hanging.plates[0]?.font || 'arial') : (document.getElementById('param-font')?.value || 'arial');
        const modeSuffix = options.viewMode === 'perspective' ? '3D' : 'Plano1a1';
        const filename = `Plantilla_Papel_${cleanText}_${styleSuffix}_${fontKey}_${modeSuffix}.png`;

        downloadBlob(blob, filename);
        return true;
    } catch (err) {
        console.error('Error al exportar imagen para papel:', err);
        throw err;
    }
}

/**
 * Genera una serie de renders del diseño estructural actual usando cada una de las fuentes institucionales
 * @param {Object} options Opciones de render
 * @param {Function} onProgress Callback de progreso (current, total, fontName)
 * @returns {Promise<Array>} Lista de objetos { fontKey, fontName, blob, filename }
 */
export async function generateAllFontProofs(options = {}, onProgress = null) {
    const isHanging = cadState.activeWorkspace === 'hanging';
    const fontKeys = Object.keys(institutionalFonts);
    const results = [];

    // Guardar estado original
    const origFontSelect = document.getElementById('param-font');
    const origFontVal = origFontSelect ? origFontSelect.value : 'arial';
    const origHangingFonts = isHanging
        ? cadState.hanging.plates.map(p => p.font)
        : null;

    try {
        for (let i = 0; i < fontKeys.length; i++) {
            const fKey = fontKeys[i];
            const fontMeta = institutionalFonts[fKey];

            if (onProgress) {
                onProgress(i + 1, fontKeys.length, fontMeta.name);
            }

            // Aplicar fuente al CAD activo
            if (isHanging) {
                cadState.hanging.plates.forEach(p => { p.font = fKey; });
                await rebuildHangingSignCAD();
            } else {
                if (origFontSelect) origFontSelect.value = fKey;
                await rebuildSignCAD();
            }

            // Pausa breve para estabilizar matrices Three.js
            await new Promise(r => setTimeout(r, 70));

            // Renderizar imagen con la fuente aplicada
            const blob = await renderSignImageBlob(options);

            const signText = isHanging
                ? (cadState.hanging.plates[0]?.text || 'Rotulo')
                : (document.getElementById('sign-text')?.value || 'Letrero');
            const cleanText = sanitizeFileName(signText);
            const styleSuffix = isHanging ? 'Colgante' : cadState.style;
            const modeSuffix = options.viewMode === 'perspective' ? '3D' : 'Plano1a1';
            const filename = `Plantilla_${cleanText}_${styleSuffix}_${i + 1}_${fKey}_${modeSuffix}.png`;

            results.push({
                fontKey: fKey,
                fontName: fontMeta.name,
                blob,
                filename
            });
        }
    } finally {
        // Restaurar estado original del usuario
        if (isHanging) {
            cadState.hanging.plates.forEach((p, idx) => {
                p.font = origHangingFonts[idx] || 'arial';
            });
            await rebuildHangingSignCAD();
        } else {
            if (origFontSelect) origFontSelect.value = origFontVal;
            await rebuildSignCAD();
        }
    }

    return results;
}

/**
 * Descarga secuencialmente las imágenes de todas las fuentes generadas
 */
export async function downloadAllFontProofs(options = {}, onProgress = null) {
    const proofs = await generateAllFontProofs(options, onProgress);
    for (let i = 0; i < proofs.length; i++) {
        downloadBlob(proofs[i].blob, proofs[i].filename);
        if (i < proofs.length - 1) {
            await new Promise(r => setTimeout(r, 250));
        }
    }
    return proofs;
}
