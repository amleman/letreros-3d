# 📚 Guía de Arquitectura y Contexto del Proyecto: BiblioSign 3D CAD

> **Propósito de este documento:**  
> Servir como referencia técnica completa y exhaustiva para modelos de lenguaje (Claude / LLMs) y desarrolladores. Permite comprender el 100% de la lógica, estructura de datos, funciones críticas, variables globales, motores CAD 3D, exportadores y convenciones del proyecto sin necesidad de inspeccionar individualmente cada archivo fuente, ahorrando tokens y tiempo de exploración.

---

## 1. Visión General del Proyecto

**BiblioSign 3D CAD** es una suite de diseño y visualización paramétrica 3D desarrollada para la señalética institucional de bibliotecas universitarias (específicamente la Universidad de San Carlos de Guatemala - USAC y su Sistema Bibliotecario).

El proyecto resuelve tres desafíos centrales de la señalización física:
1. **Modelado CAD paramétrico en navegador:** Generación en tiempo real de mallas 3D complejas (letreros de sobremesa, cuñas anguladas, cantos de estante, rótulos colgantes y placas monumentales con escudos vectoriales en bajorrelieve/altorrelieve).
2. **Fabricación aditiva optimizada (Impresión 3D):** Soporte nativo para impresión multicolor en **Bambu Studio / OrcaSlicer** mediante archivos `.3MF` con objetos XML desacoplados (sin pintar a mano con la herramienta AMS) y archivos `.STL` con orígenes comunes coordinados. Alertas automáticas para camas de impresión estándar de **250 × 250 mm (25 cm²)** y sistema de división en 2 piezas con ensamble tipo puzzle machihembrado sin pegamento.
3. **Flujo de aprobación ejecutiva:** Página dual (`index.html` para el diseñador técnico CAD y `visor.html` para presentación a directores/jefes) con codificación URL `#share=<base64>` para compartir propuestas exactas sin necesidad de backend o base de datos.

---

## 2. Stack Tecnológico & Dependencias

