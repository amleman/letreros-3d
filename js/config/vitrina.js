/**
 * VITRINA PÚBLICA PARA JEFATURA (Netlify)
 *
 * public/vitrina.json contiene SOLO lo que el diseñador decide mostrar:
 *   - designs: copias de las configuraciones guardadas marcadas con ★ Vitrina
 *   - work:    bitácora de horas reales trabajadas en el proyecto
 *
 * En local (npm run dev) se lee/escribe vía /api/vitrina (plugin en vite.config.js).
 * En Netlify el visor solo lee ./vitrina.json como archivo estático.
 */

export const IS_VITRINA_BUILD = import.meta.env.MODE === 'vitrina';

const DEV_API = '/api/vitrina';

export function emptyVitrina() {
    return {
        updatedAt: null,
        designs: [],
        work: {
            assignedHoursPerWeek: 4,
            estimatedProjectHours: 0,
            entries: []
        }
    };
}

function normalize(data) {
    const base = emptyVitrina();
    if (!data || typeof data !== 'object') return base;
    return {
        updatedAt: data.updatedAt || null,
        designs: Array.isArray(data.designs) ? data.designs : [],
        work: {
            ...base.work,
            ...(data.work || {}),
            entries: Array.isArray(data.work?.entries) ? data.work.entries : []
        }
    };
}

/**
 * Lee la vitrina. En desarrollo usa la API local (siempre fresca); si no existe, el archivo estático.
 */
export async function loadVitrina() {
    const sources = import.meta.env.DEV ? [DEV_API, './vitrina.json'] : ['./vitrina.json'];
    for (const url of sources) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) return normalize(await res.json());
        } catch (e) {
            // Probar siguiente fuente
        }
    }
    return emptyVitrina();
}

/**
 * Guarda la vitrina en public/vitrina.json (solo funciona con el servidor de desarrollo local)
 */
export async function saveVitrina(data) {
    const payload = { ...normalize(data), updatedAt: new Date().toISOString() };
    const res = await fetch(DEV_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Error ${res.status} guardando vitrina.json`);
    }
    return payload;
}

/**
 * Suma de horas registradas en la bitácora
 */
export function totalLoggedHours(work) {
    return (work?.entries || []).reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
}
