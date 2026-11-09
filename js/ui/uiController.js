import { cadState } from '../config/state.js';
import {
    toggleVitrinaDesign,
    removeVitrinaDesign,
    addWorkLogEntry,
    removeWorkLogEntry,
    updateAssignedHours,
    publishCalculatorEstimate
} from './vitrinaPanel.js';
import { palettes, loadUserPalettes, saveUserPalette, deleteUserPalette } from '../config/palettes.js';
import { rebuildSignCAD, fitSignTo25cmBed } from '../cad/signGenerator.js';
import { rebuildHangingSignCAD } from '../cad/hangingSignGenerator.js';
import { refreshEnvironment, onWindowResize, resetCameraView, setSceneWorkspace } from '../scene/sceneManager.js';
import { exportBambu3MF, exportSegmentParts3MF, exportJointTest3MF } from '../exporters/threeMfExporter.js';
import { exportMultiOBJ } from '../exporters/objExporter.js';
import { exportSTL, exportStandaloneMedallionsSTL } from '../exporters/stlExporter.js';
import { exportHanging3MF, exportHangingSTL } from '../exporters/hangingExporter.js';
import { downloadBlob } from '../exporters/exportUtils.js';
import { renderSignImageBlob, downloadPaperProofPNG, generateAllFontProofs, downloadAllFontProofs } from '../exporters/imageExporter.js';
import { loadCustomLogoFromFile } from '../cad/logoBuilder.js';
import { updatePitchCalculator, copyPitchScript } from './calculator.js';
import {
    saveUserPreset,
    deleteUserPreset,
    loadUserPresetById,
    renderUserPresetsList,
    restoreLastSession,
    encodeConfigToUrlHash,
    captureCurrentConfig,
    STORAGE_SAVED_CONFIGS_KEY
} from '../config/persistence.js';

/**
 * Notificación Toast Flotante
 */
export function showToast(title, desc) {
    const toast = document.getElementById('toast-notification') || document.getElementById('visor-toast');
    const titleEl = document.getElementById('toast-title') || document.getElementById('visor-toast-title');
    const descEl = document.getElementById('toast-desc') || document.getElementById('visor-toast-desc');
    if (!toast || !titleEl || !descEl) return;

    titleEl.textContent = title;
    descEl.textContent = desc;
    toast.classList.remove('opacity-0', 'translate-y-3');

    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-3');
    }, 3800);
}

/**
 * Modal Guía de Bambu Studio (Pintar en AMS)
 */
export function toggleBambuModal(show) {
    const modal = document.getElementById('bambu-modal');
    if (modal) {
        modal.classList.toggle('hidden', !show);
    }
}

/**
 * Modal / Panel Desplegable de Consejos Técnicos (Las 3 tarjetas de la Imagen 1)
 */
export function toggleTechTipsModal(show) {
    const modal = document.getElementById('tech-tips-modal');
    if (modal) {
        modal.classList.toggle('hidden', !show);
    }
}

/**
 * Modal de Exportación para Imprimir en Papel (PNG Fondo Blanco)
 */
let currentProofBlobUrl = null;

export async function openPaperProofModal() {
    const modal = document.getElementById('paper-proof-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }
    updatePaperProofPreview();
}

export function closePaperProofModal() {
    const modal = document.getElementById('paper-proof-modal');
    if (modal) modal.classList.add('hidden');
    showSingleProofView();
    if (currentProofBlobUrl) {
        URL.revokeObjectURL(currentProofBlobUrl);
        currentProofBlobUrl = null;
    }
}

export async function updatePaperProofPreview() {
    const previewImg = document.getElementById('paper-proof-img');
    const loadingSpinner = document.getElementById('paper-proof-spinner');
    if (!previewImg) return;

    if (loadingSpinner) loadingSpinner.classList.remove('hidden');
    previewImg.classList.add('opacity-40');

    const viewMode = document.querySelector('input[name="proof-view-mode"]:checked')?.value || 'orthographic';
    const includeGuides = document.getElementById('proof-guides-toggle')?.checked ?? true;

    try {
        const blob = await renderSignImageBlob({
            viewMode,
            includeGuides,
            targetWidth: 1600,
            targetHeight: 1060
        });

        if (currentProofBlobUrl) {
            URL.revokeObjectURL(currentProofBlobUrl);
        }
        currentProofBlobUrl = URL.createObjectURL(blob);
        previewImg.src = currentProofBlobUrl;
        previewImg.onload = () => {
            previewImg.classList.remove('opacity-40');
            if (loadingSpinner) loadingSpinner.classList.add('hidden');
        };
    } catch (err) {
        console.error('Error generando preview de papel:', err);
        if (loadingSpinner) loadingSpinner.classList.add('hidden');
    }
}

export async function downloadPaperProofFromModal() {
    const viewMode = document.querySelector('input[name="proof-view-mode"]:checked')?.value || 'orthographic';
    const includeGuides = document.getElementById('proof-guides-toggle')?.checked ?? true;
    const btn = document.getElementById('btn-download-proof-modal');

    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-75');
    }

    try {
        showToast('Generando PNG...', 'Preparando imagen de 2400 px con fondo blanco');
        await downloadPaperProofPNG({
            viewMode,
            includeGuides,
            targetWidth: 2400,
            targetHeight: 1600
        });
        showToast('¡Plantilla PNG Descargada!', 'Lista con fondo blanco para imprimir al 100% en papel');
    } catch (err) {
        showToast('Error', 'No se pudo generar la imagen PNG');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-75');
        }
    }
}

