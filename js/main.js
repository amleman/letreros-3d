/**
 * BiblioSign 3D CAD & Bambu Studio Exporter
 * Punto de entrada principal modular
 */
import { initScene } from './scene/sceneManager.js';
import { rebuildSignCAD } from './cad/signGenerator.js';
import { rebuildHangingSignCAD } from './cad/hangingSignGenerator.js';
import { exposeGlobalMethods, renderUserPalettesList, renderHangingPlatesList } from './ui/uiController.js';
import { updatePitchCalculator } from './ui/calculator.js';
import { restoreLastSession, renderUserPresetsList } from './config/persistence.js';

// 1. Exponer métodos a window para compatibilidad con eventos del DOM
exposeGlobalMethods();

// 2. Inicializar Three.js y entorno 3D (Cama de 25 cm por defecto)
initScene('three-container');

// 3. Restaurar automáticamente la última sesión guardada (si existe)
restoreLastSession();

// 4. Renderizar listas dinámicas de usuario
renderUserPalettesList();
renderHangingPlatesList();
renderUserPresetsList();

// 5. Inicializar iconos de Lucide
if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
}

// 6. Inicializar valores de la calculadora de presupuesto/horas
updatePitchCalculator();

// 7. Generar modelos iniciales
rebuildSignCAD();
rebuildHangingSignCAD();
