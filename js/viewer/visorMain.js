/**
 * BiblioSign 3D - Visor Ejecutivo para Jefatura y Aprobación
 * Muestra las configuraciones pre-guardadas, el catálogo institucional y diseños compartidos
 * en un entorno 3D limpio, profesional y sin controles de edición CAD.
 */

import * as THREE from 'three';
import { cadState } from '../config/state.js';
import { institutionalFonts } from '../config/fonts.js';
import {
    initScene,
    scene,
    controls,
    camera,
    renderer,
    printableRoot,
    hangingRoot,
    setSceneWorkspace,
    resetCameraView,
    refreshEnvironment,
    getActiveModelBounds
} from '../scene/sceneManager.js';
import { rebuildSignCAD } from '../cad/signGenerator.js';
import { rebuildHangingSignCAD } from '../cad/hangingSignGenerator.js';
import {
    applyConfig,
    decodeConfigFromUrlHash,
    STORAGE_SAVED_CONFIGS_KEY
} from '../config/persistence.js';
import { IS_VITRINA_BUILD, loadVitrina, totalLoggedHours } from '../config/vitrina.js';

let allProposals = [];
let activeProposal = null;
let isTurntableActive = false;
let vitrinaData = null;

// Vitrina: en Netlify siempre; en local con visor.html?vitrina (vista previa)
const isVitrinaMode = IS_VITRINA_BUILD || new URLSearchParams(window.location.search).has('vitrina');

const STYLE_CATEGORY_LABELS = {
    plaque: 'Placa Wayfinding',
    shelf_clip: 'Canto de Anaquel',
    wedge: 'Cuña de Escritorio',
    modular: 'Bloques Modulares',
    solid: 'Placa Monolítica',
    filigree: 'Capitular Clásica',
    ceiling: 'Colgante de Techo'
};

/**
 * Inicialización al cargar la página
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializar escena 3D en el contenedor del visor
    initScene('visor-canvas-container');
    if (scene) scene.background = new THREE.Color('#e9edf2');

    // Configurar OrbitControls para presentación suave
    if (controls) {
        controls.autoRotate = false;
        controls.autoRotateSpeed = 2.0;
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
    }

    // Presentación limpia: sin estante de madera ni cama de impresión, solo una sombra suave bajo el modelo
    cadState.showShelf = false;
    cadState.showBedGrid = false;
    refreshEnvironment();
    if (scene) {
        const shadowCatcher = new THREE.Mesh(
            new THREE.PlaneGeometry(4000, 4000),
            new THREE.ShadowMaterial({ opacity: 0.12 })
        );
        shadowCatcher.name = 'Sombra_Presentacion';
        shadowCatcher.position.z = -0.05;
        shadowCatcher.receiveShadow = true;
        scene.add(shadowCatcher);
    }

    // 2. Cargar catálogo (vitrina pública o catálogo completo local) y bitácora de horas
    vitrinaData = await loadVitrina();
    applyVitrinaChrome();
    initProposalsCatalog();
    renderWorkHoursPanel();

    // 3. Conectar callbacks globales requeridos por applyConfig
    setupGlobalCallbacks();

    // 4. Determinar qué propuesta abrir inicialmente:
    // Prioridad A: Configuración compartida en URL (#share=... o #cfg=...)
    // Prioridad B: Primera propuesta destacada del catálogo (Laboratorio USAC)
    const initialConfig = getInitialProposalFromUrl() || allProposals[0];
    if (initialConfig) {
        await selectProposal(initialConfig.id);
    } else {
        // Sin propuestas publicadas: no mostrar los textos de ejemplo de la ficha técnica
        const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        setText('spec-title', 'Próximamente');
        setText('spec-category', 'Propuestas en preparación');
        setText('spec-desc', 'Las propuestas de letreros aparecerán aquí en cuanto estén publicadas.');
        ['spec-dimensions', 'spec-mounting', 'spec-material', 'spec-font'].forEach(id => setText(id, '—'));
        document.getElementById('spec-badge')?.classList.add('hidden');
        setText('visor-dims-badge', 'Sin modelo seleccionado');
    }

    // 5. Inicializar iconos Lucide
    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }

    // 6. Nota de bienvenida para jefatura (una vez por sesión)
    maybeShowPitchModal();

    // 7. Escuchar cambios de hash para navegación fluida
    window.addEventListener('hashchange', async () => {
        const shared = parseSharedUrlConfig();
        if (shared) {
            const idx = allProposals.findIndex(p => p.id === 'shared_from_link');
            if (idx >= 0) allProposals[idx] = shared;
            else allProposals.unshift(shared);
            renderCatalogCards();
            await selectProposal('shared_from_link');
        }
    });
});

/**
 * Configura callbacks globales que las funciones internas de CAD esperan encontrar en window
 */
