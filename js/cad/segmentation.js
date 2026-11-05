import * as THREE from 'three';

/**
 * DIVISIÓN AUTOMÁTICA POR PARTES PARA CAMAS DE 25 cm (Bambu Lab X1 Carbon)
 *
 * 1. planCuts(): decide cuántas partes hacen falta y DÓNDE cortar (optimización por programación dinámica).
 *    Los cortes caen entre palabras o entre letras para que ningún relieve quede "volando" sobre una
 *    costura, con partes de ancho parejo. Si 2 partes no alcanzan, usa 3, 4… las que hagan falta.
 *
 * 2. buildSegmentedSlab(): genera cada parte de la placa con una UNIÓN DE COLA DE MILANO OCULTA:
 *    - Por delante la costura es una línea recta (casi invisible).
 *    - Las colas de milano viven solo en la capa trasera (la que apoya en la cama / la pared):
 *      la parte izquierda lleva lengüetas planas sobre la cama y la derecha los cajeados abiertos por abajo.
 *    - Se imprime sin soportes (el techo del cajeado es un puente corto) y se ensambla bajando la pieza
 *      derecha sobre las lengüetas: queda trabada de lado y de arriba/abajo, sin pegamento.
 */

export const JOINT = {
    edgeMargin: 5,      // mm libres a cada lado de la cama
    tabLength: 7,       // lo que sobresale la cola de milano más allá del corte
    neckWidth: 9,       // ancho de la cola en la línea de corte
    tipWidth: 13,       // ancho en la punta (más ancho = traba lateral)
    clearance: 0.15,    // holgura por lado: ajuste a presión firme en X1 Carbon
    overlap: 0.3,       // solape interno entre cuerpos para que el sólido salga continuo
    seamMargin: 2.5,    // distancia mínima entre un corte y cualquier letra o relieve
    minPartWidth: 40
};

/**
 * Ancho máximo de cada segmento (sin contar la lengüeta) para que la parte quepa en la cama
 */
export function maxSegmentWidth(bedMm) {
    return bedMm - 2 * JOINT.edgeMargin - JOINT.tabLength;
}

function mergeIntervals(intervals) {
    const sorted = intervals.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
    const out = [];
    sorted.forEach(([a, b]) => {
        const last = out[out.length - 1];
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else out.push([a, b]);
    });
    return out;
}

// Costos del optimizador de cortes (más bajo = mejor)
const COST = {
    extraPart: 300,      // una parte más que el mínimo
    betweenLetters: 15,  // corte en el hueco angosto entre dos letras de una palabra
    throughRelief: 1000, // corte que atraviesa una letra o escudo (último recurso)
    balance: 0.02        // penaliza partes de anchos muy distintos (por mm²)
};

/**
 * Calcula las posiciones X de corte con programación dinámica.
 * Prioridades: 1) el mínimo de partes, 2) cortar en espacios entre palabras, luego entre letras,
 * y solo como último recurso atravesar un relieve (antes prefiere usar una parte más), 3) partes parejas.
 * @param {object} p
 * @param {number} p.minX, p.maxX   Extensión de la placa
 * @param {Array<[number, number]>} p.obstacles  Intervalos X ocupados por letras, escudos, subtítulo…
 * @param {number} p.maxPartW
 * @returns {{cuts: number[], throughText: boolean}}
 */