export async function quickDownloadPaperPNG() {
    try {
        showToast('Generando PNG...', 'Exportando plantilla frontal a escala en fondo blanco');
        await downloadPaperProofPNG({
            viewMode: 'orthographic',
            includeGuides: true,
            targetWidth: 2400,
            targetHeight: 1600
        });
        showToast('¡Plantilla PNG Descargada!', 'Lista para imprimir en papel y probar en anaquel');
    } catch (err) {
        showToast('Error', 'No se pudo generar la imagen PNG');
    }
}

/**
 * Genera una serie de renders comparativos con las 6 fuentes institucionales
 */
export async function runBatchFontComparison() {
    const singleView = document.getElementById('paper-proof-single-view');
    const galleryView = document.getElementById('paper-proof-gallery-view');
    const galleryGrid = document.getElementById('paper-proof-gallery-grid');
    const progressEl = document.getElementById('paper-proof-batch-progress');
    const progressText = document.getElementById('paper-proof-batch-text');
    const btnBatch = document.getElementById('btn-batch-fonts');

    if (!galleryView || !galleryGrid) return;

    if (btnBatch) {
        btnBatch.disabled = true;
        btnBatch.classList.add('opacity-50');
    }
    if (progressEl) progressEl.classList.remove('hidden');

    const viewMode = document.querySelector('input[name="proof-view-mode"]:checked')?.value || 'orthographic';
    const includeGuides = document.getElementById('proof-guides-toggle')?.checked ?? true;

    try {
        const proofs = await generateAllFontProofs({
            viewMode,
            includeGuides,
            targetWidth: 1600,
            targetHeight: 1060
        }, (current, total, fontName) => {
            if (progressText) {
                progressText.textContent = `Generando diseño ${current} de ${total}: ${fontName}...`;
            }
        });

        // Guardar para descargas
        window._lastGeneratedFontProofs = proofs;

        // Renderizar cuadrícula de las fuentes
        galleryGrid.innerHTML = proofs.map((p, idx) => `
            <div class="bg-white border-2 border-slate-200 hover:border-indigo-500 rounded-xl p-3 shadow-md transition flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200">
                        <span class="text-xs font-extrabold text-slate-800">${idx + 1}. ${p.fontName}</span>
                        <span class="text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded">Fondo Blanco</span>
                    </div>
                    <div class="h-32 sm:h-36 flex items-center justify-center overflow-hidden bg-slate-50 rounded-lg p-1">
                        <img src="${URL.createObjectURL(p.blob)}" alt="${p.fontName}" class="max-h-full max-w-full object-contain">
                    </div>
                </div>
                <button onclick="window.downloadSingleFontProof(${idx})" class="mt-2.5 w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1.5">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i>
                    <span>Descargar ${p.fontName.split(' ')[0]}</span>
                </button>
            </div>
        `).join('');

        if (window.lucide && window.lucide.createIcons) {
            window.lucide.createIcons();
        }

        if (singleView) singleView.classList.add('hidden');
        galleryView.classList.remove('hidden');
    } catch (err) {
        console.error('Error generando comparativa de fuentes:', err);
        showToast('Error', 'No se pudo generar la comparativa de fuentes');
    } finally {
        if (progressEl) progressEl.classList.add('hidden');
        if (btnBatch) {
            btnBatch.disabled = false;
            btnBatch.classList.remove('opacity-50');
        }
    }
}