function setupGlobalCallbacks() {
    window.selectStyle = (newStyle) => {
        cadState.style = newStyle;
    };

    window.switchMainTab = (workspace) => {
        const ws = workspace === 'hanging' ? 'hanging' : 'tabletop';
        setSceneWorkspace(ws);
    };

    window.triggerRebuild = async () => {
        if (cadState.activeWorkspace === 'hanging') {
            await rebuildHangingSignCAD();
        } else {
            await rebuildSignCAD();
        }
        updateDimensionsDisplay();
    };

    // Funciones expuestas a botones de la UI
    window.selectProposalById = (id) => selectProposal(id);
    window.setCameraPreset = setCameraPreset;
    window.toggleTurntable = toggleTurntable;
    window.recenterCamera = recenterCamera;
    window.toggleWorkHoursModal = toggleWorkHoursModal;
    window.togglePitchModal = togglePitchModal;

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        togglePitchModal(false);
        toggleWorkHoursModal(false);
    });
}

/**
 * En modo vitrina se ocultan los accesos que solo tienen sentido para el diseñador
 */
function applyVitrinaChrome() {
    if (!isVitrinaMode) return;
    const subtitle = document.getElementById('visor-subtitle');
    if (subtitle) subtitle.textContent = 'Propuestas de señalética 3D seleccionadas para revisión';
    if (!IS_VITRINA_BUILD) {
        document.getElementById('vitrina-preview-banner')?.classList.remove('hidden');
    }
}

/**
 * Reúne SOLO los diseños propios del diseñador:
 * - Netlify / vista previa: los marcados con ★ (public/vitrina.json)
 * - Visor local: además, los guardados en "Mis Configuraciones Guardadas" de este navegador
 * Los ejemplos institucionales de catalog.js ya no se muestran.
 */
function initProposalsCatalog() {
    allProposals = [];
    const seenIds = new Set();
    const addProposal = (d, extra = {}) => {
        if (!d || seenIds.has(d.id)) return;
        seenIds.add(d.id);
        allProposals.push({
            ...d,
            ...extra,
            category: d.category || STYLE_CATEGORY_LABELS[d.style] || (d.activeWorkspace === 'hanging' ? 'Rótulo Colgante' : 'Señalética'),
            desc: d.desc || `Propuesta de letrero 3D: "${(d.text || '').replace(/\n/g, ' ')}".`,
            mounting: d.mounting || (d.style === 'shelf_clip' ? 'Pinza de canto 19 mm' : (d.style === 'wedge' ? 'Sobremesa inclinada' : 'Montaje en superficie'))
        });
    };

    (vitrinaData?.designs || []).forEach(d => addProposal(d, { isVitrina: true }));

    if (!isVitrinaMode) {
        try {
            const userList = JSON.parse(localStorage.getItem(STORAGE_SAVED_CONFIGS_KEY) || '[]');
            if (Array.isArray(userList)) userList.forEach(u => addProposal(u, { isUserPreset: true }));
        } catch (e) {
            console.warn('[Visor] No se pudieron cargar presets locales:', e);
        }
    }

    // Enlace compartido (#share=...): si ya es uno de la lista se abre ese; si no, se agrega al inicio
    const shared = parseSharedUrlConfig();
    if (shared && !seenIds.has(shared.sourceId)) {
        allProposals.unshift(shared);
    }

    renderCatalogCards();
}

