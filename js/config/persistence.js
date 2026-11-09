/**
 * Sistema de Persistencia y Gestión de Configuraciones para BiblioSign 3D CAD
 * - Auto-guardado en tiempo real en localStorage (la última sesión siempre se restaura al recargar)
 * - Guardado y carga de configuraciones personalizadas nombradas por el usuario
 */

import { cadState } from './state.js';
import { isInVitrina } from '../ui/vitrinaPanel.js';
import { institutionalFonts } from './fonts.js';

export const STORAGE_LAST_SESSION_KEY = 'bibliosign_last_session_config';
export const STORAGE_SAVED_CONFIGS_KEY = 'bibliosign_saved_user_configs';

let autoSaveTimer = null;

/**
 * Captura todos los parámetros actuales de la UI y del estado CAD en un objeto serializable
 */
export function captureCurrentConfig(name = '') {
    const textVal = document.getElementById('sign-text')?.value || 'INVESTIGACIÓN';
    const subtextVal = document.getElementById('sign-subtext')?.value || '';
    const showSubVal = document.getElementById('show-subtext')?.checked ?? false;
    const fontVal = document.getElementById('param-font')?.value || 'arial';
    const subFontVal = document.getElementById('param-sub-font')?.value || 'oswald';
    const subSizeVal = parseFloat(document.getElementById('param-sub-size')?.value || 10);
    const subGapVal = parseFloat(document.getElementById('param-sub-gap')?.value || 0);

    const letterSizeVal = parseFloat(document.getElementById('param-letter-size')?.value || 36);
    const baseDepthVal = parseFloat(document.getElementById('param-base-depth')?.value || 6);
    const letterDepthVal = parseFloat(document.getElementById('param-letter-depth')?.value || 5);
    const bevelVal = parseFloat(document.getElementById('param-bevel')?.value || 0.8);
    const spacingVal = parseFloat(document.getElementById('param-spacing')?.value || 4);

    const textOffsetX = parseFloat(document.getElementById('param-text-offset-x')?.value || 0);
    const textOffsetY = parseFloat(document.getElementById('param-text-offset-y')?.value || 0);
    const subOffsetX = parseFloat(document.getElementById('param-sub-offset-x')?.value || 0);
    const subOffsetY = parseFloat(document.getElementById('param-sub-offset-y')?.value || 0);
    const globalScale = parseFloat(document.getElementById('param-global-scale')?.value || 100);

    const colorFace = document.getElementById('color-face')?.value || '#f5f5f0';
    const colorAccent = document.getElementById('color-accent')?.value || '#b07d4f';
    const colorBase = document.getElementById('color-base')?.value || '#1e242b';
    const colorSubtext = document.getElementById('color-subtext')?.value || '#b07d4f';

    const pwEl = document.getElementById('param-plaque-width');
    const phEl = document.getElementById('param-plaque-height');
    const prEl = document.getElementById('param-plaque-radius');
    const psEl = document.getElementById('plaque-split-toggle');
    const pgEl = document.getElementById('param-plaque-gap');
    const poEl = document.getElementById('param-plaque-offset');

    const swEl = document.getElementById('param-shelf-width');
    const shEl = document.getElementById('param-shelf-height');
    const shelfConfig = {
        width: swEl ? parseFloat(swEl.value) : 200,
        widthTouched: !!swEl?.dataset?.touched,
        height: shEl ? parseFloat(shEl.value) : 52,
        heightTouched: !!shEl?.dataset?.touched
    };

    const plaqueConfig = {
        width: pwEl ? parseFloat(pwEl.value) : 260,
        widthTouched: !!pwEl?.dataset?.touched,
        height: phEl ? parseFloat(phEl.value) : 75,
        heightTouched: !!phEl?.dataset?.touched,
        radius: prEl ? parseFloat(prEl.value) : 14,
        split: psEl ? psEl.checked : false,
        gap: pgEl ? parseFloat(pgEl.value) : 0,
        offset: poEl ? parseFloat(poEl.value) : 0
    };

    const logoMode = document.getElementById('logo-mode-select')?.value || 'none';
    const logoLeft = document.getElementById('logo-left-select')?.value || 'usac';
    const logoRight = document.getElementById('logo-right-select')?.value || 'biblioteca';
    const logoSize = parseFloat(document.getElementById('param-logo-size')?.value || 40);
    const logoShowSeparate = document.getElementById('logo-show-separate-toggle')?.checked ?? true;

    const logosConfig = {
        mode: logoMode,
        left: logoLeft,
        right: logoRight,
        size: logoSize,
        showSeparate: logoShowSeparate
    };

    const cwEl = document.getElementById('param-ceiling-width');
    const chEl = document.getElementById('param-ceiling-height');
    const csEl = document.getElementById('ceiling-split-toggle');
    const cgEl = document.getElementById('param-ceiling-gap');
    const coEl = document.getElementById('param-ceiling-offset');

    const ceilingConfig = {
        width: cwEl ? parseFloat(cwEl.value) : 240,
        widthTouched: !!cwEl?.dataset?.touched,
        height: chEl ? parseFloat(chEl.value) : 80,
        heightTouched: !!chEl?.dataset?.touched,
        split: csEl ? csEl.checked : false,
        gap: cgEl ? parseFloat(cgEl.value) : 0,
        offset: coEl ? parseFloat(coEl.value) : 0
    };

    const wedgeConfig = {
        angle: parseFloat(document.getElementById('param-wedge-angle')?.value || 12),
        depth: parseFloat(document.getElementById('param-wedge-depth')?.value || 55)
    };

    return {
        id: 'cfg_' + Date.now(),
        name: name || (textVal.split('\n')[0] || 'Configuración'),
        timestamp: Date.now(),
        activeWorkspace: cadState.activeWorkspace,
        style: cadState.style,
        text: textVal,
        subtext: subtextVal,
        showSubtext: showSubVal,
        font: fontVal,
        subFont: subFontVal,
        subSize: subSizeVal,
        subGap: subGapVal,
        letterSize: letterSizeVal,
        baseDepth: baseDepthVal,
        letterDepth: letterDepthVal,
        bevel: bevelVal,
        spacing: spacingVal,
        textOffsetX: textOffsetX,
        textOffsetY: textOffsetY,
        subOffsetX,
        subOffsetY,
        globalScale: globalScale,
        colorFace: colorFace,
        colorAccent: colorAccent,
        colorBase: colorBase,
        colorSubtext: colorSubtext,
        useMultiColor: cadState.useMultiColor,
        plaque: plaqueConfig,
        shelf: shelfConfig,
        logos: logosConfig,
        ceiling: ceilingConfig,
        wedge: wedgeConfig,
        hanging: cadState.hanging
    };
}