export function showSingleProofView() {
    const singleView = document.getElementById('paper-proof-single-view');
    const galleryView = document.getElementById('paper-proof-gallery-view');
    if (singleView) singleView.classList.remove('hidden');
    if (galleryView) galleryView.classList.add('hidden');
}

export function downloadSingleFontProof(idx) {
    const proof = window._lastGeneratedFontProofs?.[idx];
    if (proof) {
        downloadBlob(proof.blob, proof.filename);
        showToast('Descargado', `Plantilla con fuente ${proof.fontName} descargada`);
    }
}

export async function downloadAllFontProofsBatch() {
    const proofs = window._lastGeneratedFontProofs;
    if (!proofs || proofs.length === 0) {
        showToast('Aviso', 'Primero genera las imágenes de las fuentes');
        return;
    }
    showToast('Descargando las fuentes...', 'Iniciando descarga secuencial de archivos PNG');
    for (let i = 0; i < proofs.length; i++) {
        downloadBlob(proofs[i].blob, proofs[i].filename);
        if (i < proofs.length - 1) {
            await new Promise(r => setTimeout(r, 250));
        }
    }
    showToast('¡Descarga completada!', 'Se descargaron todas las plantillas PNG para imprimir en papel');
}

/**
 * Acordeón dinámico para compactar/expandir secciones del panel izquierdo
 */
export function toggleSectionAccordion(secId) {
    const content = document.getElementById(`content-${secId}`);
    const icon = document.getElementById(`icon-${secId}`);
    if (!content) return;

    const isHidden = content.classList.contains('hidden');
    content.classList.toggle('hidden', !isHidden);
    if (icon) {
        icon.classList.toggle('rotate-180', !isHidden);
    }
}

export function collapseAllSections() {
    ['sec-texto', 'sec-tipografia', 'sec-estilo', 'sec-medidas', 'sec-colores'].forEach(id => {
        const content = document.getElementById(`content-${id}`);
        const icon = document.getElementById(`icon-${id}`);
        if (content) content.classList.add('hidden');
        if (icon) icon.classList.add('rotate-180');
    });
}

export function expandAllSections() {
    ['sec-texto', 'sec-tipografia', 'sec-estilo', 'sec-medidas', 'sec-colores'].forEach(id => {
        const content = document.getElementById(`content-${id}`);
        const icon = document.getElementById(`icon-${id}`);
        if (content) content.classList.remove('hidden');
        if (icon) icon.classList.remove('rotate-180');
    });
}

/**
 * Vista Explosiva de Capas
 */
export function toggleExplodeView() {
    cadState.explodedView = !cadState.explodedView;
    const btn = document.getElementById('btn-explode-toggle');
    if (btn) {
        btn.classList.toggle('bg-sky-500/20', cadState.explodedView);
    }
    if (cadState.activeWorkspace === 'hanging') {
        rebuildHangingSignCAD();
    } else {
        rebuildSignCAD();
    }
}

/**
 * Alternar entre Estante de Madera y Cama de Impresión 3D (25 cm)
 */
export function toggleShelfContext() {
    cadState.showShelf = !cadState.showShelf;
    const btn = document.getElementById('btn-shelf-toggle');
    if (btn) {
        btn.classList.toggle('text-amber-300', cadState.showShelf);
        btn.classList.toggle('text-slate-400', !cadState.showShelf);
    }
    refreshEnvironment();
}

/**
 * Alternar Malla CAD / Wireframe
 */
export function toggleWireframe() {
    cadState.wireframe = !cadState.wireframe;
    if (cadState.activeWorkspace === 'hanging') {
        rebuildHangingSignCAD();
    } else {
        rebuildSignCAD();
    }
}

/**
 * Cambiar pestaña principal entre los 3 espacios:
 * 'design' (Letreros de Mesa / Sobremesa)
 * 'hanging' (Rótulos Colgantes de Anaquel)
 * 'pitch' (Calculadora de Horas)
 */
