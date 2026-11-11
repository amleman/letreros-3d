/**
 * Estado global reactivo del motor CAD 3D y visor
 */
export const cadState = {
    // Modo de trabajo actual: 'tabletop' (Sobremesa/Anaquel fijo) | 'hanging' (Rótulo Colgante Modular)
    activeWorkspace: 'tabletop',

    // Estilo para letreros de sobremesa/anaquel/techo:
    // 'modular' | 'solid' | 'filigree' | 'plaque' | 'shelf_clip' | 'wedge' | 'ceiling'
    style: 'modular',

    otFonts: {},      // Fuentes OpenType.js con soporte completo UTF-8 (Á, É, Í, Ó, Ú, Ñ, Ü)
    useMultiColor: false,
    multiColors: ['#b85d43', '#3b6e75', '#c9974c', '#6b4c5b', '#4d6b53', '#2b4c65'],
    wireframe: false,
    showShelf: false, // Ahora false por defecto para mostrar la cama 3D de 25 cm por debajo
    showBedGrid: true, // Cuadrícula de cama de impresión 3D
    bedSizeMm: 250,   // Tamaño estándar 25 cm x 25 cm (250x250 mm)
    isOverBedSize: false,
    explodedView: false,
    rebuildTimer: null,

    // Configuración específica para el nuevo espacio de Rótulos Colgantes Modulares de Anaquel
    hanging: {
        bracketStyle: 'ornate', // 'ornate' (Hierro forjado con volutas como foto 2) | 'minimal' (Limpia)
        bracketColor: '#1e242b', // Hierro forjado oscuro
        bracketLengthMm: 200,
        mountType: 'adhesive', // 'adhesive' (Zapata plana sin hoyos para cinta 3M) | 'top_hook' (Gancho sobre marco superior) | 'screws' (Tornillos tradicionales)
        viewMode: 'assembled', // 'assembled' (En anaquel de madera) | 'bed' (Plano en cama 25 cm)
        bedPlateView: 'all', // 'all' (Todas las camas), 'bracket' (Solo brazo), 'plates' (Solo placas), 'chains' (Solo eslabones)
        plateStyle: 'slotted', // 'slotted' (Tablillas deslizables tipo gasolinera) | 'fixed' (Placa fija monolítica)
        bracketAngle45: false, // Si es true, el brazo se rota 45° en la cama para aprovechar la diagonal de 353 mm
        chainColor: '#64748b',   // Acero / bronce
        chainLengthMm: 35,
        rebuildTimer: null,
        plates: [
            {
                id: 'plate_1',
                text: 'HISTORIA',
                font: 'cinzel',
                plateColor: '#1e242b',
                frameColor: '#d49b4b',
                textColor: '#f8f4e8',
                width: 210,
                height: 52,
                depth: 4.5,
                hasLowerLoops: true // Permite colgar placas inferiores
            },
            {
                id: 'plate_2',
                text: '900 • HISTORIA & GEOGRAFÍA',
                font: 'montserrat',
                plateColor: '#172a45',
                frameColor: '#d49b4b',
                textColor: '#f8f4e8',
                width: 185,
                height: 38,
                depth: 4.0,
                hasLowerLoops: true
            }
        ]
    }
};
