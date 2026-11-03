/**
 * BiblioSign 3D - Visor Ejecutivo para Jefatura y Aprobación
 * Muestra las configuraciones pre-guardadas, el catálogo institucional y diseños compartidos
 * en un entorno 3D limpio, profesional y sin controles de edición CAD.
 */

import * as THREE from 'three';
import { institutionalCatalog } from '../config/catalog.js';
import { cadState } from '../config/state.js';
import { institutionalFonts } from '../config/fonts.js';
import {
    initScene,
    controls,
    camera,
    renderer,
    printableRoot,
    hangingRoot,
    setSceneWorkspace,
    resetCameraView,
    refreshEnvironment
} from '../scene/sceneManager.js';
import { rebuildSignCAD } from '../cad/signGenerator.js';
import { rebuildHangingSignCAD } from '../cad/hangingSignGenerator.js';
import {
    applyConfig,
    captureCurrentConfig,
    decodeConfigFromUrlHash,
    encodeConfigToUrlHash,
    STORAGE_SAVED_CONFIGS_KEY
} from '../config/persistence.js';
import { renderSignImageBlob } from '../exporters/imageExporter.js';
import { exportBambu3MF } from '../exporters/threeMfExporter.js';
import { downloadBlob, sanitizeFileName } from '../exporters/exportUtils.js';

let allProposals = [];
let activeProposal = null;
let currentFilter = 'all';
let isTurntableActive = false;

/**
 * Inicialización al cargar la página
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializar escena 3D en el contenedor del visor
    initScene('visor-canvas-container');

    // Configurar OrbitControls para presentación suave
    if (controls) {
        controls.autoRotate = false;
        controls.autoRotateSpeed = 2.0;
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
    }

    // Por defecto mostrar entorno con estante cálido de biblioteca
    cadState.showShelf = true;
    refreshEnvironment();

    // 2. Cargar catálogo institucional y configuraciones personalizadas
    initProposalsCatalog();

    // 3. Conectar callbacks globales requeridos por applyConfig
    setupGlobalCallbacks();

    // 4. Determinar qué propuesta abrir inicialmente:
    // Prioridad A: Configuración compartida en URL (#share=... o #cfg=...)
    // Prioridad B: Primera propuesta destacada del catálogo (Laboratorio USAC)
    const initialConfig = getInitialProposalFromUrl() || allProposals[0];
    if (initialConfig) {
        await selectProposal(initialConfig.id);
    }

    // 5. Inicializar iconos Lucide
    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }

    // 6. Escuchar cambios de hash para navegación fluida
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
    window.setFilter = setFilter;
    window.selectProposalById = (id) => selectProposal(id);
    window.setCameraPreset = setCameraPreset;
    window.toggleTurntable = toggleTurntable;
    window.toggleEnvironment = toggleEnvironment;
    window.recenterCamera = recenterCamera;
    window.copyActiveShareUrl = copyActiveShareUrl;
    window.downloadProposalProof = downloadProposalProof;
    window.downloadProposal3MF = downloadProposal3MF;
}

/**
 * Reúne el catálogo institucional, propuestas compartidas por URL y presets locales del usuario
 */