export function switchMainTab(tab) {
    const viewDesign = document.getElementById('view-design');
    const viewHanging = document.getElementById('view-hanging');
    const viewPitch = document.getElementById('view-pitch');

    const tabDesign = document.getElementById('tab-design');
    const tabHanging = document.getElementById('tab-hanging');
    const tabPitch = document.getElementById('tab-pitch');

    // Desactivar todos los botones de pestaña
    [tabDesign, tabHanging, tabPitch].forEach(btn => {
        if (btn) btn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-slate-300 hover:text-white";
    });

    // Ocultar todas las vistas
    viewDesign?.classList.add('hidden');
    viewHanging?.classList.add('hidden');
    viewPitch?.classList.add('hidden');

    if (tab === 'design') {
        viewDesign?.classList.remove('hidden');
        if (tabDesign) tabDesign.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-amber-500 text-slate-950 shadow";
        setSceneWorkspace('tabletop');
        rebuildSignCAD();
    } else if (tab === 'hanging') {
        viewHanging?.classList.remove('hidden');
        if (tabHanging) tabHanging.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-emerald-500 text-slate-950 shadow";
        setSceneWorkspace('hanging');
        rebuildHangingSignCAD();
        renderHangingPlatesList();
    } else if (tab === 'pitch') {
        viewPitch?.classList.remove('hidden');
        if (tabPitch) tabPitch.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-amber-500 text-slate-950 shadow";
    }

    onWindowResize();
}

/**
 * Selección de Estilo Arquitectónico (Incluyendo los 2 nuevos estilos)
 */
export function selectStyle(styleName) {
    cadState.style = styleName;
    ['modular', 'solid', 'filigree', 'plaque', 'shelf_clip', 'wedge', 'ceiling'].forEach(s => {
        const btn = document.getElementById(`style-btn-${s}`);
        if (!btn) return;
        if (s === styleName) {
            btn.className = "text-left p-2.5 rounded-xl border-2 border-amber-500 bg-amber-500/10 transition";
        } else {
            btn.className = "text-left p-2.5 rounded-xl border border-slate-700 bg-slate-900/60 hover:border-slate-600 transition";
        }
    });

    const plaquePanel = document.getElementById('plaque-options-panel');
    if (plaquePanel) {
        plaquePanel.classList.toggle('hidden', styleName !== 'plaque');
    }

    const wedgePanel = document.getElementById('wedge-options-panel');
    if (wedgePanel) {
        wedgePanel.classList.toggle('hidden', styleName !== 'wedge');
    }

    const ceilingPanel = document.getElementById('ceiling-options-panel');
    if (ceilingPanel) {
        ceilingPanel.classList.toggle('hidden', styleName !== 'ceiling');
    }

    rebuildSignCAD();
}

/**
 * Ajustar rótulo al tamaño de cama de 25 cm (250 mm)
 */
export function fitSignToBed() {
    fitSignTo25cmBed(240);
    showToast('Ajustado a Cama de 25 cm', 'El tamaño se adaptó para caber dentro del límite de 250 mm');
}

/**
 * Aplicar Paleta de Colores por defecto
 */
export function applyPalette(paletteKey) {
    const p = palettes[paletteKey];
    if (!p) return;

    const faceInput = document.getElementById('color-face');
    const accentInput = document.getElementById('color-accent');
    const baseInput = document.getElementById('color-base');

    cadState.useMultiColor = p.multi;
    if (faceInput) faceInput.value = p.face;
    if (accentInput) accentInput.value = p.accent;
    if (baseInput) baseInput.value = p.base;

    rebuildSignCAD();
}

// =========================================================================
// GESTIÓN DE PRESETS DE COLOR GUARDADOS POR EL USUARIO (localStorage)
// =========================================================================

export function saveCurrentPalette() {
    const nameInput = document.getElementById('input-new-preset-name');
    const name = nameInput ? nameInput.value.trim() : '';

    const face = document.getElementById('color-face')?.value || '#f5f5f0';
    const accent = document.getElementById('color-accent')?.value || '#b07d4f';
    const base = document.getElementById('color-base')?.value || '#1e242b';

    const saved = saveUserPalette(name || 'Mi Paleta', {
        face,
        accent,
        base,
        multi: cadState.useMultiColor
    });

    if (nameInput) nameInput.value = '';
    renderUserPalettesList();
    showToast(`Paleta guardada: "${saved.name}"`, 'Puedes usarla en cualquier momento con un clic');
}