/**
 * Lee y decodifica una configuración compartida desde el hash de URL
 */
function parseSharedUrlConfig() {
    const hash = window.location.hash;
    if (!hash || (!hash.includes('share=') && !hash.includes('cfg='))) return null;

    const decoded = decodeConfigFromUrlHash(hash);
    if (!decoded || typeof decoded !== 'object') return null;

    return {
        ...decoded,
        sourceId: decoded.id,
        id: 'shared_from_link',
        name: decoded.name || 'Propuesta Compartida por el Diseñador',
        category: decoded.category || 'Compartido por Enlace',
        badge: decoded.badge || '📌 Compartido',
        desc: decoded.desc || 'Este diseño fue creado y compartido directamente por el diseñador mediante un enlace para su revisión y aprobación institucional.',
        mounting: decoded.mounting || (decoded.style === 'shelf_clip' ? 'Pinza de canto para estante de 19 mm' : (decoded.style === 'wedge' ? 'Cuña inclinada para sobremesa' : 'Fijación frontal institucional')),
        material: decoded.material || 'PLA / PETG Institucional',
        isShared: true
    };
}

/**
 * Obtiene la propuesta inicial a seleccionar
 */
function getInitialProposalFromUrl() {
    const shared = parseSharedUrlConfig();
    if (shared) {
        return allProposals.find(p => p.id === shared.sourceId) || allProposals.find(p => p.id === 'shared_from_link');
    }

    // O si se especificó #id=laboratorio_usac
    const match = window.location.hash.match(/[#&]id=([a-zA-Z0-9_-]+)/);
    if (match) {
        const found = allProposals.find(p => p.id === match[1]);
        if (found) return found;
    }

    return null;
}

/**
 * Renderiza la lista de tarjetas en el menú lateral del catálogo
 */
function renderCatalogCards() {
    const container = document.getElementById('catalog-cards-container');
    if (!container) return;

    const countEl = document.getElementById('catalog-count');
    if (countEl) countEl.textContent = allProposals.length;

    if (allProposals.length === 0) {
        container.innerHTML = `
            <div class="text-xs text-slate-500 p-4 text-center border border-dashed border-stone-300 rounded-2xl">
                Aún no hay propuestas publicadas.
            </div>
        `;
        return;
    }

    container.innerHTML = allProposals.map(item => {
        const isActive = activeProposal && activeProposal.id === item.id;
        const plate0 = item.hanging?.plates?.[0];
        const dots = [
            item.colorBase || plate0?.plateColor || '#1e242b',
            item.colorFace || plate0?.textColor || '#ffffff',
            item.colorAccent || plate0?.frameColor || '#d4af37'
        ];
        const rowClass = isActive
            ? 'bg-slate-900 text-white'
            : 'bg-white hover:bg-stone-100 text-slate-800';

        return `
            <button type="button" onclick="window.selectProposalById('${item.id}')"
                    class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${rowClass}">
                <span class="flex -space-x-1.5 shrink-0">
                    ${dots.map(c => `<span class="w-4 h-4 rounded-full ring-2 ${isActive ? 'ring-slate-900' : 'ring-white'}" style="background-color: ${c};"></span>`).join('')}
                </span>
                <span class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold truncate">${item.name}</span>
                    <span class="block text-[11px] truncate ${isActive ? 'text-slate-300' : 'text-slate-500'}">${item.category}</span>
                </span>
                ${isActive ? '<i data-lucide="eye" class="w-4 h-4 text-amber-400 shrink-0"></i>' : ''}
            </button>
        `;
    }).join('');

    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }
}

/**
 * Selecciona y aplica una propuesta del catálogo
 */
export async function selectProposal(proposalId) {
    const proposal = allProposals.find(p => p.id === proposalId);
    if (!proposal) return;

    activeProposal = proposal;

    // 1. Aplicar la configuración al estado CAD y DOM oculto
    applyConfig(proposal, false);

    // 2. Determinar si es un rótulo colgante modular o de sobremesa
    const isHanging = proposal.activeWorkspace === 'hanging';
    setSceneWorkspace(isHanging ? 'hanging' : 'tabletop');

    // 3. Generar la geometría 3D
    if (isHanging) {
        if (proposal.hanging) {
            cadState.hanging = JSON.parse(JSON.stringify(proposal.hanging));
        }
        await rebuildHangingSignCAD();
    } else {
        await rebuildSignCAD();
    }

    // 4. Actualizar ficha técnica lateral
    updateFichaTecnica(proposal);

    // 5. Actualizar la tarjeta activa en la lista del catálogo
    renderCatalogCards();

    // 6. Centrar cámara en el nuevo modelo
    recenterCamera();

}

/**
 * Actualiza los datos de la Ficha Técnica Ejecutiva
 */
function updateFichaTecnica(proposal) {
    // Título y categoría
    const titleEl = document.getElementById('spec-title');
    if (titleEl) titleEl.textContent = proposal.name;

    const catEl = document.getElementById('spec-category');
    if (catEl) catEl.textContent = proposal.category || 'Señalética Institucional';

    const badgeEl = document.getElementById('spec-badge');
    if (badgeEl) badgeEl.textContent = proposal.badge || 'Estándar';

    // Descripción institucional
    const descEl = document.getElementById('spec-desc');
    if (descEl) descEl.textContent = proposal.desc || 'Rótulo 3D de alta legibilidad diseñado para la señalización de espacios bibliotecarios.';

    // Montaje y Fijación
    const mountEl = document.getElementById('spec-mounting');
    if (mountEl) mountEl.textContent = proposal.mounting || 'Fijación frontal institucional';

    // Material sugerido
    const matEl = document.getElementById('spec-material');
    if (matEl) matEl.textContent = proposal.material || 'PLA / PETG Resistente a rayos UV';

    // Tipografía
    const fontKey = proposal.font || 'arial';
    const fontInfo = institutionalFonts[fontKey];
    const fontEl = document.getElementById('spec-font');
    if (fontEl) fontEl.textContent = fontInfo ? fontInfo.name : fontKey;

    // Paleta de colores
    updateColorSwatches(proposal);

    // Medidas 1:1 calculadas desde el modelo 3D
    updateDimensionsDisplay();
}

/**
 * Actualiza las muestras de color en la Ficha Técnica
 */
function updateColorSwatches(proposal) {
    const swatchesContainer = document.getElementById('spec-color-swatches');
    if (!swatchesContainer) return;

    let cBase = proposal.colorBase || '#1e242b';
    let cFace = proposal.colorFace || '#ffffff';
    let cAccent = proposal.colorAccent || '#b07d4f';

    if (proposal.hanging && proposal.hanging.plates && proposal.hanging.plates[0]) {
        cBase = proposal.hanging.plates[0].plateColor || cBase;
        cFace = proposal.hanging.plates[0].textColor || cFace;
        cAccent = proposal.hanging.plates[0].frameColor || cAccent;
    }

    const spool = (hex, label, role) => `
        <div class="flex items-center gap-3 py-2">
            <span class="relative w-9 h-9 rounded-full shrink-0 shadow-sm ring-1 ring-black/15" style="background-color: ${hex};">
                <span class="absolute inset-[11px] rounded-full bg-white/90 ring-1 ring-black/10"></span>
            </span>
            <div class="min-w-0 flex-1">
                <div class="text-sm font-semibold text-slate-900">${label}</div>
                <div class="text-[11px] text-slate-500">${role}</div>
            </div>
            <span class="text-[11px] font-mono font-semibold text-slate-600 bg-stone-100 px-2 py-0.5 rounded-md">${hex.toUpperCase()}</span>
        </div>`;

    swatchesContainer.innerHTML = `
        <div class="flex h-2.5 rounded-full overflow-hidden ring-1 ring-black/10 mb-1">
            <span class="flex-[5]" style="background-color: ${cBase};"></span>
            <span class="flex-[3]" style="background-color: ${cFace};"></span>
            <span class="flex-[2]" style="background-color: ${cAccent};"></span>
        </div>
        <div class="divide-y divide-stone-100">
            ${spool(cBase, 'Estructura', 'Placa y base')}
            ${spool(cFace, 'Texto', 'Letras en relieve')}
            ${spool(cAccent, 'Acentos', 'Marco y detalles')}
        </div>`;
}

/**
 * Calcula las medidas 1:1 en mm del objeto 3D activo y las proyecta en la UI
 */
function updateDimensionsDisplay() {
    const isHanging = cadState.activeWorkspace === 'hanging';
    const targetRoot = isHanging ? hangingRoot : printableRoot;

    let widthMm = 0;
    let heightMm = 0;
    let depthMm = 0;

    if (targetRoot && targetRoot.children.length > 0) {
        const bbox = new THREE.Box3().setFromObject(targetRoot);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        widthMm = Math.round(size.x);
        // El colgante se exhibe de pie (alto en Z); los letreros de mesa están acostados (alto en Y)
        heightMm = Math.round(isHanging ? size.z : size.y);
        depthMm = Math.round((isHanging ? size.y : size.z) * 10) / 10;
    }

    // Pill flotante del visor 3D
    const badgeEl = document.getElementById('visor-dims-badge');
    if (badgeEl) {
        badgeEl.innerHTML = `
            <i data-lucide="ruler" class="w-3.5 h-3.5 text-amber-600"></i>
            <span class="text-slate-500 font-medium">Medidas reales</span>
            <span class="font-mono text-slate-900 font-semibold">${widthMm} × ${heightMm} × ${depthMm} mm</span>
        `;
        if (window.lucide && window.lucide.createIcons) {
            window.lucide.createIcons();
        }
    }

    // Ficha técnica
    const dimsEl = document.getElementById('spec-dimensions');
    if (dimsEl) {
        dimsEl.textContent = `${widthMm} × ${heightMm} mm · ${depthMm} mm de espesor`;
    }
}

/**
 * Ajusta la cámara a ángulos predeterminados
 */
export function setCameraPreset(preset) {
    if (!camera || !controls) return;

    const { center, size } = getActiveModelBounds();
    const base = Math.max(320, Math.max(size.x, size.y, size.z) * 1.6);

    if (preset === 'frontal') {
        camera.position.set(center.x, center.y - base, center.z);
    } else if (preset === 'isometric') {
        camera.position.set(center.x - base * 0.6, center.y - base * 0.8, center.z + base * 0.45);
    } else if (preset === 'top') {
        camera.position.set(center.x, center.y - 1, center.z + base * 1.1);
    }
    controls.target.copy(center);
    controls.update();
}

/**
 * Activa o desactiva la auto-rotación turntable 360°
 */
export function toggleTurntable() {
    if (!controls) return;
    isTurntableActive = !isTurntableActive;
    controls.autoRotate = isTurntableActive;

    const btn = document.getElementById('btn-turntable');
    if (btn) {
        if (isTurntableActive) {
            btn.className = "flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 text-slate-900 transition";
        } else {
            btn.className = "flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-stone-100 transition";
        }
    }
}

/**
 * Re-centra la cámara sobre el objeto
 */
export function recenterCamera() {
    resetCameraView();
}

/**
 * Panel "Trabajo detrás de los letreros": horas reales registradas vs. horas asignadas
 */
function renderWorkHoursPanel() {
    const work = vitrinaData?.work;
    const btn = document.getElementById('btn-work-hours');
    const logged = Math.round(totalLoggedHours(work) * 10) / 10;
    const estimated = parseFloat(work?.estimatedProjectHours) || 0;
    const assigned = parseFloat(work?.assignedHoursPerWeek) || 0;

    if (!work || (logged === 0 && estimated === 0)) {
        btn?.classList.add('hidden');
        return;
    }
    btn?.classList.remove('hidden');

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setText('work-btn-total', `${logged} h`);
    setText('work-logged', `${logged} h`);
    setText('work-assigned', assigned > 0 ? `${assigned} h` : '—');
    setText('work-estimated', estimated > 0 ? `${estimated} h` : '—');

    // Semanas que tomaría producir los letreros con las horas asignadas hoy
    // (las horas ya invertidas fueron en crear la herramienta; la producción aún está pendiente)
    const remaining = estimated;
    const weeksLogged = assigned > 0 ? Math.ceil(logged / assigned) : 0;
    const weeksRemaining = assigned > 0 ? Math.ceil(remaining / assigned) : 0;
    setText('work-weeks-logged', assigned > 0 ? `${weeksLogged} semanas` : '—');
    setText('work-weeks-remaining', assigned > 0 && estimated > 0 ? `${weeksRemaining} semanas (~${Math.round(weeksRemaining / 4.3 * 10) / 10} meses)` : '—');

    const entriesEl = document.getElementById('work-entries');
    if (entriesEl) {
        const esc = str => String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        entriesEl.innerHTML = (work.entries || []).slice().reverse().map(e => `
            <tr class="border-t border-stone-200">
                <td class="py-2 pr-3 font-mono text-slate-400 whitespace-nowrap">${esc(e.date)}</td>
                <td class="py-2 pr-3 text-slate-700">${esc(e.task)}</td>
                <td class="py-2 text-right font-bold text-amber-700 whitespace-nowrap">${esc(e.hours)} h</td>
            </tr>`).join('') || `<tr><td colspan="3" class="py-3 text-center text-slate-400 italic">Sin registros detallados.</td></tr>`;
    }
}

/**
 * Pop-up de bienvenida para jefatura: vende la mejora y pide más horas (una vez por sesión)
 */
const PITCH_SEEN_KEY = 'bibliosign_pitch_seen';

function renderPitchModal() {
    const work = vitrinaData?.work;
    const logged = Math.round(totalLoggedHours(work) * 10) / 10;
    const estimated = parseFloat(work?.estimatedProjectHours) || 0;
    const assigned = parseFloat(work?.assignedHoursPerWeek) || 0;
    if (!work || (logged === 0 && estimated === 0)) return false;

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    setText('pitch-logged', logged > 0 ? `${logged} h` : '—');
    setText('pitch-assigned', assigned > 0 ? `${assigned} h` : '—');
    if (assigned > 0 && estimated > 0) {
        const weeks = Math.ceil(estimated / assigned);
        setText('pitch-weeks', `${weeks} sem.`);
        setText('pitch-weeks-label', `(~${Math.round(weeks / 4.3 * 10) / 10} meses) para producirlos a este ritmo`);
    }
    return true;
}

function togglePitchModal(show) {
    const modal = document.getElementById('pitch-modal');
    if (!modal) return;
    const open = typeof show === 'boolean' ? show : modal.classList.contains('hidden');
    modal.classList.toggle('hidden', !open);
    modal.classList.toggle('flex', open);
    if (open && window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    if (!open) {
        try { sessionStorage.setItem(PITCH_SEEN_KEY, '1'); } catch (e) { /* sin almacenamiento: se mostrará otra vez */ }
    }
}

function maybeShowPitchModal() {
    if (!renderPitchModal()) return;
    let seen = false;
    try { seen = sessionStorage.getItem(PITCH_SEEN_KEY) === '1'; } catch (e) { /* ignorar */ }
    if (seen) return;
    // Pequeña pausa para que primero se vea el letrero cargando detrás
    setTimeout(() => togglePitchModal(true), 1200);
}

function toggleWorkHoursModal(show) {
    const modal = document.getElementById('work-hours-modal');
    if (!modal) return;
    const open = typeof show === 'boolean' ? show : modal.classList.contains('hidden');
    modal.classList.toggle('hidden', !open);
    modal.classList.toggle('flex', open);
    if (open && window.lucide && window.lucide.createIcons) window.lucide.createIcons();
}
