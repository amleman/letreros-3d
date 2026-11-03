# 📚 BiblioSign 3D CAD & Bambu Studio Exporter

Generador paramétrico de señalética institucional 3D para bibliotecas con soporte completo para tildes y eñes (UTF-8), previsualización en tiempo real, exportación directa a archivos **.3MF Multi-Pieza** (multicolor en Bambu Studio / OrcaSlicer), **.STL** separados por capa de color, y **Visor Ejecutivo para Jefatura (`visor.html`)** para presentación y aprobación sin controles técnicos.

---

## 🌟 Principales Módulos y Funcionalidades

### 1. 👁️ Visor Ejecutivo para Jefatura (`visor.html`)
Página de presentación ejecutiva independiente lista para compartir con jefes de departamento, coordinadores o directores:
* **Entorno Limpio de Solo Lectura:** Oculta sliders, paneles y parámetros CAD complejos.
* **Catálogo de Propuestas Institucionales:** Modelos curados listos para revisión (*Laboratorio Central con Escudos USAC*, *Colección Nacional Sección Guatemala*, *Hemeroteca Dewey*, *Canto de Anaquel*, *Cuña de Jefatura*, *Colgante Modular*, etc.).
* **Controles de Cámara y Exhibición:** Ángulos Frontal (90° ortogonal), Perspectiva 3D, Cenital, modo Turntable 360° continuo y alternancia de fondo (Estante de roble vs. Cama de 25 cm).
* **Ficha Técnica 1:1:** Especificaciones de medidas físicas, material recomendado, tipo de anclaje/montaje y paleta cromática.
* **Descarga de Plantilla para Papel 1:1 (PNG):** Descarga a escala real con marcas de corte y regla de calibración para probar físicamente en los estantes antes de imprimir en 3D.
* **Compartición por Enlace (`#share=...`):** Comparte cualquier diseño personalizado directamente en la URL sin requerir base de datos.

### 2. 🖨️ Cama de Impresión Calibrada a 25 cm² (250 × 250 mm)
* Lámina texturizada tipo PEI con cuadrícula milimétrica (10 mm y líneas maestras cada 50 mm / 5 cm).
* Alerta visual cuando un diseño supera los 25 cm y botón de auto-ajuste proporcional.
* Sistema de división en 2 partes con **ensamble tipo rompecabezas (puzzle)** para imprimir rótulos de más de 25 cm sin pegamento.

### 3. ✍️ Tipografías Institucionales con Tildes Reales (UTF-8)
* Soporte nativo para glifos en español (Á, É, Í, Ó, Ú, Ñ):
  * **Bebas Neue** (Institucional condensada para rótulos)
  * **Arial Bold** (Universal de máxima legibilidad)
  * **Montserrat Bold** (Moderna geométrica)
  * **Cinzel Bold** (Monumental e inscripciones clásicas)
  * **Oswald Bold** (Condensada técnica)
  * **Playfair Display Bold** (Elegante editorial)
  * **Libre Baskerville Bold** (Tradicional humanista)
* Soporte multilínea (pulsando Enter en el textarea o separando con `/`).
* Desplazamiento manual fino en X e Y para centrado exacto con respecto a logotipos y marcos.

### 4. 🏛️ Diseños Estructurales Arquitectónicos
* **Bloques MAKER:** Letras individuales interconectadas por base sólida.
* **Placa Wayfinding:** Esquinas redondeadas, biseles y franja cromática Dewey con escudos USAC / Biblioteca Central.
* **Canto de Anaquel (Pinza 19 mm):** Cenefa con gancho en C posterior que abraza la balda sin perforaciones.
* **Cuña Inclinada (12° / 60°):** Prisma inclinado para lectura ergonómica de sobremesa o mostradores de atención.
* **Rótulo Colgante Modular:** Brazo de hierro forjado con placas modulares suspendidas por eslabones desmontables.
* **Capitular Clásica:** Marco arquitectónico con letra capitular esculpida.

---

## 🏗️ Estructura del Proyecto

```text
Letreros 3D/
├── index.html                           # Diseñador CAD interactivo completo
├── visor.html                           # Visor ejecutivo de presentación para jefatura
├── package.json                         # Dependencias (Vite, Three.js)
├── vite.config.js                       # Configuración multi-página (index + visor)
├── README.md                            # Documentación general
├── css/
│   └── styles.css                       # Estilos globales y personalización UI
├── fonts/                               # Archivos .TTF y .WOFF locales
├── public/fonts/                        # Fuentes estáticas para distribución
└── js/
    ├── main.js                          # Orquestador del diseñador
    ├── viewer/
    │   └── visorMain.js                 # Controlador del visor ejecutivo y decodificador #share=
    ├── config/
    │   ├── catalog.js                   # Catálogo institucional curado
    │   ├── fonts.js                     # Configuración de tipografías UTF-8
    │   ├── palettes.js                  # Paletas institucionales
    │   ├── persistence.js               # Auto-guardado y generador de URL hash
    │   └── state.js                     # Estado global de la aplicación
    ├── cad/
    │   ├── fontLoader.js                # Cargador OpenType / WOFF
    │   ├── geometryBuilders.js          # Mallas 3D (rompecabezas, cuña, pinza, marcos)
    │   ├── glyphConverter.js            # Extrusión 3D de caracteres
    │   ├── hangingSignGenerator.js      # Generador del rótulo colgante modular
    │   ├── logoBuilder.js               # Escudos vectoriales USAC y Biblioteca 3D
    │   ├── logoVectors.js               # Rutas SVG de logotipos
    │   └── signGenerator.js             # Generador de letreros de mesa
    ├── exporters/
    │   ├── exportUtils.js               # Utilerías de descarga y nombres seguros
    │   ├── imageExporter.js             # Generador de plantillas 1:1 en papel (PNG)
    │   ├── stlExporter.js               # Exportador STL por capas
    │   └── threeMfExporter.js           # Exportador nativo .3MF multi-objeto
    └── ui/
        ├── calculator.js                # Calculadora de costos y tiempo
        └── uiController.js              # Controlador UI del diseñador
```

---

## 🚀 Despliegue en GitHub y Netlify

El proyecto cuenta con una configuración multi-página en Vite lista para compilar:

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo local
npm run dev

# Compilar para producción (genera dist/index.html y dist/visor.html)
npm run build
```

### Configuración en Netlify:
* **Build command:** `npm run build`
* **Publish directory:** `dist`

### Rutas resultantes en producción:
* **Diseñador CAD:** `https://tu-sitio.netlify.app/`
* **Visor para Jefatura:** `https://tu-sitio.netlify.app/visor.html`
* **Enlace con diseño pre-cargado:** `https://tu-sitio.netlify.app/visor.html#share=<codigo>`