/**
 * Aplica una configuración a la interfaz y al estado CAD
 */
export function applyConfig(cfg, rebuild = true) {
    if (!cfg) return;

    // 1. Textos
    const txtInput = document.getElementById('sign-text');
    if (txtInput) {
        txtInput.value = typeof cfg.text === 'string' ? cfg.text : 'INVESTIGACIÓN';
    }

    const subInput = document.getElementById('sign-subtext');
    if (subInput) {
        subInput.value = typeof cfg.subtext === 'string' ? cfg.subtext : '';
    }

    const showSubCheck = document.getElementById('show-subtext');
    if (showSubCheck) {
        showSubCheck.checked = typeof cfg.showSubtext === 'boolean' ? cfg.showSubtext : false;
    }

    // 2. Tipografías
    const fontSel = document.getElementById('param-font');
    if (fontSel && cfg.font) fontSel.value = cfg.font;

    const subFontSel = document.getElementById('param-sub-font');
    if (subFontSel && cfg.subFont) subFontSel.value = cfg.subFont;

    const subSizeEl = document.getElementById('param-sub-size');
    if (subSizeEl && cfg.subSize != null) subSizeEl.value = cfg.subSize;

    const subGapEl = document.getElementById('param-sub-gap');
    if (subGapEl && cfg.subGap != null) subGapEl.value = cfg.subGap;

    // 3. Geometría
    const lsEl = document.getElementById('param-letter-size');
    if (lsEl && cfg.letterSize != null) lsEl.value = cfg.letterSize;

    const bdEl = document.getElementById('param-base-depth');
    if (bdEl && cfg.baseDepth != null) bdEl.value = cfg.baseDepth;

    const ldEl = document.getElementById('param-letter-depth');
    if (ldEl && cfg.letterDepth != null) ldEl.value = cfg.letterDepth;

    const bvEl = document.getElementById('param-bevel');
    if (bvEl && cfg.bevel != null) bvEl.value = cfg.bevel;

    const spEl = document.getElementById('param-spacing');
    if (spEl && cfg.spacing != null) spEl.value = cfg.spacing;

    // 4. Desplazamiento fino de texto (X e Y)
    const toxEl = document.getElementById('param-text-offset-x');
    if (toxEl && cfg.textOffsetX != null) toxEl.value = cfg.textOffsetX;

    const toyEl = document.getElementById('param-text-offset-y');
    if (toyEl && cfg.textOffsetY != null) toyEl.value = cfg.textOffsetY;

    // Configuraciones antiguas no traen desplazamiento propio del subtítulo: vuelve a 0
    const soxEl = document.getElementById('param-sub-offset-x');
    if (soxEl) soxEl.value = cfg.subOffsetX ?? 0;
    const soyEl = document.getElementById('param-sub-offset-y');
    if (soyEl) soyEl.value = cfg.subOffsetY ?? 0;

    // 5. Escala Global
    const gsEl = document.getElementById('param-global-scale');
    if (gsEl && cfg.globalScale != null) gsEl.value = cfg.globalScale;

    // 6. Colores
    const faceEl = document.getElementById('color-face');
    if (faceEl && cfg.colorFace) faceEl.value = cfg.colorFace;

    const accentEl = document.getElementById('color-accent');
    if (accentEl && cfg.colorAccent) accentEl.value = cfg.colorAccent;

    const baseEl = document.getElementById('color-base');
    if (baseEl && cfg.colorBase) baseEl.value = cfg.colorBase;

    const colorSubEl = document.getElementById('color-subtext');
    if (colorSubEl && cfg.colorSubtext) colorSubEl.value = cfg.colorSubtext;

    if (typeof cfg.useMultiColor === 'boolean') {
        cadState.useMultiColor = cfg.useMultiColor;
    }

    // 7. Opciones de Placa Wayfinding
    // Medidas del Canto de Anaquel (configuraciones antiguas no las traen: quedan en automático)
    const swEl = document.getElementById('param-shelf-width');
    const shEl = document.getElementById('param-shelf-height');
    [[swEl, cfg.shelf?.width, cfg.shelf?.widthTouched], [shEl, cfg.shelf?.height, cfg.shelf?.heightTouched]].forEach(([el, val, touched]) => {
        if (!el) return;
        if (val != null) el.value = val;
        if (touched) el.dataset.touched = 'true';
        else delete el.dataset.touched;
    });

    if (cfg.plaque) {
        const pwEl = document.getElementById('param-plaque-width');
        if (pwEl && cfg.plaque.width != null) {
            pwEl.value = cfg.plaque.width;
            if (cfg.plaque.widthTouched) pwEl.dataset.touched = 'true';
            else delete pwEl.dataset.touched;
        }

        const phEl = document.getElementById('param-plaque-height');
        if (phEl && cfg.plaque.height != null) {
            phEl.value = cfg.plaque.height;
            if (cfg.plaque.heightTouched) phEl.dataset.touched = 'true';
            else delete phEl.dataset.touched;
        }

        const prEl = document.getElementById('param-plaque-radius');
        if (prEl && cfg.plaque.radius != null) prEl.value = cfg.plaque.radius;

        const psEl = document.getElementById('plaque-split-toggle');
        const splitControls = document.getElementById('plaque-split-controls');
        if (psEl && typeof cfg.plaque.split === 'boolean') {
            psEl.checked = cfg.plaque.split;
            if (splitControls) splitControls.classList.toggle('hidden', !cfg.plaque.split);
        }

        const pgEl = document.getElementById('param-plaque-gap');
        if (pgEl && cfg.plaque.gap != null) pgEl.value = cfg.plaque.gap;

        const poEl = document.getElementById('param-plaque-offset');
        if (poEl && cfg.plaque.offset != null) poEl.value = cfg.plaque.offset;
    }

    // 8. Opciones de Escudos Institucionales
    if (cfg.logos) {
        const lmEl = document.getElementById('logo-mode-select');
        if (lmEl && cfg.logos.mode) lmEl.value = cfg.logos.mode;

        const llEl = document.getElementById('logo-left-select');
        if (llEl && cfg.logos.left) llEl.value = cfg.logos.left;

        const lrEl = document.getElementById('logo-right-select');
        if (lrEl && cfg.logos.right) lrEl.value = cfg.logos.right;

        const lzEl = document.getElementById('param-logo-size');
        if (lzEl && cfg.logos.size != null) lzEl.value = cfg.logos.size;

        const lsepEl = document.getElementById('logo-show-separate-toggle');
        if (lsepEl && typeof cfg.logos.showSeparate === 'boolean') {
            lsepEl.checked = cfg.logos.showSeparate;
        }
    }

    // 9. Opciones de Colgante Techo
    if (cfg.ceiling) {
        const cwEl = document.getElementById('param-ceiling-width');
        if (cwEl && cfg.ceiling.width != null) {
            cwEl.value = cfg.ceiling.width;
            if (cfg.ceiling.widthTouched) cwEl.dataset.touched = 'true';
            else delete cwEl.dataset.touched;
        }

        const chEl = document.getElementById('param-ceiling-height');
        if (chEl && cfg.ceiling.height != null) {
            chEl.value = cfg.ceiling.height;
            if (cfg.ceiling.heightTouched) chEl.dataset.touched = 'true';
            else delete chEl.dataset.touched;
        }

        const csEl = document.getElementById('ceiling-split-toggle');
        const cControls = document.getElementById('ceiling-split-controls');
        if (csEl && typeof cfg.ceiling.split === 'boolean') {
            csEl.checked = cfg.ceiling.split;
            if (cControls) cControls.classList.toggle('hidden', !cfg.ceiling.split);
        }

        const cgEl = document.getElementById('param-ceiling-gap');
        if (cgEl && cfg.ceiling.gap != null) cgEl.value = cfg.ceiling.gap;

        const coEl = document.getElementById('param-ceiling-offset');
        if (coEl && cfg.ceiling.offset != null) coEl.value = cfg.ceiling.offset;
    }

    // 10. Estilo activo
    if (cfg.style && window.selectStyle) {
        window.selectStyle(cfg.style);
    } else if (cfg.style) {
        cadState.style = cfg.style;
    }

    // 11. Espacio de trabajo (Sobremesa o Colgante de Anaquel)
    if (cfg.activeWorkspace && cfg.activeWorkspace !== cadState.activeWorkspace && window.switchMainTab) {
        window.switchMainTab(cfg.activeWorkspace);
    }

    if (cfg.hanging && cfg.hanging.plates) {
        cadState.hanging.plates = JSON.parse(JSON.stringify(cfg.hanging.plates));
        if (window.renderHangingPlatesList) window.renderHangingPlatesList();
    }

    if (rebuild && window.triggerRebuild) {
        window.triggerRebuild();
    }
}