export function applyCustomPalette(id) {
    const list = loadUserPalettes();
    const p = list.find(item => item.id === id);
    if (!p) return;

    const faceInput = document.getElementById('color-face');
    const accentInput = document.getElementById('color-accent');
    const baseInput = document.getElementById('color-base');

    cadState.useMultiColor = p.multi;
    if (faceInput) faceInput.value = p.face;
    if (accentInput) accentInput.value = p.accent;
    if (baseInput) baseInput.value = p.base;

    rebuildSignCAD();
    showToast(`Paleta aplicada: "${p.name}"`, 'Colores actualizados en el modelo 3D');
}

export function removeCustomPalette(id) {
    deleteUserPalette(id);
    renderUserPalettesList();
    showToast('Paleta eliminada', 'Preset borrado de tus favoritos');
}

export function renderUserPalettesList() {
    const container = document.getElementById('user-palettes-list');
    if (!container) return;

    const list = loadUserPalettes();
    if (list.length === 0) {
        container.innerHTML = `<span class="text-[11px] text-slate-500 italic">No tienes paletas personalizadas aún. Crea una abajo.</span>`;
        return;
    }

    container.innerHTML = list.map(p => `
        <div class="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-amber-500/50 transition">
            <button onclick="window.applyCustomPalette('${p.id}')" class="flex items-center gap-2 flex-1 text-left">
                <div class="flex -space-x-1 shrink-0">
                    <span class="w-3.5 h-3.5 rounded-full border border-slate-600" style="background:${p.face}"></span>
                    <span class="w-3.5 h-3.5 rounded-full border border-slate-600" style="background:${p.accent}"></span>
                    <span class="w-3.5 h-3.5 rounded-full border border-slate-600" style="background:${p.base}"></span>
                </div>
                <span class="text-[11px] font-semibold text-slate-200 truncate max-w-[130px]">${p.name}</span>
            </button>
            <button onclick="window.removeCustomPalette('${p.id}')" class="text-slate-500 hover:text-rose-400 p-1 rounded transition" title="Eliminar paleta">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
        </div>
    `).join('');

    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }
}

// =========================================================================
// GESTIÓN DEL SISTEMA MODULAR DE RÓTULOS COLGANTES PARA ANAQUELES (Imagen 2)
// =========================================================================

export function renderHangingPlatesList() {
    const container = document.getElementById('hanging-plates-container');
    if (!container) return;

    const plates = cadState.hanging.plates;
    container.innerHTML = plates.map((plate, index) => `
        <div class="bg-slate-950/70 border border-slate-700/80 rounded-xl p-3 space-y-2.5 relative">
            <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                    <i data-lucide="tag" class="w-3.5 h-3.5"></i>
                    ${index === 0 ? '1. Placa Superior Principal' : `${index + 1}. Módulo Colgante Inferior`}
                </span>
                ${index > 0 ? `
                    <button onclick="window.removeHangingPlate('${plate.id}')" class="text-slate-400 hover:text-rose-400 p-1 rounded bg-slate-800 transition" title="Quitar este módulo">
                        <i data-lucide="x" class="w-3.5 h-3.5"></i>
                    </button>
                ` : '<span class="text-[10px] text-slate-500 font-mono">Fija al brazo</span>'}
            </div>

            <div>
                <label class="text-[10px] text-slate-400 block mb-1">Texto de la placa (Soporta Á, É, Í, Ó, Ú, Ñ)</label>
                <input type="text" value="${plate.text}" maxlength="24"
                    oninput="window.updateHangingPlate('${plate.id}', 'text', this.value)"
                    class="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold tracking-wide outline-none">
            </div>

            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="text-[10px] text-slate-400 block mb-1">Tipografía UTF-8</label>
                    <select onchange="window.updateHangingPlate('${plate.id}', 'font', this.value)"
                        class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white outline-none">
                        <option value="arial" ${plate.font === 'arial' ? 'selected' : ''}>Arial (Clásica / Universal)</option>
                        <option value="cinzel" ${plate.font === 'cinzel' ? 'selected' : ''}>Cinzel (Romana)</option>
                        <option value="montserrat" ${plate.font === 'montserrat' ? 'selected' : ''}>Montserrat (Moderna)</option>
                        <option value="baskerville" ${plate.font === 'baskerville' ? 'selected' : ''}>Baskerville (Editorial)</option>
                        <option value="oswald" ${plate.font === 'oswald' ? 'selected' : ''}>Oswald (Condensada)</option>
                        <option value="playfair" ${plate.font === 'playfair' ? 'selected' : ''}>Playfair (Clásica)</option>
                    </select>
                </div>
                <div>
                    <label class="text-[10px] text-slate-400 block mb-1">Ancho (mm)</label>
                    <input type="number" min="120" max="240" value="${plate.width || 200}"
                        onchange="window.updateHangingPlate('${plate.id}', 'width', parseFloat(this.value))"
                        class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white outline-none">
                </div>
            </div>

            <div class="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800">
                <div>
                    <label class="text-[9px] text-slate-400 block mb-0.5">Fondo</label>
                    <input type="color" value="${plate.plateColor}"
                        onchange="window.updateHangingPlate('${plate.id}', 'plateColor', this.value)"
                        class="w-full h-6 rounded cursor-pointer bg-slate-900 border border-slate-700 p-0.5">
                </div>
                <div>
                    <label class="text-[9px] text-slate-400 block mb-0.5">Marco</label>
                    <input type="color" value="${plate.frameColor}"
                        onchange="window.updateHangingPlate('${plate.id}', 'frameColor', this.value)"
                        class="w-full h-6 rounded cursor-pointer bg-slate-900 border border-slate-700 p-0.5">
                </div>
                <div>
                    <label class="text-[9px] text-slate-400 block mb-0.5">Letras</label>
                    <input type="color" value="${plate.textColor}"
                        onchange="window.updateHangingPlate('${plate.id}', 'textColor', this.value)"
                        class="w-full h-6 rounded cursor-pointer bg-slate-900 border border-slate-700 p-0.5">
                </div>
            </div>
        </div>
    `).join('');

    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }
}

