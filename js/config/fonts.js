/**
 * Catálogo de Tipografías Institucionales, Arquitectónicas y Académicas
 * (.TTF / .WOFF local estático de alta fidelidad + Espejos CDN Fontsource/GStatic)
 */
export const institutionalFonts = {
    arial: {
        name: 'Arial Bold',
        urls: [
            './fonts/arialbd.ttf',
            '/fonts/arialbd.ttf',
            'https://fonts.gstatic.com/s/arimo/v28/P5sfzZCDf9_T_3IVwcLGW98Et6qPe5k.ttf',
            'https://cdn.jsdelivr.net/npm/@fontsource/arimo@5.0.8/files/arimo-latin-700-normal.woff'
        ],
        cssFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
        desc: 'Estándar institucional universal. Trazos neutros de máxima legibilidad y números limpios y equilibrados.'
    },
    montserrat: {
        name: 'Montserrat Bold',
        urls: [
            './fonts/montserrat-700.woff',
            '/fonts/montserrat-700.woff',
            'https://cdn.jsdelivr.net/npm/@fontsource/montserrat@5.0.8/files/montserrat-latin-700-normal.woff',
            'https://fonts.gstatic.com/s/montserrat/v26/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCuM73w5aX8.ttf'
        ],
        cssFamily: '"Montserrat", sans-serif',
        desc: 'Trazo geométrico de alta precisión arquitectónica. Moderna, sobria y de excelente lectura a distancia.'
    },
    cinzel: {
        name: 'Cinzel Bold',
        urls: [
            './fonts/cinzel-700.woff',
            '/fonts/cinzel-700.woff',
            'https://cdn.jsdelivr.net/npm/@fontsource/cinzel@5.0.8/files/cinzel-latin-700-normal.woff',
            'https://fonts.gstatic.com/s/cinzel/v23/8vIU7ww63mVu7gtR-kwKxNvkNOjw-jHgfY3lCA.ttf'
        ],
        cssFamily: '"Cinzel", serif',
        desc: 'Inspirada en inscripciones romanas clásicas y fachadas universitarias. Máxima solemnidad institucional.'
    },
    baskerville: {
        name: 'Libre Baskerville Bold',
        urls: [
            './fonts/baskerville-700.woff',
            '/fonts/baskerville-700.woff',
            'https://cdn.jsdelivr.net/npm/@fontsource/libre-baskerville@5.0.8/files/libre-baskerville-latin-700-normal.woff'
        ],
        cssFamily: '"Libre Baskerville", serif',
        desc: 'Serif editorial académica por excelencia. Transmite prestigio literario, seriedad y calidez.'
    },
    oswald: {
        name: 'Oswald Bold',
        urls: [
            './fonts/oswald-700.woff',
            '/fonts/oswald-700.woff',
            'https://cdn.jsdelivr.net/npm/@fontsource/oswald@5.0.8/files/oswald-latin-700-normal.woff',
            'https://fonts.gstatic.com/s/oswald/v53/TK3_WkUHHAIjg75cFRf3bXL8LICs1xZosUZiYA.ttf'
        ],
        cssFamily: '"Oswald", sans-serif',
        desc: 'Tipografía técnica condensada tipo norma DIN. Permite palabras largas en estanterías con gran impacto.'
    },
    playfair: {
        name: 'Playfair Display Bold',
        urls: [
            './fonts/playfair-700.woff',
            '/fonts/playfair-700.woff',
            'https://cdn.jsdelivr.net/npm/@fontsource/playfair-display@5.0.8/files/playfair-display-latin-700-normal.woff'
        ],
        cssFamily: '"Playfair Display", serif',
        desc: 'Alta imprenta clásica europea. Ideal para letras capitulares, salas históricas y colecciones especiales.'
    },
    bebasneue: {
        name: 'Bebas Neue Regular',
        urls: [
            './fonts/bebasneue.ttf',
            '/fonts/bebasneue.ttf',
            './fonts/BebasNeue-Regular.ttf',
            '/fonts/BebasNeue-Regular.ttf',
            'https://cdn.jsdelivr.net/npm/@fontsource/bebas-neue@5.0.8/files/bebas-neue-latin-400-normal.woff'
        ],
        cssFamily: '"Bebas Neue", sans-serif',
        desc: 'Tipografía display condensada de gran impacto visual. Ideal para señalética alta y rótulos de pasillo.'
    }
};
