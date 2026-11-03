/**
 * Paletas de color y presets institucionales
 */
export const defaultPalettes = {
    nordic: {
        name: 'Nórdico / MAKER',
        face: '#f5f5f0',
        accent: '#b07d4f',
        base: '#1e242b',
        multi: false
    },
    oxford: {
        name: 'Clásico & Bronce',
        face: '#f8f4e8',
        accent: '#d49b4b',
        base: '#172a45',
        multi: false
    },
    botanical: {
        name: 'Verde & Terracota',
        face: '#f4efe6',
        accent: '#c86d51',
        base: '#1f3a2e',
        multi: false
    },
    ceiling_indigo: {
        name: 'Índigo & Aluminio (Techo)',
        face: '#ffffff',
        accent: '#cbd5e1',
        base: '#2b2d5c',
        multi: false
    },
    multidewey: {
        name: 'Multicolor Sobrio (Dewey)',
        face: '#f5f5f0',
        accent: '#c9974c',
        base: '#1e242b',
        multi: true
    }
};

export const palettes = { ...defaultPalettes };

export const presets = [
    { text: 'JEFE DE BIBLIOTECA', subtext: 'DIRECCIÓN GENERAL', style: 'wedge', showSub: false, font: 'cinzel' },
    { text: 'COORDINADOR / DE SERVICIOS ESPECIALES', subtext: 'COORDINACIÓN ACADÉMICA', style: 'wedge', showSub: false, font: 'montserrat' },
    { text: 'SECRETARÍA DE JEFATURA', subtext: 'ATENCIÓN Y GESTIÓN', style: 'wedge', showSub: false, font: 'montserrat' },
    { text: 'SECCIÓN / DE PERIÓDICOS', subtext: 'HEMEROTECA CENTRAL', style: 'ceiling', showSub: false, font: 'arial' },
    { text: 'FOLLETOS / SECCIÓN GUATEMALA', subtext: 'COLECCIÓN NACIONAL', style: 'ceiling', showSub: false, font: 'arial' },
    { text: 'FILOSOFÍA', subtext: '100 • PENSAMIENTO CLÁSICO', style: 'filigree', showSub: true, font: 'cinzel' },
    { text: 'NOVELA NEGRA', subtext: '823 • NARRATIVA MODERNA', style: 'shelf_clip', showSub: true, font: 'oswald' },
    { text: 'INVESTIGACIÓN', subtext: 'SECCIÓN 001 • TESIS', style: 'modular', showSub: false, font: 'montserrat' }
];

const STORAGE_KEY = 'bibliosign_custom_palettes_v1';

/**
 * Carga las paletas guardadas por el usuario desde localStorage
 */
export function loadUserPalettes() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('No se pudo acceder a localStorage para paletas:', e);
    }
    return [];
}

/**
 * Guarda una nueva paleta personalizada de colores
 */
export function saveUserPalette(name, colors) {
    const list = loadUserPalettes();
    const newPalette = {
        id: 'palette_' + Date.now(),
        name: name.trim() || `Paleta ${list.length + 1}`,
        face: colors.face,
        accent: colors.accent,
        base: colors.base,
        multi: !!colors.multi,
        createdAt: new Date().toISOString()
    };
    list.unshift(newPalette);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('Error al guardar paleta en localStorage:', e);
    }
    return newPalette;
}

/**
 * Elimina una paleta guardada por su ID
 */
export function deleteUserPalette(id) {
    let list = loadUserPalettes();
    list = list.filter(p => p.id !== id);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('Error al actualizar localStorage tras eliminar paleta:', e);
    }
    return list;
}