export function addHangingPlate() {
    const plates = cadState.hanging.plates;
    if (plates.length >= 4) {
        showToast('Límite alcanzado', 'Un máximo de 4 placas colgantes por anaquel asegura estabilidad y buena visual');
        return;
    }

    const newId = 'plate_' + Date.now();
    plates.push({
        id: newId,
        text: 'NUEVA SECCIÓN',
        font: 'montserrat',
        plateColor: '#172a45',
        frameColor: '#d49b4b',
        textColor: '#f8f4e8',
        width: Math.max(160, 200 - plates.length * 15),
        height: 38,
        depth: 4.0,
        hasLowerLoops: true
    });

    renderHangingPlatesList();
    triggerHangingRebuild();
    showToast('Módulo Inferior Agregado', 'Se añadió una nueva placa enlazada con eslabones');
}

export function removeHangingPlate(id) {
    cadState.hanging.plates = cadState.hanging.plates.filter(p => p.id !== id);
    renderHangingPlatesList();
    triggerHangingRebuild();
    showToast('Módulo Colgante Eliminado', 'Se reorganizaron los eslabones restantes');
}

export function updateHangingPlate(id, field, value) {
    const plate = cadState.hanging.plates.find(p => p.id === id);
    if (plate) {
        plate[field] = value;
        triggerHangingRebuild();
    }
}

export function triggerHangingRebuild() {
    clearTimeout(cadState.hanging.rebuildTimer);
    cadState.hanging.rebuildTimer = setTimeout(() => {
        rebuildHangingSignCAD();
    }, 45);
}

// Preset Rápido
export function setQuickPreset(text, subtext, styleName, showSub, fontKey, paletteKey = null) {
    const textInput = document.getElementById('sign-text');
    const subtextInput = document.getElementById('sign-subtext');
    const showSubCheck = document.getElementById('show-subtext');
    const fontSelect = document.getElementById('param-font');

    if (textInput) textInput.value = text;
    if (subtextInput) subtextInput.value = subtext;
    if (showSubCheck) showSubCheck.checked = showSub;
    if (fontKey && fontSelect) fontSelect.value = fontKey;

    // Restablecer auto-ajuste de dimensiones y escala al 100% al cambiar de preset
    const scaleEl = document.getElementById('param-global-scale');
    if (scaleEl) scaleEl.value = 100;
    ['param-plaque-width', 'param-plaque-height', 'param-ceiling-width', 'param-ceiling-height'].forEach(id => {
        const el = document.getElementById(id);
        if (el) delete el.dataset.touched;
    });

    if (paletteKey && palettes[paletteKey]) {
        const p = palettes[paletteKey];
        const faceInput = document.getElementById('color-face');
        const accentInput = document.getElementById('color-accent');
        const baseInput = document.getElementById('color-base');
        cadState.useMultiColor = p.multi;
        if (faceInput) faceInput.value = p.face;
        if (accentInput) accentInput.value = p.accent;
        if (baseInput) baseInput.value = p.base;
    }

    selectStyle(styleName);
}