function initProposalsCatalog() {
    allProposals = [];

    // A. ¿Hay una configuración compartida en la URL (#share=...)?
    const shared = parseSharedUrlConfig();
    if (shared) {
        allProposals.push(shared);
    }

    // B. Añadir catálogo institucional curado
    institutionalCatalog.forEach(item => {
        allProposals.push({ ...item, isInstitutional: true });
    });

    // C. Añadir presets guardados por el usuario en localStorage
    try {
        const raw = localStorage.getItem(STORAGE_SAVED_CONFIGS_KEY);
        if (raw) {
            const userList = JSON.parse(raw);
            if (Array.isArray(userList)) {
                userList.forEach(u => {
                    allProposals.push({
                        ...u,
                        isUserPreset: true,
                        category: 'Mis Diseños Guardados',
                        badge: 'Usuario',
                        desc: `Configuración personalizada guardada localmente por el diseñador: "${(u.text || '').replace(/\n/g, ' ')}".`,
                        mounting: u.style === 'shelf_clip' ? 'Pinza de canto 19 mm' : (u.style === 'wedge' ? 'Sobremesa inclinada 12°' : 'Montaje en superficie')
                    });
                });
            }
        }
    } catch (e) {
        console.warn('[Visor] No se pudieron cargar presets locales:', e);
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
    const shared = allProposals.find(p => p.id === 'shared_from_link');
    if (shared) return shared;

    // O si se especificó #id=laboratorio_usac
    const match = window.location.hash.match(/[#&]id=([a-zA-Z0-9_-]+)/);
    if (match) {
        const found = allProposals.find(p => p.id === match[1]);
        if (found) return found;
    }

    return null;
}

/**
 * Filtra el catálogo según la pestaña seleccionada
 */
function setFilter(filterCategory) {
    currentFilter = filterCategory;

    // Actualizar estilos de las pestañas
    const tabs = ['all', 'placas', 'anaqueles', 'colgantes', 'guardadas'];
    tabs.forEach(tab => {
        const btn = document.getElementById(`filter-tab-${tab}`);
        if (btn) {
            if (tab === filterCategory) {
                btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 shadow transition";
            } else {
                btn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition";
            }
        }
    });

    renderCatalogCards();
}

/**
 * Renderiza la lista de tarjetas en el menú lateral del catálogo
 */
function renderCatalogCards() {
    const container = document.getElementById('catalog-cards-container');
    if (!container) return;

    const filtered = allProposals.filter(item => {
        if (currentFilter === 'all') return true;
        if (currentFilter === 'placas') return item.category && item.category.toLowerCase().includes('placa');
        if (currentFilter === 'anaqueles') return item.style === 'shelf_clip' || item.style === 'wedge' || (item.category && item.category.toLowerCase().includes('anaquel'));
        if (currentFilter === 'colgantes') return item.activeWorkspace === 'hanging' || (item.category && item.category.toLowerCase().includes('colgante'));
        if (currentFilter === 'guardadas') return item.isUserPreset || item.isShared;
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-xs text-slate-500 p-4 text-center border border-dashed border-slate-800 rounded-xl">
                No hay propuestas en esta categoría.
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(item => {
        const isActive = activeProposal && activeProposal.id === item.id;
        const activeClass = isActive
            ? 'border-amber-500 bg-slate-800/90 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/50'
            : 'border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-800/50';

        const colorBaseDot = item.colorBase || (item.hanging?.bracketColor) || '#1e242b';
        const colorFaceDot = item.colorFace || (item.hanging?.plates?.[0]?.textColor) || '#ffffff';
        const colorAccentDot = item.colorAccent || (item.hanging?.plates?.[0]?.frameColor) || '#d4af37';

        return `
            <div onclick="window.selectProposalById('${item.id}')"
                 class="p-3 rounded-xl border ${activeClass} cursor-pointer transition-all duration-200 group relative">
                
                <div class="flex items-start justify-between gap-2 mb-1">
                    <div class="min-w-0 flex-1">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-amber-400 block truncate">
                            ${item.category || 'Señalética'}
                        </span>
                        <h4 class="text-xs font-bold text-white group-hover:text-amber-300 transition truncate">
                            ${item.name}
                        </h4>
                    </div>
                    ${item.badge ? `
                        <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${item.isShared ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'bg-slate-800 text-slate-300 border border-slate-700'} shrink-0">
                            ${item.badge}
                        </span>
                    ` : ''}
                </div>

                <p class="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-2">
                    ${item.desc || (item.text || '').replace(/\n/g, ' ')}
                </p>

                <div class="flex items-center justify-between pt-1.5 border-t border-slate-800/80 text-[10px]">
                    <div class="flex items-center gap-1.5">
                        <span class="w-2.5 h-2.5 rounded-full border border-black/30 shadow-sm" style="background-color: ${colorBaseDot};" title="Color Base"></span>
                        <span class="w-2.5 h-2.5 rounded-full border border-black/30 shadow-sm" style="background-color: ${colorFaceDot};" title="Color Letras"></span>
                        <span class="w-2.5 h-2.5 rounded-full border border-black/30 shadow-sm" style="background-color: ${colorAccentDot};" title="Color Acentos"></span>
                    </div>
                    
                    <span class="text-slate-400 group-hover:text-amber-400 font-semibold flex items-center gap-1">
                        <span>${isActive ? '● En Pantalla' : 'Ver en 3D'}</span>
                        <i data-lucide="chevron-right" class="w-3 h-3"></i>
                    </span>
                </div>
            </div>
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

    // 7. Actualizar el hash de la URL de forma silenciosa para que se pueda compartir directamente
    try {
        const hash = encodeConfigToUrlHash(proposal);
        window.history.replaceState(null, '', `#share=${hash}`);
    } catch (e) {
        // Silencioso
    }
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

    swatchesContainer.innerHTML = `
        <div class="flex items-center gap-2 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span class="w-4 h-4 rounded-md border border-white/20 shrink-0" style="background-color: ${cBase};"></span>
            <div class="min-w-0">
                <div class="text-[10px] text-slate-400">Estructura Base</div>
                <div class="text-[11px] font-mono text-white font-bold">${cBase}</div>
            </div>
        </div>
        <div class="flex items-center gap-2 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span class="w-4 h-4 rounded-md border border-white/20 shrink-0" style="background-color: ${cFace};"></span>
            <div class="min-w-0">
                <div class="text-[10px] text-slate-400">Texto / Relieve</div>
                <div class="text-[11px] font-mono text-white font-bold">${cFace}</div>
            </div>
        </div>
        <div class="flex items-center gap-2 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span class="w-4 h-4 rounded-md border border-white/20 shrink-0" style="background-color: ${cAccent};"></span>
            <div class="min-w-0">
                <div class="text-[10px] text-slate-400">Acentos / Marco</div>
                <div class="text-[11px] font-mono text-white font-bold">${cAccent}</div>
            </div>
        </div>
    `;
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
        heightMm = Math.round(size.y);
        depthMm = Math.round(size.z * 10) / 10;
    }

    // Pill flotante del visor 3D
    const badgeEl = document.getElementById('visor-dims-badge');
    if (badgeEl) {
        badgeEl.innerHTML = `
            <div class="flex items-center gap-1.5 text-amber-400 font-bold">
                <i data-lucide="ruler" class="w-3.5 h-3.5"></i>
                <span>Dimensiones Reales:</span>
            </div>
            <span class="font-mono text-white font-semibold">${widthMm} mm <span class="text-slate-500">×</span> ${heightMm} mm <span class="text-slate-500">×</span> ${depthMm} mm</span>
        `;
        if (window.lucide && window.lucide.createIcons) {
            window.lucide.createIcons();
        }
    }

    // Ficha técnica
    const dimsEl = document.getElementById('spec-dimensions');
    if (dimsEl) {
        dimsEl.textContent = `${widthMm} mm (Ancho) × ${heightMm} mm (Alto) × ${depthMm} mm (Espesor)`;
    }
}

/**
 * Ajusta la cámara a ángulos predeterminados
 */
export function setCameraPreset(preset) {
    if (!camera || !controls) return;

    const isHanging = cadState.activeWorkspace === 'hanging';
    const targetZ = isHanging ? 140 : 12;

    if (preset === 'frontal') {
        const dist = isHanging ? 520 : 340;
        camera.position.set(0, -dist, targetZ);
        controls.target.set(0, 0, targetZ);
    } else if (preset === 'isometric') {
        const dist = isHanging ? 580 : 380;
        camera.position.set(-dist * 0.7, -dist * 0.75, targetZ + dist * 0.55);
        controls.target.set(0, 0, targetZ);
    } else if (preset === 'top') {
        const dist = isHanging ? 650 : 420;
        camera.position.set(0, -1, targetZ + dist);
        controls.target.set(0, 0, targetZ);
    }

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
            btn.className = "flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 shadow transition";
        } else {
            btn.className = "flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition";
        }
    }
}

/**
 * Alterna entre fondo de estantería de madera cálida y placa de impresión 3D
 */
export function toggleEnvironment() {
    cadState.showShelf = !cadState.showShelf;
    refreshEnvironment();

    const btn = document.getElementById('btn-env-toggle');
    if (btn) {
        const label = document.getElementById('lbl-env-toggle');
        if (label) {
            label.textContent = cadState.showShelf ? 'Estante de Biblioteca' : 'Cama de Impresión 25 cm';
        }
        if (cadState.showShelf) {
            btn.classList.add('border-amber-500/50', 'text-amber-300');
        } else {
            btn.classList.remove('border-amber-500/50', 'text-amber-300');
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
 * Copia el enlace directo con el hash de la propuesta actual para enviar a jefatura
 */
export function copyActiveShareUrl() {
    if (!activeProposal) return;

    try {
        const hash = encodeConfigToUrlHash(activeProposal);
        const origin = window.location.origin;
        const pathname = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/visor\.html$/, '');
        const shareUrl = `${origin}${pathname}/visor.html#share=${hash}`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast('Enlace Copiado', 'Envía este enlace por correo o chat para que tu jefe lo vea directamente.');
            }).catch(() => {
                prompt('Copia este enlace directo para compartir:', shareUrl);
            });
        } else {
            prompt('Copia este enlace directo para compartir:', shareUrl);
        }
    } catch (e) {
        console.error(e);
    }
}

/**
 * Descarga la plantilla de prueba en papel 1:1 (PNG con fondo blanco)
 */
export async function downloadProposalProof() {
    if (!activeProposal) return;

    try {
        showToast('Generando Plantilla...', 'Creando imagen 1:1 en alta resolución con fondo blanco.');
        const blob = await renderSignImageBlob({
            viewMode: 'orthographic',
            includeGuides: true,
            targetWidth: 2400,
            targetHeight: 1600
        });

        const cleanName = sanitizeFileName(activeProposal.name || 'Plantilla_Letrero');
        downloadBlob(blob, `BiblioSign_PruebaPapel_${cleanName}.png`);
        showToast('Plantilla Descargada', 'Imprime en hoja normal a escala 100% para verificar tamaño.');
    } catch (e) {
        console.error('[Visor] Error exportando imagen:', e);
        showToast('Error', 'No se pudo generar la imagen de prueba.');
    }
}

/**
 * Descarga el archivo .3MF Multicolor para enviar a la impresora 3D
 */
export async function downloadProposal3MF() {
    if (!activeProposal) return;

    try {
        await exportBambu3MF();
    } catch (e) {
        console.error('[Visor] Error exportando 3MF:', e);
        showToast('Error', 'No se pudo generar el archivo 3MF.');
    }
}

/**
 * Muestra una notificación flotante estilo Toast
 */
function showToast(title, desc) {
    const toast = document.getElementById('visor-toast');
    const toastTitle = document.getElementById('visor-toast-title');
    const toastDesc = document.getElementById('visor-toast-desc');

    if (!toast) return;

    if (toastTitle) toastTitle.textContent = title;
    if (toastDesc) toastDesc.textContent = desc;

    toast.classList.remove('opacity-0', 'translate-y-3', 'pointer-events-none');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-3', 'pointer-events-none');
    }, 3800);
}