/**
 * Auto-guarda la sesión activa en localStorage con debounce
 */
export function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        try {
            const config = captureCurrentConfig();
            localStorage.setItem(STORAGE_LAST_SESSION_KEY, JSON.stringify(config));
        } catch (err) {
            console.warn('[BiblioSign] No se pudo auto-guardar en localStorage:', err);
        }
    }, 250);
}

/**
 * Restaura la última sesión guardada si existe
 * @returns {boolean} true si se restauró con éxito, false en caso contrario
 */
export function restoreLastSession() {
    try {
        const raw = localStorage.getItem(STORAGE_LAST_SESSION_KEY);
        if (!raw) return false;
        const config = JSON.parse(raw);
        if (!config || typeof config !== 'object') return false;

        applyConfig(config, false);
        return true;
    } catch (err) {
        console.warn('[BiblioSign] Error restaurando última sesión:', err);
        return false;
    }
}

/**
 * Guarda una configuración nombrada permanente en la lista de presets del usuario
 */
export function saveUserPreset(customName) {
    const trimmed = (customName || '').trim();
    const config = captureCurrentConfig(trimmed || 'Mi Configuración');

    try {
        const existingRaw = localStorage.getItem(STORAGE_SAVED_CONFIGS_KEY);
        const list = existingRaw ? JSON.parse(existingRaw) : [];
        list.unshift(config); // Al inicio
        localStorage.setItem(STORAGE_SAVED_CONFIGS_KEY, JSON.stringify(list));
        renderUserPresetsList();
        return config;
    } catch (err) {
        console.error('[BiblioSign] Error guardando preset:', err);
        throw err;
    }
}