* **Bundler & Build Tool:** [Vite 5.x](https://vitejs.dev/) configurado en modo multi-página (`index.html` y `visor.html`).
* **Lenguaje:** JavaScript moderno nativo (ES Modules, Vanilla JS, sin frameworks SPA pesados).
* **Motor 3D:** [Three.js r160](https://threejs.org/) cargado vía Importmap (`three` y `three/addons/` con `OrbitControls`).
* **Tipografía Vectorial UTF-8:** [OpenType.js 1.3.4](https://opentype.js.org/) para extraer curvas Bézier y glifos vectoriales reales de archivos `.TTF` y `.WOFF`, garantizando acentos en español (Á, É, Í, Ó, Ú, Ñ) con extrusión sólida manifold.
* **Empaquetado de Archivos 3D:** [JSZip 3.10.1](https://stuk.github.io/jszip/) para generar el contenedor ZIP del formato estándar de manufactura 3D `.3MF` (`3D/3dmodel.model` y `[Content_Types].xml`).
* **Diseño UI:** [Tailwind CSS](https://tailwindcss.com/) (CDN) con temas oscuros `slate-900` / `slate-950` y acentos `amber-500` / `indigo-500`.
* **Iconografía:** [Lucide Icons](https://lucide.dev/).
* **Testing Automatizado:** Puppeteer Core para verificación visual de renders y capturas de pantalla de validación.

---

## 3. Estructura de Directorios

```text
Letreros 3D/
├── index.html                                    # Aplicación CAD completa (Diseñador técnico con sliders y controles)
├── visor.html                                    # Visor Ejecutivo para Jefatura (Solo lectura, Ficha Técnica, 3D interactivo)
├── package.json                                  # Scripts (dev, build, preview) y dependencias
├── vite.config.js                                # Configuración Rollup multi-página (main y visor)
├── README.md                                     # Documentación general y manual de usuario
├── contexto.md                                   # Este archivo (Guía de contexto para Claude/LLM)
├── .gitignore                                    # Exclusión de node_modules, dist, scratch, *.log
│
├── css/
│   └── styles.css                                # Personalización de sliders, inputs numéricos y scrollbars oscuros
│
├── fonts/                                        # Fuentes locales (.ttf / .woff) cargadas por OpenType.js
│   ├── BebasNeue-Regular.ttf                     # Tipografía institucional para rótulos grandes
│   ├── arial.ttf / arialbd.ttf                   # Arial Bold estándar de alta legibilidad
│   ├── montserrat-700.woff                       # Montserrat Bold geométrica
│   ├── cinzel-700.woff                           # Cinzel Bold estilo romano monumental
│   ├── oswald-700.woff                           # Oswald Bold condensada moderna
│   ├── playfair-700.woff                         # Playfair Display Bold para títulos clásicos
│   └── baskerville-700.woff                      # Libre Baskerville clásica académica
│
├── public/fonts/                                 # Copia estática pública para despliegue en Vite (dist/fonts/)
│
└── js/
    ├── main.js                                   # Punto de entrada inicial del diseñador CAD (index.html)
    │
    ├── viewer/
    │   └── visorMain.js                          # Orquestador del Visor Ejecutivo (visor.html), catálogo y decodificador #share=
    │
    ├── config/
    │   ├── state.js                              # Objeto global `cadState` (reactividad del sistema)
    │   ├── catalog.js                            # Catálogo curado de propuestas institucionales preconfiguradas
    │   ├── fonts.js                              # Metadata y rutas locales/CDN de las 7 tipografías
    │   ├── palettes.js                           # Paletas cromáticas institucionales y gestor de presets de color
    │   └── persistence.js                        # Auto-guardado en localStorage y codec base64 para URLs (#share=)
    │
    ├── scene/
    │   ├── sceneManager.js                       # Configuración de escena Three.js, cámara, renderer, bucle y resize
    │   ├── lighting.js                           # Sistema de luces de estudio fotográfico (Key, Fill, Rim, Ambient)
    │   └── environment.js                        # Entorno 3D: Cama PEI 250×250 mm con cuadrícula vs Estante de madera cálida
    │
    ├── cad/
    │   ├── fontLoader.js                         # Carga asíncrona y caché de fuentes OpenType con fallback CDN
    │   ├── glyphConverter.js                     # Conversión de curvas OpenType a `THREE.Shape` / `THREE.ExtrudeGeometry`
    │   ├── geometryBuilders.js                   # Ensambladores de mallas 3D (Cajas biseladas, cuñas, pinzas, puzzle)
    │   ├── logoVectors.js                        # Trazados vectoriales SVG de los escudos USAC y Biblioteca Central
    │   ├── logoBuilder.js                        # Conversión de logos a mallas 3D extruidas y zócalos empotrados
    │   ├── signGenerator.js                      # Motor CAD principal de letreros de mesa / anaquel fijo
    │   └── hangingSignGenerator.js               # Motor CAD para el sistema modular de rótulos colgantes
    │
    ├── exporters/
    │   ├── exportUtils.js                        # Agrupación de mallas por capa de color y descarga de Blobs
    │   ├── threeMfExporter.js                    # Exportador nativo .3MF con soporte multicolor AMS
    │   ├── stlExporter.js                        # Exportador ASCII/Binario de mallas .STL por capas coordinadas
    │   ├── objExporter.js                        # Exportador .OBJ multi-grupo
    │   ├── imageExporter.js                      # Generador de plantillas 1:1 en papel (PNG en fondo blanco con cotas y regla)
    │   └── hangingExporter.js                    # Exportador específico para rótulos colgantes modulares
    │
    └── ui/
        ├── calculator.js                         # Calculadora interactiva de costos de impresión, filamento y ROI
        └── uiController.js                       # Manejador de eventos DOM, acordeones plegables, modales y presets
```

---

## 4. Estado Global de la Aplicación (`js/config/state.js`)

Toda la aplicación sincroniza sus parámetros en el objeto singleton exportado `cadState`:

```javascript
export const cadState = {
    activeWorkspace: 'tabletop', // 'tabletop' (letreros de mesa/anaquel) | 'hanging' (rótulos colgantes)
    style: 'plaque',             // 'plaque' | 'modular' | 'solid' | 'filigree' | 'shelf_clip' | 'wedge' | 'ceiling'
    useMultiColor: true,         // true para exportación AMS multicolor en capas separadas
    wireframe: false,            // Modo alambre para diagnóstico de mallas
    showBedGrid: true,           // Mostrar/ocultar placa de impresión de 250×250 mm
    showShelf: true,             // Mostrar entorno de estantería de madera cálida
    isOverBedSize: false,        // Bandera reactiva si el ancho/alto supera los 250 mm
    hanging: {                   // Configuración exclusiva del espacio de rótulos colgantes
        bracketStyle: 'ornate',  // Brazo de hierro ornamental con punta de flecha
        bracketColor: '#1e242b',
        bracketLengthMm: 220,
        chainColor: '#64748b',
        chainLengthMm: 35,
        plates: [ ... ]          // Array dinámico de placas modulares suspendidas
    }
};
```

---

## 5. Los Dos Espacios de Trabajo (Workspaces)

La aplicación tiene dos áreas de trabajo claramente diferenciadas para no mezclar la lógica de letreros estáticos con sistemas modulares suspendidos:

### Espacio 1: Letreros de Mesa y Anaquel Fijo (`tabletop`)
Manejado por `js/cad/signGenerator.js`. El objeto 3D raíz es `printableRoot`, que contiene tres subgrupos organizados por capas de color:
1. `baseGroup`: Capa 1 (Estructura base, placa, marco, pinza o cuña).
2. `lettersGroup`: Capa 2 (Letras y caracteres de relieve).
3. `accentsGroup`: Capa 3 (Acentos, franjas Dewey, biseles secundarios y escudos vectoriales 3D).

#### Los 7 Estilos Estructurales Disponibles:
1. **`plaque` (Placa Wayfinding):** Rectángulo con esquinas redondeadas ajustables (radio en mm), bisel perimetral y franja Dewey de color en el lateral izquierdo. Admite escudos vectoriales 3D de la USAC y de la Biblioteca empotrados o en altorrelieve. Incluye opción de **partición en 2 mitades tipo puzzle** si supera la cama de 25 cm.
2. **`shelf_clip` (Canto de Anaquel):** Diseñado para colocar en el borde frontal de los estantes de libros. Cuenta con una pinza posterior en 'C' calibrada para baldas estándar de 19 mm de grosor, abrazando la madera sin taladrar ni pegar.
3. **`wedge` (Cuña Ergonómica de Mesa):** Cuerpo prismático inclinado a 12° (o 60°) para colocar sobre escritorios de jefatura o mostradores de atención. Facilita la lectura cenital para personas de pie.
4. **`modular` (Bloques Maker):** Cada letra descansa sobre un bloque cúbico individual biselado con muescas de interconexión.
5. **`solid` (Monolítico):** Bloque sólido uniforme con letras en relieve pronunciado.
6. **`filigree` (Capitular Clásica):** Inspirado en la tipografía editorial histórica universitaria. La primera letra es una capitular monumental dentro de una cartela ornamental, y el resto del texto descansa en un zócalo epigrafiado.
7. **`ceiling` (Colgante de Techo Plano):** Placa suspendida con argollas superiores de anclaje para cables de acero o cáncamos.

### Espacio 2: Rótulos Colgantes Modulares de Anaquel (`hanging`)
Manejado por `js/cad/hangingSignGenerator.js`. El objeto 3D raíz es `hangingRoot` con tres subgrupos principales:
1. `hangingBracketGroup`: Soporte de pared/cabecera de anaquel en **hierro forjado ornamental**, con volutas en 'S' de filigrana, refuerzo en arco y punta de flecha clásica. Admite fijación sin dañar la madera:
   - `mountType: 'adhesive'` (Recomendado): Zapata ancha de 38 mm para cinta doble cara / 3M Command con ranura inferior para la lengüeta elástica de retiro limpio. Cero perforaciones a la madera.
   - `mountType: 'top_hook'`: Gancho de coronación superior de 26 mm de profundidad con pestaña posterior de 18 mm que abraza la moldura superior de la cabecera del anaquel por gravedad. Cero adhesivo y cero tornillos.
   - `mountType: 'screws'`: Montante tradicional con 2 perforaciones avellanadas para tornillos de madera.
2. `hangingChainsGroup`: Eslabones en 'C' desmontables e independientes impresos en 3D para colgar el letrero.
3. `hangingPlatesGroup`: Array de placas modulares (mallas `Placa_<n>_Base`, `Placa_<n>_Marco`, `Placa_<n>_Letra_<k>`).
   - `plateStyle: 'slotted'` (Sistema Tipo Gasolinera): El marco exterior incorpora un canal ranurado con boca de inserción abierta en el extremo derecho. Permite deslizar e intercambiar tablillas de texto en segundos sin desmontar el rótulo ni las cadenas.
   - `plateStyle: 'fixed'`: Marco y fondo fusionados en una sola placa sólida monolítica.

**Modo de Visualización y Verificación en Cama de 25 cm (`cadState.hanging.viewMode`):**
- `'assembled'`: Muestra el letrero vertical montado en el lateral de madera de nogal con moldura real (`hangingMountGroup`).
- `'bed'`: Despieza todas las partes y las acuesta planas en el plano XY (Z=0) para verificar su impresión sin soportes:
  - Selector de vistas de cama (`cadState.hanging.bedPlateView`): `'all'` (despliega 3 camas de impresión de 250×250 mm en fila: Cama 1 Brazo, Cama 2 Placas, Cama 3 Eslabones), `'bracket'`, `'plates'`, `'chains'`.
  - Opción de rotación diagonal 45° (`bracketAngle45`): Rota el brazo de soporte sobre su centro para aprovechar la diagonal de 353 mm de la cama PEI de 250×250 mm, permitiendo imprimir brazos largos de hasta 340 mm en una sola pieza.
  - El .3MF exporta brazo, eslabones acostados en fila listos para imprimir y cada placa en 3 objetos de color (Base, Marco, Letras). Botón **`[+ Añadir Módulo Inferior]`** para añadir hasta 4 módulos en cascada.
  - Presets rápidos de biblioteca incluidos: `SECCIÓN GUATEMALA`, `FOLLETOS & REVISTAS`, `LITERATURA 800`.

---

## 6. Motor CAD y Tratamiento Vectorial de Fuentes (`glyphConverter.js`)

Uno de los problemas técnicos resueltos en este proyecto es el manejo de tildes (Á, É, Í, Ó, Ú, Ñ) y caracteres con huecos cerrados ('B', 'R', 'P', 'O', '4', '8') en Three.js con fuentes TTF/WOFF.

### Cómo funciona la conversión tipográfica:
1. **Extracción de Comandos OpenType:** `fontLoader.js` descarga la fuente y `otFont.getPath(char, 0, 0, size)` genera los comandos vectoriales (`M`, `L`, `Q`, `C`, `Z`).
2. **Construcción de `THREE.ShapePath`:** Se mapean los arcos cuadráticos y cúbicos a curvas de Three.js. Al encontrar un comando `Z`, se cierra el contorno actual.
3. **Detección Rigurosa de Huecos (Holes):** Three.js `ShapeUtils.isClockwise()` puede fallar en fuentes como *Bebas Neue*, *Playfair* o *Montserrat* donde la orientación del devanado de los contornos interiores no es estrictamente CCW. `glyphConverter.js` realiza una prueba de punto en polígono (Ray-casting / Winding test) para asociar inequívocamente cada isla interna a su contorno envolvente principal (`shape.holes.push(holePath)`), garantizando mallas 100% sólidas sin caras invertidas ni artefactos negros.
4. **Extrusión con Bisel (Bevel):** Se generan geometrías mediante `THREE.ExtrudeGeometry` configuradas con `bevelEnabled: true`, `bevelSegments: 3`, evitando la auto-intersección de aristas en esquinas cerradas.

### Mayúsculas/minúsculas y números alineados:
* El texto se usa tal como se escribe (sin `toUpperCase`), para poder poner "Laboratorio No. 2".
* `glyphConverter.js` aplica la variante OpenType `lnum` cuando la fuente la trae (Playfair Display): sus números de estilo antiguo pasan a la altura de las mayúsculas. Baskerville, Cinzel y las demás ya traen números alineados.

### Espaciado de letras con tilde:
`glyphLayoutBounds()` espacia cada letra acentuada (í, ì, ï…) con la caja de su letra base: la tilde puede sobresalir sin empujar a la siguiente. Los rótulos colgantes alinean sus letras a la línea base de la 'H'.

### Desplazamiento fino del texto (`param-text-offset-x/y`) y del subtítulo (`param-sub-offset-x/y`):
El primero mueve título + subtítulo; el segundo se suma y mueve solo las mallas `Subtitulo*`.

Placa lo integra al centrar sus líneas; el resto de estilos lo aplica al final de `rebuildSignCAD` moviendo las mallas `Letra*` y `Subtitulo*` (en la cuña también sube por la rampa; en Bloques/Monolitos solo mueve las letras dentro de su bloque).

### Soporte Multilínea Inteligente:
`signGenerator.js` implementa `splitTextIntoLines(rawText)`:
* Si el texto tiene saltos de línea `\n` (introducidos al presionar Enter en el `textarea`), divide automáticamente las líneas.
* Admite delimitadores manuales como `/` o `|`.
* Calcula el alto acumulado, interlineado y recalcula el centrado horizontal compensando obstáculos como los escudos de la USAC o franjas de color Dewey.

---

## 7. División Automática por Partes y Unión Oculta (`segmentation.js`)

Estilos Placa (`plaque`) y Colgante de Techo (`ceiling`). Toggle `plaque-split-toggle` / `ceiling-split-toggle` = "División automática por partes"; las funciones `createLeft/RightPuzzlePlaque` quedan sin uso.
* **Planificación (`planCuts`)**: programación dinámica sobre posiciones candidatas cada 0.5 mm. Minimiza, en orden: número de partes (`ceil(ancho / maxSegmentWidth(250))`, +300 por parte extra), costo de costura (0 entre palabras, ~15 entre letras, 1000 si atraviesa un relieve) y desbalance de anchos. Obstáculos = cajas X de todas las mallas de `lettersGroup`/`accentsGroup` + argollas de techo. Con división activa, el subtítulo se genera letra por letra.
* **Geometría (`buildSegmentedSlab`)**: cada parte es un contorno con esquinas redondeadas solo en los extremos exteriores. Unión de **cola de milano oculta en la capa trasera**: la parte izquierda lleva lengüetas planas (z 0→jointZ) y la derecha cajeados abiertos por abajo (holgura 0.15 mm); por delante la costura es recta. Se imprime sin soportes y se ensambla bajando cada parte sobre la anterior.
* **Flujo en `rebuildSignCAD`**: el estilo deja `pendingSlab`; `applySlabSegmentation()` corta, crea `*_ParteK` y asigna `mesh.userData.part` a cada relieve; tras centrar, `applySegmentLayout()` aplica la separación explosionada o "una parte por cama" (`setBedLayout` en `environment.js`). `cadState.segmentation = { count, cuts, throughText, widths }`.
* **Exportación**: `exportSegmentParts3MF()` descarga un .3MF por parte, centrado en su cama, con las 3 capas de color.

---

## 8. Sistema de Persistencia y Enlaces Compartibles (`persistence.js`)

El proyecto no depende de base de datos para compartir modelos, lo que permite alojarlo gratuitamente en plataformas estáticas como GitHub Pages o Netlify.

### 1. Auto-Guardado Continuo:
* Cualquier cambio en la interfaz se guarda con debounce (250 ms) en `localStorage` bajo la clave `bibliosign_last_session_config`.
* Al recargar la página, `restoreLastSession()` recupera todos los parámetros exactos (textos, escalas, posiciones, colores y tipografías).

### 2. Presets Nombrados del Usuario:
* Guardados en `localStorage` bajo `bibliosign_saved_user_configs`. Permite listar, cargar, renombrar y borrar diseños favoritos desde el panel izquierdo.

### 3. Enlaces Compartibles URL Hash (`#share=...`):
* `encodeConfigToUrlHash(config)`: Convierte el objeto de configuración a JSON, lo comprime en UTF-8 seguro y lo codifica en Base64 seguro para URL.
* `decodeConfigFromUrlHash(hashOrParam)`: Decodifica el hash `#share=...` o `?cfg=...`.
* **Flujo con Netlify/GitHub:** Cuando el diseñador pulsa *"Compartir con Jefe"*, se genera una URL como:
  ```
  https://tu-sitio.netlify.app/visor.html#share=JTdCJTIybmFtZSUyMiUzQSUyMkxhYm9yYXRvcmlvJTIy...
  ```
  Al abrir esta URL, `visorMain.js` detecta el hash, decodifica la configuración, construye el modelo 3D idéntico y lo fija en la cabecera como **`📌 Propuesta Compartida por el Diseñador`**.

---

## 9. Visor Ejecutivo para Jefatura (`visor.html` y `visorMain.js`)

Diseñado para directores, jefes de departamento y evaluadores externos que no deben interactuar con sliders técnicos.

### Elementos Clave del Visor:
1. **Controles de Cámara Flotantes:**
   * `Frontal`: Cámara ortogonal a 90° para juzgar legibilidad y centrado de texto.
   * `Perspectiva`: Vista 3D isométrica para apreciar biseles y profundidad de capas.
   * `Cenital`: Vista superior plana.
   * `Giro 360° (Turntable)`: Rotación continua suave automática (`controls.autoRotate = true`).
   * `Alternar Entorno`: Cambia entre un estante de biblioteca de madera cálida y la cama cuadriculada de 25 cm².
2. **Lista compacta de propuestas:** solo los diseños marcados con ★ en `public/vitrina.json` (más los guardados en localStorage cuando no es modo vitrina). Sin catálogo de ejemplos ni filtros.
3. **Ficha Técnica Ejecutiva:** Muestra medidas 1:1 calculadas por `THREE.Box3` en tiempo real (mm), material sugerido (PLA/PETG), tipo de montaje y muestras de color en código HEX. Sin botones de descarga (se quitaron a propósito).
4. **Nota de bienvenida (`#pitch-modal`):** pop-up que aparece 1.2 s después de cargar, una vez por sesión (`sessionStorage` `bibliosign_pitch_seen`). Vende la mejora a jefatura (beneficio → esfuerzo → cifras) y cierra con la recomendación destacada en verde con destello (`.pitch-ask`): "Ampliar las horas de mi contrato"; las cifras (horas invertidas, horas/semana, semanas estimadas) salen de `work` en `vitrina.json` (`renderPitchModal()` en `visorMain.js`). "Ver desglose de horas" abre el modal de horas; `Escape` cierra ambos. Animación: `.pitch-ripple` (3 ondas verdes que crecen con `inset` hasta -48px, desfasadas 0.9 s), brillo pulsante en `.pitch-card` y entrada con rebote; se desactiva con `prefers-reduced-motion`.

### Contrato DOM Oculto en `visor.html`:
Para evitar duplicar miles de líneas de matemáticas CAD de `signGenerator.js`, `visor.html` contiene un contenedor invisible `<div id="visor-cad-hidden-inputs" style="display:none">` con los mismos IDs que el diseñador principal (`sign-text`, `param-font`, `param-letter-size`, `color-face`, etc.). `applyConfig(proposal, true)` actualiza estos campos y reutiliza el 100% del motor CAD nativo.

---

## 10. Exportadores (`js/exporters/`)

### 1. `threeMfExporter.js` (Bambu Studio / OrcaSlicer AMS Multicolor):
Empaqueta un archivo `.3MF` nativo en formato ZIP utilizando JSZip:
* Cada capa de color se exporta como un objeto separado con su respectivo `<mesh>` de vértices y triángulos dentro de `3D/3dmodel.model`.
* En Bambu Studio, los componentes aparecen automáticamente desagrupados en la pestaña *Objetos* (*1_Base_Estructura*, *2_Letras_Relieve*, *3_Acentos_Y_Marco*), permitiendo asignar los colores de los rollos AMS con un solo clic sin usar el pincel manual.

### 2. `stlExporter.js`:
Genera tres archivos STL independientes (`STL 1: Base`, `STL 2: Letras`, `STL 3: Acentos`). Todos comparten el mismo punto de origen `(0,0,0)`, por lo que al seleccionarlos y arrastrarlos juntos a cualquier slicer (Cura, PrusaSlicer, Bambu), se alinean automáticamente sin desfasarse.

### 3. `imageExporter.js`:
Crea un renderer offscreen WebGL de 2400 × 1600 px con fondo blanco puro. Superpone sobre un canvas 2D secundario cotas milimétricas, flechas de acotación, marcas de corte y una regla física graduada de 50 mm para que el usuario o directivo verifique la escala con una regla de escritorio tras imprimir la hoja.

---

## 11. Despliegue en GitHub y Netlify

### Repositorio Oficial en GitHub:
* URL: **`https://github.com/amleman/letreros-3d`**
* Rama principal: `main`

### Configuración en `vite.config.js`:
```javascript
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 3000, open: true },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'), // Diseñador técnico
        visor: resolve(__dirname, 'visor.html')  // Visor ejecutivo
      }
    }
  }
});
```

### Configuración de Despliegue en Netlify:
* **Build command:** `npm run build`
* **Publish directory:** `dist`
* **Ruta de acceso Diseñador CAD:** `https://tu-dominio.netlify.app/`
* **Ruta de acceso Visor Ejecutivo:** `https://tu-dominio.netlify.app/visor.html`
* **Ruta con diseño compartido:** `https://tu-dominio.netlify.app/visor.html#share=<base64>`

---

### Vitrina pública para jefatura (lo que realmente se publica en Netlify):
* `netlify.toml` ejecuta `npm run build:vitrina` (`vite build --mode vitrina`): **solo** se compila `visor.html`; el diseñador CAD nunca se publica (y `/index.html` redirige al visor).
* El visor en modo vitrina (`IS_VITRINA_BUILD`, o `visor.html?vitrina` en local como vista previa) muestra **solo** los diseños de `public/vitrina.json`, oculta filtros, enlace al CAD y descarga .3MF.
* `public/vitrina.json` = `{ designs: [...], work: { assignedHoursPerWeek, estimatedProjectHours, entries: [{date, task, hours}] } }`.
* En local, `vite.config.js` expone `GET/PUT /api/vitrina` (solo `npm run dev`) para escribir ese archivo. El diseñador lo edita con la ★ de "Mis Configuraciones Guardadas" (`js/ui/vitrinaPanel.js`) y la "Bitácora de Horas" en la vista *Propuesta Horas*. El visor muestra el botón **Horas de Trabajo** con el modal de horas invertidas vs. asignadas.
* Para publicar cambios: commit + push de `public/vitrina.json`; Netlify recompila solo.

### Exportación 3MF manifold (`threeMfWriter.js`):
* Los dos exportadores 3MF usan `build3MFBlob()`: suelda vértices (1e-4 mm), aplica `matrixWorld` relativo a la raíz y elimina triángulos degenerados/duplicados. Sin esto, la geometría no indexada de Three.js salía con todas las aristas abiertas y Bambu Studio pedía reparar.

---

## 12. Reglas de Desarrollo y Convenciones del Código

Si vas a agregar código, refactorizar o extender funcionalidades en este repositorio, sigue estas pautas obligatorias:
1. **Preservar los 7 estilos estructurales y los 2 espacios de trabajo:** No rompas ni mezcles la lógica de letreros fijos (`tabletop`) con rótulos modulares en cascada (`hanging`).
2. **Compatibilidad UTF-8 Total:** Toda operación tipográfica debe usar `glyphConverter.js` y OpenType.js. Nunca utilices geometrías de texto basadas en fuentes viejas de Three.js tipo `typeface.json`, ya que destruyen los acentos del español (Á, É, Í, Ó, Ú, Ñ).
3. **No eliminar IDs del DOM en `index.html` ni `visor.html`:** Las funciones de `persistence.js` y los exportadores dependen de IDs consistentes (`param-letter-size`, `param-font`, `color-face`, etc.).
4. **Verificación de cama de 25 cm:** Si agregas nuevos estilos o accesorios, asegúrate de invocar `updateBedAlertStatus` para que el usuario sepa si su pieza cabe o excede la cama estándar de 250 mm.
5. **Multi-page en Vite:** Toda nueva página HTML que se agregue debe registrarse en `vite.config.js` bajo `rollupOptions.input` para que se incluya en el directorio `dist/` al compilar.
6. **Catálogo de Anaqueles de Biblioteca (Próxima Fase):** Se documentaron las 4 tipologías de estanterías (Madera con moldura, Triplay liso sin moldura, Metálico de ángulo ranurado con orificios de fábrica, e Híbrido metal + MDF). Los mecanismos de fijación 100% no invasivos planeados son: Zapata adhesiva 3M, Clip caballete en 'U' para canto de triplay (15-18 mm), y Pines pasadores Snap-Pin 3D / Base magnética para orificios de estantería metálica. Ver plan detallado en el artefacto `plan_soporte_universal_anaqueles.md`.