export function insertAccentChar(ch) {
    const input = document.getElementById('sign-text');
    if (input && input.value.length < 48) {
        input.value += ch;
        triggerRebuild();
    }
}

export function triggerRebuild() {
    clearTimeout(cadState.rebuildTimer);
    cadState.rebuildTimer = setTimeout(() => {
        rebuildSignCAD();
    }, 40);
}

/**
 * Configura rápidamente los escudos institucionales (USAC + Biblioteca Central)
 */
export function setLogoModeQuick(mode = 'integrated', leftKey = 'usac', rightKey = 'biblioteca') {
    const modeEl = document.getElementById('logo-mode-select');
    const leftEl = document.getElementById('logo-left-select');
    const rightEl = document.getElementById('logo-right-select');
    const cwEl = document.getElementById('param-ceiling-width');
    const pwEl = document.getElementById('param-plaque-width');

    if (modeEl) modeEl.value = mode;
    if (leftEl) leftEl.value = leftKey;
    if (rightEl) rightEl.value = rightKey;
    if (cwEl) delete cwEl.dataset.touched;
    if (pwEl) delete pwEl.dataset.touched;

    rebuildSignCAD();
}

/**
 * Carga un archivo externo (.SVG, .PNG, .JPG o .STL) como escudo personalizado
 */
export async function handleCustomLogoUpload(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
        showToast('Procesando escudo personalizado...', `Vectorizando ${file.name} para extrusión 3D`);
        const info = await loadCustomLogoFromFile(file);
        const statusEl = document.getElementById('custom-logo-status');
        if (statusEl) {
            statusEl.textContent = `Cargado: ${info.name}`;
            statusEl.classList.remove('hidden');
        }
        const modeEl = document.getElementById('logo-mode-select');
        const rightEl = document.getElementById('logo-right-select');
        if (modeEl && modeEl.value === 'none') modeEl.value = 'integrated';
        if (rightEl) rightEl.value = 'custom';
        await rebuildSignCAD();
        showToast('¡Escudo 3D listo!', `Se integró "${info.name}" en el modelo CAD`);
    } catch (err) {
        console.error(err);
        showToast('Error al cargar logo', err.message || 'Verifica que sea un PNG, SVG o STL válido');
    }
}

/**
 * Manejadores de Guardado de Configuraciones del Usuario
 */
export function saveCurrentConfigWithPrompt() {
    const inputEl = document.getElementById('new-config-name');
    const name = inputEl?.value?.trim();
    if (!name) {
        showToast('Nombre Requerido', 'Escribe un nombre para guardar esta configuración');
        if (inputEl) inputEl.focus();
        return;
    }
    saveUserPreset(name);
    if (inputEl) inputEl.value = '';
    showToast('Configuración Guardada', `"${name}" se guardó en tus configuraciones`);
}

export function loadSavedConfig(id) {
    const loaded = loadUserPresetById(id);
    if (loaded) {
        showToast('Configuración Cargada', `Se restauró "${loaded.name}"`);
    }
}

export function deleteSavedConfig(id) {
    deleteUserPreset(id);
    showToast('Configuración Eliminada', 'Se quitó de tus configuraciones guardadas');
}

export function resetTextOffsets() {
    ['param-text-offset-x', 'param-text-offset-y', 'param-sub-offset-x', 'param-sub-offset-y'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 0;
    });
    triggerRebuild();
}

export function shareCurrentToVisor() {
    const config = captureCurrentConfig();
    const hash = encodeConfigToUrlHash(config);
    const origin = window.location.origin;
    const pathname = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
    const url = `${origin}${pathname}/visor.html#share=${hash}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('Enlace Copiado', 'Envía este enlace a tu jefe para que vea este modelo 3D');
        }).catch(() => {
            prompt('Copia este enlace directo para el visor:', url);
        });
    } else {
        prompt('Copia este enlace directo para el visor:', url);
    }
}

export function sharePresetToVisor(id) {
    const raw = localStorage.getItem(STORAGE_SAVED_CONFIGS_KEY);
    if (!raw) return;
    try {
        const list = JSON.parse(raw);
        const found = list.find(it => it.id === id);
        if (!found) return;

        const hash = encodeConfigToUrlHash(found);
        const origin = window.location.origin;
        const pathname = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
        const url = `${origin}${pathname}/visor.html#share=${hash}`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                showToast('Enlace Copiado', `Enlace para compartir "${found.name}" copiado`);
            }).catch(() => {
                prompt('Copia este enlace directo para el visor:', url);
            });
        } else {
            prompt('Copia este enlace directo para el visor:', url);
        }
    } catch (e) {
        console.error(e);
    }
}