export function planCuts({ minX, maxX, obstacles, maxPartW, minPartW = JOINT.minPartWidth }) {
    const width = maxX - minX;
    if (width <= maxPartW) return { cuts: [], throughText: false };

    const blocked = mergeIntervals(obstacles);
    const seamCost = x => {
        let nearest = Infinity;
        for (const [a, b] of blocked) {
            if (x > a && x < b) return COST.throughRelief;
            nearest = Math.min(nearest, Math.abs(x - a), Math.abs(x - b));
        }
        if (nearest >= JOINT.seamMargin) return 0;
        return COST.betweenLetters * (1.5 - nearest / JOINT.seamMargin);
    };

    // Posiciones candidatas cada 0.5 mm (más los centros exactos de los huecos entre relieves)
    const candidates = [];
    for (let x = minX + minPartW; x <= maxX - minPartW; x += 0.5) candidates.push(x);
    for (let i = 0; i < blocked.length - 1; i++) {
        const mid = (blocked[i][1] + blocked[i + 1][0]) / 2;
        if (mid > minX + minPartW && mid < maxX - minPartW) candidates.push(mid);
    }
    candidates.sort((a, b) => a - b);
    const pts = [minX, ...candidates, maxX];
    const costs = pts.map((x, i) => (i === 0 || i === pts.length - 1 ? 0 : seamCost(x)));

    const minParts = Math.ceil(width / maxPartW);
    let best = null;

    for (let n = minParts; n <= minParts + 3; n++) {
        const ideal = width / n;
        // dp[j][i]: costo mínimo de cubrir [minX, pts[i]] con j partes
        const dp = Array.from({ length: n + 1 }, () => new Float64Array(pts.length).fill(Infinity));
        const from = Array.from({ length: n + 1 }, () => new Int32Array(pts.length).fill(-1));
        dp[0][0] = 0;

        for (let j = 1; j <= n; j++) {
            for (let i = 1; i < pts.length; i++) {
                if (j < n && i === pts.length - 1) continue;
                let lo = i - 1;
                while (lo >= 0 && pts[i] - pts[lo] <= maxPartW) lo--;
                for (let k = lo + 1; k < i; k++) {
                    const w = pts[i] - pts[k];
                    if (w < minPartW || dp[j - 1][k] === Infinity) continue;
                    const c = dp[j - 1][k] + costs[i] + COST.balance * (w - ideal) ** 2;
                    if (c < dp[j][i]) {
                        dp[j][i] = c;
                        from[j][i] = k;
                    }
                }
            }
        }

        const total = dp[n][pts.length - 1];
        if (total === Infinity) continue;
        const score = total + (n - minParts) * COST.extraPart;
        if (!best || score < best.score) {
            const cuts = [];
            let i = pts.length - 1;
            for (let j = n; j > 1; j--) {
                i = from[j][i];
                cuts.unshift(pts[i]);
            }
            best = { score, cuts };
        }
    }

    if (!best) return { cuts: [], throughText: true };
    return {
        cuts: best.cuts,
        throughText: best.cuts.some(x => seamCost(x) >= COST.throughRelief)
    };
}

/**
 * Contorno de una parte con esquinas redondeadas solo en los extremos exteriores
 * y (opcional) cajeados de cola de milano abiertos en el borde izquierdo.
 */
function partOutline(x0, x1, hh, r, roundLeft, roundRight, notchYs, c = JOINT.clearance) {
    const { tabLength: L, neckWidth: wN, tipWidth: wT } = JOINT;
    const rl = roundLeft ? r : 0;
    const rr = roundRight ? r : 0;
    const s = new THREE.Shape();

    s.moveTo(x0 + rl, -hh);
    s.lineTo(x1 - rr, -hh);
    if (rr) s.absarc(x1 - rr, -hh + rr, rr, -Math.PI / 2, 0, false);
    s.lineTo(x1, hh - rr);
    if (rr) s.absarc(x1 - rr, hh - rr, rr, 0, Math.PI / 2, false);
    s.lineTo(x0 + rl, hh);
    if (rl) s.absarc(x0 + rl, hh - rl, rl, Math.PI / 2, Math.PI, false);

    // Borde izquierdo de arriba hacia abajo, con los cajeados (más anchos adentro que en la boca)
    [...notchYs].sort((a, b) => b - a).forEach(yc => {
        s.lineTo(x0, yc + wN / 2 + c);
        s.lineTo(x0 + L + c, yc + wT / 2 + c);
        s.lineTo(x0 + L + c, yc - wT / 2 - c);
        s.lineTo(x0, yc - wN / 2 - c);
    });

    s.lineTo(x0, -hh + rl);
    if (rl) s.absarc(x0 + rl, -hh + rl, rl, Math.PI, Math.PI * 1.5, false);
    s.closePath();
    return s;
}

function tabShape(x1, yc) {
    const { tabLength: L, neckWidth: wN, tipWidth: wT, overlap } = JOINT;
    const s = new THREE.Shape();
    s.moveTo(x1 - overlap * 2, yc - wN / 2);
    s.lineTo(x1, yc - wN / 2);
    s.lineTo(x1 + L, yc - wT / 2);
    s.lineTo(x1 + L, yc + wT / 2);
    s.lineTo(x1, yc + wN / 2);
    s.lineTo(x1 - overlap * 2, yc + wN / 2);
    s.closePath();
    return s;
}

/**
 * Alturas Y de las colas de milano en una costura (lejos de las esquinas)
 */
export function jointPositions(height) {
    const hh = height / 2;
    const keep = Math.max(10, JOINT.tipWidth / 2 + 6);
    const usable = height - 2 * keep;
    if (usable < 30) return [0];
    const count = Math.max(2, Math.floor(usable / 45) + 1);
    return Array.from({ length: count }, (_, i) => -hh + keep + (usable * i) / (count - 1));
}

