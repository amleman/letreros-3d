import { cadState } from '../config/state.js';
import { institutionalFonts } from '../config/fonts.js';

/**
 * Verifica que el ArrayBuffer tenga una firma binaria válida de fuente (TTF, OTF o WOFF1)
 */
export function isValidFontBuffer(buffer) {
    if (!buffer || buffer.byteLength < 64) return false;
    const view = new DataView(buffer);
    const magic = view.getUint32(0, false);
    // 0x00010000 = TrueType, 0x74727565 = 'true', 0x4F54544F = 'OTTO' (CFF), 0x774F4646 = 'wOFF' (WOFF1)
    return (
        magic === 0x00010000 ||
        magic === 0x74727565 ||
        magic === 0x4F54544F ||
        magic === 0x774F4646
    );
}

/**
 * Carga una fuente OpenType (.TTF / .WOFF) con validación estricta y respaldo a Canvas 2D
 */
export async function ensureFontLoaded(fontKey) {
    if (cadState.otFonts[fontKey]) return cadState.otFonts[fontKey];

    const badge = document.getElementById('font-loading-badge');
    const fontMeta = institutionalFonts[fontKey] || institutionalFonts.montserrat;
    if (badge) {
        badge.textContent = `Cargando ${fontMeta.name}...`;
        badge.className = "text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300";
    }

    const urlsToTry = fontMeta.urls || [];

    for (const url of urlsToTry) {
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) continue;
            const arrayBuffer = await response.arrayBuffer();

            // Evitar buffers de error tipo HTML o texto ("Package size exceeded")
            if (!isValidFontBuffer(arrayBuffer)) {
                continue;
            }

            if (window.opentype && window.opentype.parse) {
                const parsedFont = window.opentype.parse(arrayBuffer);
                if (parsedFont && parsedFont.glyphs) {
                    cadState.otFonts[fontKey] = parsedFont;
                    if (badge) {
                        badge.textContent = "UTF-8 Español Activo (ÁÉÍÓÚÑ)";
                        badge.className = "text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold";
                    }
                    return parsedFont;
                }
            }
        } catch (err) {
            // Continuar con el siguiente espejo de CDN
        }
    }

    // Respaldo vectorial de emergencia vía Canvas 2D
    const fallbackFontObj = { isCanvasFallback: true, cssFamily: fontMeta.cssFamily };
    cadState.otFonts[fontKey] = fallbackFontObj;
    if (badge) {
        badge.textContent = "UTF-8 Español Activo (Modo Vectorial)";
        badge.className = "text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold";
    }
    return fallbackFontObj;
}