/**
 * Elimina una configuración nombrada
 */
export function deleteUserPreset(id) {
    try {
        const existingRaw = localStorage.getItem(STORAGE_SAVED_CONFIGS_KEY);
        if (!existingRaw) return;
        const list = JSON.parse(existingRaw);
        const filtered = list.filter(item => item.id !== id);
        localStorage.setItem(STORAGE_SAVED_CONFIGS_KEY, JSON.stringify(filtered));
        renderUserPresetsList();
    } catch (err) {
        console.error('[BiblioSign] Error eliminando preset:', err);
    }
}

/**
 * Carga una configuración por su ID
 */
export function loadUserPresetById(id) {
    try {
        const existingRaw = localStorage.getItem(STORAGE_SAVED_CONFIGS_KEY);
        if (!existingRaw) return;
        const list = JSON.parse(existingRaw);
        const found = list.find(item => item.id === id);
        if (found) {
            applyConfig(found, true);
            scheduleAutoSave();
            return found;
        }
    } catch (err) {
        console.error('[BiblioSign] Error cargando preset:', err);
    }
}

/**
 * Renderiza la lista de configuraciones guardadas en el panel UI
 */
export function renderUserPresetsList() {
    const container = document.getElementById('saved-configs-container');
    if (!container) return;

    try {
        const existingRaw = localStorage.getItem(STORAGE_SAVED_CONFIGS_KEY);
        const list = existingRaw ? JSON.parse(existingRaw) : [];

        if (list.length === 0) {
            container.innerHTML = `
                <div class="text-[10px] text-slate-500 italic p-2 text-center bg-slate-950/40 rounded-lg border border-dashed border-slate-800">
                    Aún no has guardado configuraciones personalizadas. Asigna un nombre abajo y pulsa "Guardar Actual".
                </div>
            `;
            return;
        }

        const styleLabels = {
            modular: 'Bloques Maker',
            solid: 'Placa Monolítica',
            filigree: 'Capitular Clásica',
            plaque: 'Placa Wayfinding',
            shelf_clip: 'Canto Anaquel',
            wedge: 'Cuña 60°',
            ceiling: 'Colgante Techo'
        };

        container.innerHTML = list.map(item => {
            const fontName = institutionalFonts[item.font]?.name || item.font || 'Fuente';
            const styleLabel = styleLabels[item.style] || item.style || 'Estilo';
            const displayText = (item.text || '').replace(/\n/g, ' / ').slice(0, 26);

            return `
                <div class="flex items-center justify-between gap-1.5 p-2 bg-slate-950/70 border border-slate-700/60 hover:border-amber-500/50 rounded-xl transition">
                    <button type="button" onclick="window.loadSavedConfig('${item.id}')" class="flex-1 text-left min-w-0" title="Cargar esta configuración">
                        <div class="text-xs font-bold text-white truncate">${item.name}</div>
                        <div class="text-[10px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                            <span class="text-amber-400 font-semibold">${styleLabel}</span>
                            <span>•</span>
                            <span class="text-slate-300 font-mono">${fontName}</span>
                            <span>•</span>
                            <span class="text-slate-400 italic">"${displayText}"</span>
                        </div>
                    </button>
                    <div class="flex items-center gap-1 shrink-0">
                        <button type="button" onclick="window.toggleVitrinaDesign('${item.id}')" class="text-[10px] px-2 py-1 rounded-lg border transition font-bold ${isInVitrina(item.id) ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-amber-300'}" title="${isInVitrina(item.id) ? 'Está en la vitrina de Netlify (clic para quitar)' : 'Mostrar este diseño en la vitrina de Netlify para jefatura'}">
                            ★
                        </button>
                        <button type="button" onclick="window.sharePresetToVisor('${item.id}')" class="text-[10px] bg-indigo-900/80 hover:bg-indigo-700 text-indigo-200 px-2 py-1 rounded-lg border border-indigo-500/40 transition font-bold flex items-center gap-1" title="Copiar enlace para que un tercero o jefe lo vea en el visor">
                            <i data-lucide="share-2" class="w-3 h-3"></i>
                            <span>Visor</span>
                        </button>
                        <button type="button" onclick="window.loadSavedConfig('${item.id}')" class="text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-1 rounded-lg border border-slate-700 transition font-bold" title="Cargar">
                            Cargar
                        </button>
                        <button type="button" onclick="window.deleteSavedConfig('${item.id}')" class="text-slate-500 hover:text-rose-400 p-1 rounded transition" title="Eliminar configuración">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide && window.lucide.createIcons) {
            window.lucide.createIcons();
        }
    } catch (err) {
        console.error('[BiblioSign] Error renderizando presets:', err);
    }
}

/**
 * Codifica una configuración a base64 seguro para URL
 */
export function encodeConfigToUrlHash(config) {
    try {
        const jsonStr = JSON.stringify(config);
        return encodeURIComponent(btoa(encodeURIComponent(jsonStr)));
    } catch (e) {
        console.error('[BiblioSign] Error codificando config:', e);
        return '';
    }
}

/**
 * Decodifica una configuración desde un parámetro o hash de URL
 */
export function decodeConfigFromUrlHash(hashOrParam) {
    try {
        if (!hashOrParam) return null;
        let clean = hashOrParam.replace(/^[#?](cfg|share)=/, '').replace(/^[#?]/, '');
        clean = decodeURIComponent(clean);
        const jsonStr = decodeURIComponent(atob(clean));
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('[BiblioSign] Error decodificando config de URL:', e);
        return null;
    }
}