function extrude(shape, depth, z0) {
    const g = new THREE.ExtrudeGeometry(shape, { steps: 1, depth, bevelEnabled: false, curveSegments: 16 });
    g.translate(0, 0, z0);
    return g;
}

/**
 * Genera las geometrías de cada parte de una placa rectangular (centrada en Y = 0).
 * @returns {Array<{geos: THREE.BufferGeometry[], x0: number, x1: number}>}
 */
export function buildSegmentedSlab({ minX, maxX, height, depth, radius, cuts, clearance = JOINT.clearance }) {
    const hh = height / 2;
    const edges = [minX, ...cuts, maxX];
    const parts = [];
    const r = Math.max(0.5, Math.min(radius, hh - 0.5));
    const jointZ = Math.max(1.2, Math.min(depth * 0.45, depth - 1.8));
    const pocketTop = jointZ + clearance;
    const joints = jointPositions(height);

    for (let k = 0; k < edges.length - 1; k++) {
        const x0 = edges[k];
        const x1 = edges[k + 1];
        const isFirst = k === 0;
        const isLast = k === edges.length - 2;
        const geos = [];
        const rr = Math.min(r, (x1 - x0) / 2 - 0.5);

        if (isFirst) {
            geos.push(extrude(partOutline(x0, x1, hh, rr, true, isLast, []), depth, 0));
        } else {
            // Capa trasera con cajeados abiertos por abajo + cuerpo superior completo (cara frontal lisa)
            // La capa trasera sube `overlap` dentro del cuerpo superior; donde está el cajeado no hay capa,
            // así que el techo del cajeado queda exactamente en pocketTop (sin invadir la holgura).
            geos.push(extrude(partOutline(x0, x1, hh, rr, false, isLast, joints, clearance), pocketTop + JOINT.overlap, 0));
            geos.push(extrude(partOutline(x0, x1, hh, rr, false, isLast, []), depth - pocketTop, pocketTop));
        }

        // Lengüetas de cola de milano planas sobre la cama, hacia la parte siguiente
        if (!isLast) {
            joints.forEach(yc => geos.push(extrude(tabShape(x1, yc), jointZ, 0)));
        }

        parts.push({ geos, x0, x1 });
    }
    return parts;
}

/**
 * PIEZAS DE PRUEBA DE ENSAMBLE (sin letras)
 * Un par macho/hembra corto por cada holgura, separados para imprimir en una sola cama de 25 cm.
 * Cada par lleva 1, 2, 3… puntos en relieve en la cara frontal para identificar su holgura.
 * @returns {Array<{name: string, geos: THREE.BufferGeometry[]}>}
 */
export function buildJointTestCoupons({ height = 70, depth = 6, radius = 8, clearances = [0.10, 0.15, 0.20] } = {}) {
    const h = Math.min(height, 70);
    const segW = 30;          // ancho de cada trozo de placa
    const pairGap = 14;       // separación entre macho y hembra en la cama (no se imprimen unidos)
    const rowGap = 10;
    const pieces = [];

    clearances.forEach((clr, i) => {
        const rowY = (i - (clearances.length - 1) / 2) * (h + rowGap);
        const [male, female] = buildSegmentedSlab({
            minX: 0, maxX: segW * 2, height: h, depth, radius, cuts: [segW], clearance: clr
        });

        const dots = [];
        for (let d = 0; d <= i; d++) {
            const dot = new THREE.CylinderGeometry(1.8, 1.8, 0.8, 20);
            dot.rotateX(Math.PI / 2);
            dot.translate(0, h / 2 - 8 - d * 6, depth + 0.4 - 0.05);
            dots.push(dot);
        }
        // Puntos identificadores sobre la cara frontal, centrados en cada trozo
        const dotsAt = cx => dots.map(g => g.clone().translate(cx, rowY, 0));

        // Macho a la izquierda, hembra separada `pairGap` a la derecha; todo centrado en X = 0
        const totalW = segW * 2 + JOINT.tabLength + pairGap;
        const shiftMale = -totalW / 2;
        const shiftFemale = -totalW / 2 + JOINT.tabLength + pairGap;
        male.geos.forEach(g => g.translate(shiftMale, rowY, 0));
        female.geos.forEach(g => g.translate(shiftFemale, rowY, 0));

        const label = clr.toFixed(2).replace('.', '_');
        pieces.push({ name: `Prueba_Holgura_${label}mm_Macho`, geos: [...male.geos, ...dotsAt(shiftMale + segW / 2)] });
        pieces.push({ name: `Prueba_Holgura_${label}mm_Hembra`, geos: [...female.geos, ...dotsAt(shiftFemale + segW * 1.5)] });
    });
    return pieces;
}