/**
 * Conecta los métodos al objeto global window para mantener compatibilidad con HTML declarativo
 */
export function exposeGlobalMethods() {
    window.showToast = showToast;
    window.toggleBambuModal = toggleBambuModal;
    window.toggleTechTipsModal = toggleTechTipsModal;
    window.toggleExplodeView = toggleExplodeView;
    window.toggleShelfContext = toggleShelfContext;
    window.toggleWireframe = toggleWireframe;
    window.resetCameraView = resetCameraView;
    window.switchMainTab = switchMainTab;
    window.selectStyle = selectStyle;
    window.fitSignToBed = fitSignToBed;
    window.applyPalette = applyPalette;
    window.setQuickPreset = setQuickPreset;
    window.setLogoModeQuick = setLogoModeQuick;
    window.handleCustomLogoUpload = handleCustomLogoUpload;
    window.insertAccentChar = insertAccentChar;
    window.triggerRebuild = triggerRebuild;
    window.updateColorsOnly = () => rebuildSignCAD();
    window.disableMultiAndColors = () => {
        cadState.useMultiColor = false;
        rebuildSignCAD();
    };

    // Paletas personalizadas
    window.saveCurrentPalette = saveCurrentPalette;
    window.applyCustomPalette = applyCustomPalette;
    window.removeCustomPalette = removeCustomPalette;

    // Rótulos Colgantes de Anaquel
    window.addHangingPlate = addHangingPlate;
    window.removeHangingPlate = removeHangingPlate;
    window.updateHangingPlate = updateHangingPlate;
    window.triggerHangingRebuild = triggerHangingRebuild;
    window.exportHanging3MF = exportHanging3MF;
    window.exportHangingSTL = exportHangingSTL;

    // Exporters
    window.exportBambu3MF = exportBambu3MF;
    window.exportMultiOBJ = exportMultiOBJ;
    window.exportSTL = exportSTL;
    window.exportSegmentParts3MF = exportSegmentParts3MF;
    window.exportJointTest3MF = exportJointTest3MF;
    window.exportStandaloneMedallionsSTL = exportStandaloneMedallionsSTL;

    // Exportador de Plantilla de Imagen para Papel (Fondo Blanco)
    window.openPaperProofModal = openPaperProofModal;
    window.closePaperProofModal = closePaperProofModal;
    window.updatePaperProofPreview = updatePaperProofPreview;
    window.downloadPaperProofFromModal = downloadPaperProofFromModal;
    window.quickDownloadPaperPNG = quickDownloadPaperPNG;
    window.runBatchFontComparison = runBatchFontComparison;
    window.showSingleProofView = showSingleProofView;
    window.downloadSingleFontProof = downloadSingleFontProof;
    window.downloadAllFontProofsBatch = downloadAllFontProofsBatch;

    // Acordeón del panel izquierdo
    window.toggleSectionAccordion = toggleSectionAccordion;
    window.collapseAllSections = collapseAllSections;
    window.expandAllSections = expandAllSections;

    // Calculadora
    window.updatePitchCalculator = updatePitchCalculator;
    window.copyPitchScript = copyPitchScript;

    // Persistencia y Presets de Usuario
    window.saveCurrentConfigWithPrompt = saveCurrentConfigWithPrompt;

    // Vitrina pública para jefatura (Netlify) y bitácora de horas
    window.toggleVitrinaDesign = toggleVitrinaDesign;
    window.removeVitrinaDesign = removeVitrinaDesign;
    window.addWorkLogEntry = addWorkLogEntry;
    window.removeWorkLogEntry = removeWorkLogEntry;
    window.updateAssignedHours = updateAssignedHours;
    window.publishCalculatorEstimate = publishCalculatorEstimate;
    window.loadSavedConfig = loadSavedConfig;
    window.deleteSavedConfig = deleteSavedConfig;
    window.sharePresetToVisor = sharePresetToVisor;
    window.shareCurrentToVisor = shareCurrentToVisor;
    window.resetTextOffsets = resetTextOffsets;
    window.renderUserPresetsList = renderUserPresetsList;
}
