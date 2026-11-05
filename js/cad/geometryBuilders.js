import * as THREE from 'three';

/**
 * Corrige el orden de los vértices tras invertir el eje Y para asegurar que la malla sea 100% Manifold (sólida)
 */
export function flipGeometryWindingOrder(geometry) {
    const index = geometry.index;
    if (index) {
        const arr = index.array;
        for (let i = 0; i < arr.length; i += 3) {
            const tmp = arr[i + 1];
            arr[i + 1] = arr[i + 2];
            arr[i + 2] = tmp;
        }
        index.needsUpdate = true;
    } else {
        const pos = geometry.attributes.position;
        if (pos) {
            const arr = pos.array;
            for (let i = 0; i < arr.length; i += 9) {
                for (let k = 0; k < 3; k++) {
                    const tmp = arr[i + 3 + k];
                    arr[i + 3 + k] = arr[i + 6 + k];
                    arr[i + 6 + k] = tmp;
                }
            }
            pos.needsUpdate = true;
        }
    }
    geometry.computeVertexNormals();
}

/**
 * Cajas sólidas con bisel (chamfer) limpias para bases, bloques y placas
 */
export function createChamferedBoxGeometry(w, h, d, chamfer = 1.4) {
    const shape = new THREE.Shape();
    const hw = w / 2;
    const hh = h / 2;
    const c = Math.min(chamfer, hw * 0.3, hh * 0.3);

    shape.moveTo(-hw + c, -hh);
    shape.lineTo(hw - c, -hh);
    shape.lineTo(hw, -hh + c);
    shape.lineTo(hw, hh - c);
    shape.lineTo(hw - c, hh);
    shape.lineTo(-hw + c, hh);
    shape.lineTo(-hw, hh - c);
    shape.lineTo(-hw, -hh + c);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
        steps: 1,
        depth: d,
        bevelEnabled: false
    });
}

/**
 * Cajas sólidas con esquinas perfectamente redondeadas (fillet continuo) para placas institucionales
 */
export function createRoundedBoxGeometry(w, h, d, radius = 10) {
    const shape = new THREE.Shape();
    const hw = w / 2;
    const hh = h / 2;
    const r = Math.max(0.5, Math.min(radius, hw - 0.5, hh - 0.5));

    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(hw, hh - r);
    shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-hw + r, hh);
    shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-hw, -hh + r);
    shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);

    const geo = new THREE.ExtrudeGeometry(shape, {
        steps: 1,
        depth: d,
        bevelEnabled: false,
        curveSegments: 16
    });
    geo.computeVertexNormals();
    return geo;
}

/**
 * Mitad izquierda de placa con conector macho de rompecabezas integrado para ensamble sin pegamento
 */
export function createLeftPuzzlePlaque(w, h, d, radius = 10, tabWidth = 24, tabDepth = 14, tabNeck = 14, cutOffsetX = 0) {
    const hw = w / 2;
    const hh = h / 2;
    const r = Math.max(0.5, Math.min(radius, hw * 0.4, hh * 0.4));
    const cx = cutOffsetX;

    const tabCount = h >= 85 ? 2 : 1;
    const tabYPositions = tabCount === 1 ? [0] : [-h * 0.22, h * 0.22];

    const shape = new THREE.Shape();
    shape.moveTo(-hw + r, -hh);
    shape.lineTo(cx, -hh);

    const neckHalf = tabNeck / 2;
    const headHalf = tabWidth / 2;
    const depth = tabDepth;

    tabYPositions.forEach(y0 => {
        shape.lineTo(cx, y0 - headHalf - 4);
        shape.lineTo(cx, y0 - neckHalf);

        shape.bezierCurveTo(
            cx + depth * 0.2, y0 - neckHalf,
            cx + depth * 0.4, y0 - headHalf,
            cx + depth * 0.8, y0 - headHalf
        );
        shape.bezierCurveTo(
            cx + depth * 1.05, y0 - headHalf * 0.6,
            cx + depth * 1.05, y0 + headHalf * 0.6,
            cx + depth * 0.8, y0 + headHalf
        );
        shape.bezierCurveTo(
            cx + depth * 0.4, y0 + headHalf,
            cx + depth * 0.2, y0 + neckHalf,
            cx, y0 + neckHalf
        );
    });

    shape.lineTo(cx, hh);
    shape.lineTo(-hw + r, hh);
    shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-hw, -hh + r);
    shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);

    const geo = new THREE.ExtrudeGeometry(shape, {
        steps: 1,
        depth: d,
        bevelEnabled: false,
        curveSegments: 16
    });
    geo.computeVertexNormals();
    return geo;
}

/**
 * Mitad derecha de placa con cavidad hembra de rompecabezas (tolerancia mecánica 0.28 mm para ensamble a presión)
 */
export function createRightPuzzlePlaque(w, h, d, radius = 10, tabWidth = 24, tabDepth = 14, tabNeck = 14, cutOffsetX = 0, tol = 0.28) {
    const hw = w / 2;
    const hh = h / 2;
    const r = Math.max(0.5, Math.min(radius, hw * 0.4, hh * 0.4));
    const cx = cutOffsetX;

    const tabCount = h >= 85 ? 2 : 1;
    const tabYPositions = tabCount === 1 ? [0] : [h * 0.22, -h * 0.22];

    const shape = new THREE.Shape();
    // Borde inferior hacia la derecha
    shape.moveTo(cx + tol, -hh);
    shape.lineTo(hw - r, -hh);
    // Esquina inferior derecha
    shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
    // Borde derecho hacia arriba
    shape.lineTo(hw, hh - r);
    // Esquina superior derecha
    shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
    // Borde superior hacia la izquierda hasta la línea de corte
    shape.lineTo(cx + tol, hh);

    const neckHalf = (tabNeck / 2) + tol;
    const headHalf = (tabWidth / 2) + tol;
    const depth = tabDepth + tol;

    // Descender por la línea de corte tallando la cavidad hembra hacia +X
    tabYPositions.forEach(y0 => {
        shape.lineTo(cx + tol, y0 + headHalf + 4);
        shape.lineTo(cx + tol, y0 + neckHalf);

        shape.bezierCurveTo(
            cx + tol + depth * 0.2, y0 + neckHalf,
            cx + tol + depth * 0.4, y0 + headHalf,
            cx + tol + depth * 0.8, y0 + headHalf
        );
        shape.bezierCurveTo(
            cx + tol + depth * 1.05, y0 + headHalf * 0.6,
            cx + tol + depth * 1.05, y0 - headHalf * 0.6,
            cx + tol + depth * 0.8, y0 - headHalf
        );
        shape.bezierCurveTo(
            cx + tol + depth * 0.4, y0 - headHalf,
            cx + tol + depth * 0.2, y0 - neckHalf,
            cx + tol, y0 - neckHalf
        );
    });

    shape.lineTo(cx + tol, -hh);

    const geo = new THREE.ExtrudeGeometry(shape, {
        steps: 1,
        depth: d,
        bevelEnabled: false,
        curveSegments: 16
    });
    geo.computeVertexNormals();
    return geo;
}

/**
 * Genera un rosetón floral clásico tallado de 8 pétalos con botón central para esquinas y frontones
 */
function createFloralRosetteGeometry(outerR = 4.6, depth = 2.2, petals = 8) {
    const petalShape = new THREE.Shape();
    const steps = petals * 12;
    const baseR = outerR * 0.68;
    const amp = outerR * 0.32;

    for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const r = baseR + amp * Math.abs(Math.cos((petals / 2) * theta));
        const x = Math.cos(theta) * r;
        const y = Math.sin(theta) * r;
        if (i === 0) petalShape.moveTo(x, y);
        else petalShape.lineTo(x, y);
    }
    petalShape.closePath();

    const petalsGeo = new THREE.ExtrudeGeometry(petalShape, {
        steps: 1,
        depth: depth * 0.65,
        bevelEnabled: true,
        bevelThickness: 0.35,
        bevelSize: 0.25,
        bevelSegments: 2
    });

    const buttonShape = new THREE.Shape();
    buttonShape.absarc(0, 0, outerR * 0.36, 0, Math.PI * 2, false);
    const buttonGeo = new THREE.ExtrudeGeometry(buttonShape, {
        steps: 1,
        depth: depth,
        bevelEnabled: true,
        bevelThickness: 0.4,
        bevelSize: 0.3,
        bevelSegments: 2
    });

    return mergeGeometriesManually([petalsGeo, buttonGeo]);
}

/**
 * ESTILO 2 REDISEÑADO: CORPÓREO ABC (Escudo Monolítico Individual + Pedestal Escalonado)
 * Crea un bloque arquitectónico octogonal/arqueado detrás de cada letra con collarín biselado en color acento.
 */
export function createSolidMonolithBlock(w, h, baseDepth, accentDepth = 1.6) {
    const hw = w / 2;
    const hh = h / 2;
    const topArchR = Math.min(hw * 0.45, hh * 0.35, 9);
    const botChamfer = Math.min(hw * 0.22, 4);

    // 1. Silueta base tipo escudo arquitectónico (base recta para asentar en peana y hombros arqueados arriba)
    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(-hw + botChamfer, -hh);
    shieldShape.lineTo(hw - botChamfer, -hh);
    shieldShape.lineTo(hw, -hh + botChamfer);
    shieldShape.lineTo(hw, hh - topArchR);
    shieldShape.absarc(hw - topArchR, hh - topArchR, topArchR, 0, Math.PI / 2, false);
    shieldShape.lineTo(-hw + topArchR, hh);
    shieldShape.absarc(-hw + topArchR, hh - topArchR, topArchR, Math.PI / 2, Math.PI, false);
    shieldShape.lineTo(-hw, -hh + botChamfer);
    shieldShape.closePath();

    const baseGeo = new THREE.ExtrudeGeometry(shieldShape, {
        steps: 1,
        depth: baseDepth,
        bevelEnabled: true,
        bevelThickness: 0.8,
        bevelSize: 0.6,
        bevelSegments: 2,
        curveSegments: 14
    });

    // 2. Collarín / bisel interior en relieve (Acento) que enmarca la letra corpórea
    const inset = 2.2;
    const frameT = 1.8;
    const fhw = Math.max(4, hw - inset);
    const fhh = Math.max(6, hh - inset);
    const fArch = Math.max(1.5, topArchR - inset * 0.6);

    const frameOuter = new THREE.Shape();
    frameOuter.moveTo(-fhw + 2, -fhh);
    frameOuter.lineTo(fhw - 2, -fhh);
    frameOuter.lineTo(fhw, -fhh + 2);
    frameOuter.lineTo(fhw, fhh - fArch);
    frameOuter.absarc(fhw - fArch, fhh - fArch, fArch, 0, Math.PI / 2, false);
    frameOuter.lineTo(-fhw + fArch, fhh);
    frameOuter.absarc(-fhw + fArch, fhh - fArch, fArch, Math.PI / 2, Math.PI, false);
    frameOuter.lineTo(-fhw, -fhh + 2);
    frameOuter.closePath();

    const ihw = Math.max(2, fhw - frameT);
    const ihh = Math.max(3, fhh - frameT);
    const iArch = Math.max(1, fArch - frameT * 0.5);
    const frameHole = new THREE.Path();
    frameHole.moveTo(-ihw + 1.5, -ihh);
    frameHole.lineTo(ihw - 1.5, -ihh);
    frameHole.lineTo(ihw, -ihh + 1.5);
    frameHole.lineTo(ihw, ihh - iArch);
    frameHole.absarc(ihw - iArch, ihh - iArch, iArch, 0, Math.PI / 2, false);
    frameHole.lineTo(-ihw + iArch, ihh);
    frameHole.absarc(-ihw + iArch, ihh - iArch, iArch, Math.PI / 2, Math.PI, false);
    frameHole.lineTo(-ihw, -ihh + 1.5);
    frameHole.closePath();
    frameOuter.holes.push(frameHole);

    const collarGeo = new THREE.ExtrudeGeometry(frameOuter, {
        steps: 1,
        depth: accentDepth,
        bevelEnabled: false,
        curveSegments: 12
    });
    collarGeo.translate(0, 0, baseDepth);

    return { baseGeo, collarGeo };
}

/**
 * Peana Arquitectónica Escalonada de Doble Nivel para el estilo Corpóreo ABC
 */
export function createSteppedPlinthAssembly(totalW, plinthH, baseDepth, accentDepth = 1.8) {
    // Peldaño 1: Zócalo inferior ancho con extremos biselados
    const lowerW = totalW + 16;
    const lowerH = plinthH;
    const lowerGeo = createChamferedBoxGeometry(lowerW, lowerH, baseDepth * 1.15, 3.0);

    // Peldaño 2: Escalón superior que abraza la base de los monolitos
    const upperW = totalW + 6;
    const upperH = plinthH * 0.58;
    const upperGeo = createChamferedBoxGeometry(upperW, upperH, baseDepth * 1.32, 2.0);
    upperGeo.translate(0, plinthH * 0.22, 0);

    const baseGeo = mergeGeometriesManually([lowerGeo, upperGeo]);

    // Filete ornamental frontal en color acento con remates laterales
    const trimW = totalW + 8;
    const trimGeo = createRoundedBoxGeometry(trimW, 2.8, accentDepth, 1.2);
    trimGeo.translate(0, -plinthH * 0.18, baseDepth * 1.15);

    const leftStud = createFloralRosetteGeometry(2.8, accentDepth + 0.6, 6);
    leftStud.translate(-trimW / 2 + 5, -plinthH * 0.18, baseDepth * 1.15);
    const rightStud = createFloralRosetteGeometry(2.8, accentDepth + 0.6, 6);
    rightStud.translate(trimW / 2 - 5, -plinthH * 0.18, baseDepth * 1.15);

    const accentGeo = mergeGeometriesManually([trimGeo, leftStud, rightStud]);

    return { baseGeo, accentGeo };
}

/**
 * ESTILO 3 REDISEÑADO: Marco Arquitectónico Multicapa (Capitular Clásica Iluminada)
 * Cartela clásica con esquinas cóncavas acanaladas, frontón superior arqueado,
 * pilastras laterales estriadas, doble moldura en filigrana y 4 rosetones florales tallados de 8 pétalos.
 */
export function createOrnateFrameMeshes(blockW, blockH, baseDepth, reliefDepth, matBase, matAccent) {
    const group = { baseMeshes: [], accentMeshes: [] };
    const hw = blockW / 2;
    const hh = blockH / 2;
    const notchR = Math.min(8.5, hw * 0.22, hh * 0.22);
    const pedimentW = Math.min(hw * 0.58, 22);
    const pedimentH = Math.min(hh * 0.16, 7.5);

    // Helper para trazar silueta con esquinas cóncavas clásicas (coved corners) y arco superior
    function buildCartoucheShape(halfW, halfH, cornerNotch, archW = 0, archH = 0) {
        const s = new THREE.Shape();
        // Abajo
        s.moveTo(-halfW + cornerNotch, -halfH);
        s.lineTo(halfW - cornerNotch, -halfH);
        // Esquina inferior derecha cóncava
        s.absarc(halfW, -halfH, cornerNotch, Math.PI, Math.PI / 2, true);
        // Derecha
        s.lineTo(halfW, halfH - cornerNotch);
        // Esquina superior derecha cóncava
        s.absarc(halfW, halfH, cornerNotch, -Math.PI / 2, Math.PI, true);
        // Tramo superior con frontón curvo opcional
        if (archW > 2 && archH > 1) {
            s.lineTo(archW, halfH);
            s.quadraticCurveTo(0, halfH + archH * 1.7, -archW, halfH);
        }
        s.lineTo(-halfW + cornerNotch, halfH);
        // Esquina superior izquierda cóncava
        s.absarc(-halfW, halfH, cornerNotch, 0, -Math.PI / 2, true);
        // Izquierda
        s.lineTo(-halfW, -halfH + cornerNotch);
        // Esquina inferior izquierda cóncava
        s.absarc(-halfW, -halfH, cornerNotch, Math.PI / 2, 0, true);
        s.closePath();
        return s;
    }

    // 1. Placa Base Escalonada con Frontón y Zócalo
    const outerCartouche = buildCartoucheShape(hw, hh, notchR, pedimentW, pedimentH);
    const baseGeo1 = new THREE.ExtrudeGeometry(outerCartouche, {
        steps: 1,
        depth: baseDepth,
        bevelEnabled: true,
        bevelThickness: 0.9,
        bevelSize: 0.7,
        bevelSegments: 2,
        curveSegments: 18
    });

    // Zócalo inferior de pedestal para la capitular
    const plinthGeo = createChamferedBoxGeometry(blockW + 6, 6.5, baseDepth * 1.12, 2.0);
    plinthGeo.translate(0, -hh - 1.5, 0);

    // Cornisa superior clásica
    const corniceGeo = createChamferedBoxGeometry(blockW + 4, 5.0, baseDepth * 1.08, 1.6);
    corniceGeo.translate(0, hh + 0.5, 0);

    const mergedBaseGeo = mergeGeometriesManually([baseGeo1, plinthGeo, corniceGeo]);
    const baseMesh = new THREE.Mesh(mergedBaseGeo, matBase);
    baseMesh.name = "Bloque_Capitular_Base";
    group.baseMeshes.push(baseMesh);

    // 2. Doble Moldura Concéntrica en Filigrana (Acento)
    const f1_hw = hw - 2.2;
    const f1_hh = hh - 2.2;
    const f1_notch = Math.max(3, notchR - 1.2);
    const outerFrameShape = buildCartoucheShape(f1_hw, f1_hh, f1_notch, pedimentW * 0.85, pedimentH * 0.82);

    const borderT1 = 2.6;
    const i1_hw = f1_hw - borderT1;
    const i1_hh = f1_hh - borderT1;
    const i1_notch = Math.max(2, f1_notch - borderT1 * 0.4);
    const hole1 = buildCartoucheShape(i1_hw, i1_hh, i1_notch, 0, 0);
    outerFrameShape.holes.push(hole1);

    const outerFrameGeo = new THREE.ExtrudeGeometry(outerFrameShape, {
        steps: 1,
        depth: reliefDepth * 0.68,
        bevelEnabled: false,
        curveSegments: 16
    });
    outerFrameGeo.translate(0, 0, baseDepth);

    // Segundo filete interior fino (Filigrana interna)
    const f2_hw = i1_hw - 2.0;
    const f2_hh = i1_hh - 2.0;
    const borderT2 = 1.3;
    const innerFrameShape = new THREE.Shape();
    const rIn = 3.5;
    innerFrameShape.moveTo(-f2_hw + rIn, -f2_hh);
    innerFrameShape.lineTo(f2_hw - rIn, -f2_hh);
    innerFrameShape.absarc(f2_hw - rIn, -f2_hh + rIn, rIn, -Math.PI / 2, 0, false);
    innerFrameShape.lineTo(f2_hw, f2_hh - rIn);
    innerFrameShape.absarc(f2_hw - rIn, f2_hh - rIn, rIn, 0, Math.PI / 2, false);
    innerFrameShape.lineTo(-f2_hw + rIn, f2_hh);
    innerFrameShape.absarc(-f2_hw + rIn, f2_hh - rIn, rIn, Math.PI / 2, Math.PI, false);
    innerFrameShape.lineTo(-f2_hw, -f2_hh + rIn);
    innerFrameShape.absarc(-f2_hw + rIn, -f2_hh + rIn, rIn, Math.PI, Math.PI * 1.5, false);

    const hole2 = new THREE.Path();
    const i2_hw = f2_hw - borderT2;
    const i2_hh = f2_hh - borderT2;
    hole2.moveTo(-i2_hw + rIn, -i2_hh);
    hole2.lineTo(i2_hw - rIn, -i2_hh);
    hole2.absarc(i2_hw - rIn, -i2_hh + rIn, rIn, -Math.PI / 2, 0, false);
    hole2.lineTo(i2_hw, i2_hh - rIn);
    hole2.absarc(i2_hw - rIn, i2_hh - rIn, rIn, 0, Math.PI / 2, false);
    hole2.lineTo(-i2_hw + rIn, i2_hh);
    hole2.absarc(-i2_hw + rIn, i2_hh - rIn, rIn, Math.PI / 2, Math.PI, false);
    hole2.lineTo(-i2_hw, -i2_hh + rIn);
    hole2.absarc(-i2_hw + rIn, -i2_hh + rIn, rIn, Math.PI, Math.PI * 1.5, false);
    innerFrameShape.holes.push(hole2);

    const innerFrameGeo = new THREE.ExtrudeGeometry(innerFrameShape, {
        steps: 1,
        depth: reliefDepth * 0.42,
        bevelEnabled: false,
        curveSegments: 12
    });
    innerFrameGeo.translate(0, 0, baseDepth);

    // 3. Pilastras Clásicas Estriadas Laterales (con Capitel y Basa)
    const pilasterGeos = [];
    const pilasterH = (hh - notchR) * 1.55;
    [-hw + 2.6, hw - 2.6].forEach(px => {
        // Dos estrías verticales por pilastra
        [-0.9, 0.9].forEach(dx => {
            const flute = createChamferedBoxGeometry(1.1, pilasterH, reliefDepth * 0.55, 0.3);
            flute.translate(px + dx, 0, baseDepth);
            pilasterGeos.push(flute);
        });
        // Capitel superior y basa inferior
        const cap = createChamferedBoxGeometry(4.6, 2.6, reliefDepth * 0.72, 0.6);
        cap.translate(px, pilasterH / 2 + 1.0, baseDepth);
        const bas = createChamferedBoxGeometry(4.6, 2.6, reliefDepth * 0.72, 0.6);
        bas.translate(px, -pilasterH / 2 - 1.0, baseDepth);
        pilasterGeos.push(cap, bas);
    });

    const combinedFrameGeo = mergeGeometriesManually([outerFrameGeo, innerFrameGeo, ...pilasterGeos]);
    const frameMesh = new THREE.Mesh(combinedFrameGeo, matAccent);
    frameMesh.name = "Marco_Capitular_Filigrana";
    group.accentMeshes.push(frameMesh);

    // 4. Cuatro Rosetones Florales de 8 Pétalos en las Esquinas + Florón de Coronamiento Superior
    const rosetteOffsetX = f2_hw - 4.2;
    const rosetteOffsetY = f2_hh - 4.2;
    const cornerOffsets = [
        [-rosetteOffsetX, -rosetteOffsetY],
        [rosetteOffsetX, -rosetteOffsetY],
        [rosetteOffsetX, rosetteOffsetY],
        [-rosetteOffsetX, rosetteOffsetY]
    ];
    cornerOffsets.forEach(([cx, cy], cIdx) => {
        const rosetteGeo = createFloralRosetteGeometry(4.2, reliefDepth * 0.7, 8);
        rosetteGeo.translate(cx, cy, baseDepth);
        const cMesh = new THREE.Mesh(rosetteGeo, matAccent);
        cMesh.name = `Roseton_Floral_${cIdx + 1}`;
        group.accentMeshes.push(cMesh);
    });

    // Florón real en la cumbre del frontón superior
    const crownRosette = createFloralRosetteGeometry(3.8, reliefDepth * 0.75, 8);
    crownRosette.translate(0, hh + pedimentH * 0.42, baseDepth);
    const crownMesh = new THREE.Mesh(crownRosette, matAccent);
    crownMesh.name = "Floron_Coronamiento_Superior";
    group.accentMeshes.push(crownMesh);

    return group;
}

/**
 * Placa Romana Clásica "Tabula Ansata" (con orejetas cola de milano, cornisa superior, zócalo y rosetón)
 * para acompañar a la Letra Capitular en el estilo Capitular Clásica.
 */
export function createTabulaAnsataAssembly(width, height, baseDepth, reliefDepth, matBase, matAccent) {
    const hw = width / 2;
    const hh = height / 2;
    const ansaW = Math.min(16, Math.max(10, height * 0.28));
    const ansaNeck = hh * 0.42;
    const ansaFlare = hh * 0.76;

    // Silueta de Tabula Ansata con orejeta clásica en el extremo derecho y molduras
    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw - ansaW, -hh);
    shape.lineTo(hw - ansaW, -ansaNeck);
    shape.lineTo(hw, -ansaFlare);
    shape.lineTo(hw - 3.5, 0);
    shape.lineTo(hw, ansaFlare);
    shape.lineTo(hw - ansaW, ansaNeck);
    shape.lineTo(hw - ansaW, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();

    const mainBaseGeo = new THREE.ExtrudeGeometry(shape, {
        steps: 1,
        depth: baseDepth,
        bevelEnabled: true,
        bevelThickness: 0.7,
        bevelSize: 0.5,
        bevelSegments: 2
    });

    const bodyW = width - ansaW;
    const bodyCenterX = -ansaW / 2;

    // Cornisa superior y zócalo inferior en la base
    const topLedge = createChamferedBoxGeometry(bodyW + 4, 4.2, baseDepth * 1.08, 1.2);
    topLedge.translate(bodyCenterX, hh + 0.8, 0);
    const botLedge = createChamferedBoxGeometry(bodyW + 4, 4.2, baseDepth * 1.08, 1.2);
    botLedge.translate(bodyCenterX, -hh - 0.8, 0);

    const mergedBase = mergeGeometriesManually([mainBaseGeo, topLedge, botLedge]);
    const baseMesh = new THREE.Mesh(mergedBase, matBase);
    baseMesh.name = "Tabula_Ansata_Base_Clasica";

    // Molduras de acento: riel superior, riel inferior, filete interior y rosetón en la orejeta (ansa)
    const accentDepth = reliefDepth * 0.58;
    const topRail = createRoundedBoxGeometry(bodyW - 4, 2.6, accentDepth, 1.0);
    topRail.translate(bodyCenterX, hh - 3.2, baseDepth);

    const botRail = createRoundedBoxGeometry(bodyW - 4, 2.6, accentDepth, 1.0);
    botRail.translate(bodyCenterX, -hh + 3.2, baseDepth);

    const topInner = createRoundedBoxGeometry(bodyW - 10, 1.2, accentDepth * 0.7, 0.5);
    topInner.translate(bodyCenterX, hh - 6.2, baseDepth);

    const botInner = createRoundedBoxGeometry(bodyW - 10, 1.2, accentDepth * 0.7, 0.5);
    botInner.translate(bodyCenterX, -hh + 6.2, baseDepth);

    const ansaRosette = createFloralRosetteGeometry(3.8, accentDepth * 1.1, 8);
    ansaRosette.translate(hw - ansaW * 0.52, 0, baseDepth);

    const mergedAccent = mergeGeometriesManually([topRail, botRail, topInner, botInner, ansaRosette]);
    const accentMesh = new THREE.Mesh(mergedAccent, matAccent);
    accentMesh.name = "Tabula_Ansata_Molduras_Acento";

    return { baseMesh, accentMesh, bodyCenterX, bodyW };
}

/**
 * ESTILO 5 CORREGIDO: Rótulo de Canto de Anaquel (Shelf Edge Sign con Pinza de 19 mm al lado contrario de las letras)
 * - Las letras y el marco decorativo están en la cara frontal (+Z).
 * - La pinza en 'C' que abraza la balda de 19 mm se proyecta hacia ATRÁS (-Z), en dirección 100% opuesta a las letras.
 */
export function createShelfClipAssembly(width, height, baseDepth, shelfLipDepth = 28, shelfThickness = 19.2) {
    const hw = width / 2;
    const hh = height / 2;
    const c = 2.5;

    // 1. Placa Frontal Principal (ubicada en Z = 0 .. baseDepth, donde Z = baseDepth lleva las letras hacia +Z)
    const frontShape = new THREE.Shape();
    frontShape.moveTo(-hw + c, -hh);
    frontShape.lineTo(hw - c, -hh);
    frontShape.lineTo(hw, -hh + c);
    frontShape.lineTo(hw, hh - c);
    frontShape.lineTo(hw - c, hh);
    frontShape.lineTo(-hw + c, hh);
    frontShape.lineTo(-hw, hh - c);
    frontShape.lineTo(-hw, -hh + c);
    frontShape.closePath();

    const frontGeo = new THREE.ExtrudeGeometry(frontShape, {
        depth: baseDepth,
        bevelEnabled: false
    });

    // 2. Pinza Trasera en 'C' (C-Clamp en dirección -Z, al lado contrario de las letras)
    // Perfil lateral dibujado en el plano (Y, Z) y extruido a lo largo del ancho X:
    // - Brazo superior apoya sobre la cara superior de la balda (Y = hh .. hh + jawT) proyectándose hacia ATRÁS (-Z)
    // - Apertura interior de 19.2 mm (Y = hh - 19.2 .. hh) para abrazar la balda estándar
    // - Brazo inferior abraza por debajo de la balda hacia ATRÁS (-Z) con diente de retención sin tornillos
    const jawT = 4.0;
    const clampDepth = Math.max(26, shelfLipDepth);
    const slotTopY = hh;
    const topY = slotTopY + jawT;
    const slotBotY = slotTopY - shelfThickness;
    const botY = slotBotY - jawT;
    const toothH = 1.6; // Diente de presión para sujetar firme la balda

    const clampProfile = new THREE.Shape();
    // Comenzamos en el frente superior del brazo (Y = topY, Z = baseDepth * 0.65) y vamos hacia atrás (-Z, opuesto a las letras)
    clampProfile.moveTo(topY, baseDepth * 0.65);
    clampProfile.lineTo(topY, -clampDepth + 1.8);
    clampProfile.lineTo(topY - 1.8, -clampDepth);
    clampProfile.lineTo(slotTopY, -clampDepth);
    // Cara interna superior que apoya sobre la balda
    clampProfile.lineTo(slotTopY, 0);
    // Fondo del canal donde topa el canto frontal de la balda (Z = 0, detrás de la placa frontal)
    clampProfile.lineTo(slotBotY, 0);
    // Cara interna inferior que abraza por debajo de la balda con diente de retención en la punta (-Z)
    clampProfile.lineTo(slotBotY, -clampDepth + 6.0);
    clampProfile.lineTo(slotBotY + toothH, -clampDepth + 3.5);
    clampProfile.lineTo(slotBotY + toothH, -clampDepth + 1.6);
    clampProfile.lineTo(slotBotY, -clampDepth);
    // Cara exterior del brazo inferior regresando hacia la cara posterior de la placa frontal (Z = 0)
    clampProfile.lineTo(botY + 1.5, -clampDepth);
    clampProfile.lineTo(botY, -clampDepth + 1.8);
    clampProfile.lineTo(botY, 0.2);
    clampProfile.lineTo(slotTopY, 0.2);
    clampProfile.lineTo(slotTopY, baseDepth * 0.65);
    clampProfile.closePath();

    const clampWidth = Math.max(40, width - 8);
    const clampExtruded = new THREE.ExtrudeGeometry(clampProfile, {
        steps: 1,
        depth: clampWidth,
        bevelEnabled: false
    });

    // Mapear coordenadas (x_orig = Y, y_orig = Z, z_orig = X) con permutación par que preserva normales
    const pos = clampExtruded.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const y_val = pos.getX(i);
        const z_val = pos.getY(i);
        const x_val = pos.getZ(i) - clampWidth / 2;

        pos.setX(i, x_val);
        pos.setY(i, y_val);
        pos.setZ(i, z_val);
    }
    pos.needsUpdate = true;
    clampExtruded.computeVertexNormals();

    const mergedBaseGeo = mergeGeometriesManually([frontGeo, clampExtruded]);

    // 3. Marco decorativo perimetral en la cara frontal (+Z)
    const frameT = 2.2;
    const frameInset = 2.5;
    const fhw = hw - frameInset;
    const fhh = hh - frameInset;

    const frameOuter = new THREE.Shape();
    frameOuter.moveTo(-fhw, -fhh);
    frameOuter.lineTo(fhw, -fhh);
    frameOuter.lineTo(fhw, fhh);
    frameOuter.lineTo(-fhw, fhh);
    frameOuter.closePath();

    const frameHole = new THREE.Path();
    const ifhw = fhw - frameT;
    const ifhh = fhh - frameT;
    frameHole.moveTo(-ifhw, -ifhh);
    frameHole.lineTo(ifhw, -ifhh);
    frameHole.lineTo(ifhw, ifhh);
    frameHole.lineTo(-ifhw, ifhh);
    frameHole.closePath();
    frameOuter.holes.push(frameHole);

    const frameGeo = new THREE.ExtrudeGeometry(frameOuter, {
        depth: 1.4,
        bevelEnabled: false
    });
    frameGeo.translate(0, 0, baseDepth);

    return { baseGeo: mergedBaseGeo, frameGeo };
}

/**
 * ESTILO 6 REDISEÑADO: Cuña Ejecutiva de Escritorio (Menos inclinada para escritorios de Coordinadores y Jefatura)
 * Ángulo suave regulable (por defecto 12°), con zócalo frontal biselado, marco perimetral y barras ejecutivas laterales.
 */
export function createAngledWedgeAssembly(width, height, frontLipZ = 4.5, backHeightZ = 16.0) {
    const hw = width / 2;
    const hy = height / 2;

    const profile = new THREE.Shape();
    profile.moveTo(-hy, 0);          // Base delantera en el escritorio (Z = 0)
    profile.lineTo(hy, 0);           // Base trasera en el escritorio (Z = 0)
    profile.lineTo(hy, backHeightZ); // Altura trasera suave
    profile.lineTo(-hy, frontLipZ);  // Labio frontal ejecutivo
    profile.closePath();

    const extruded = new THREE.ExtrudeGeometry(profile, {
        depth: width,
        bevelEnabled: false
    });

    // Mapear coordenadas para coincidir con el sistema CAD global:
    const pos = extruded.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x_orig = pos.getX(i);
        const y_orig = pos.getY(i);
        const z_orig = pos.getZ(i);

        pos.setX(i, z_orig - hw);
        pos.setY(i, x_orig);
        pos.setZ(i, y_orig);
    }
    pos.needsUpdate = true;
    extruded.computeVertexNormals();

    const tanAlpha = (backHeightZ - frontLipZ) / height;
    const alpha = Math.atan(tanAlpha);

    // Marco ejecutivo perimetral + barras laterales de distinción sobre la rampa inclinada
    const frameT = 2.2;
    const borderShape = new THREE.Shape();
    borderShape.moveTo(-hw + 2.5, -hy + 2);
    borderShape.lineTo(hw - 2.5, -hy + 2);
    borderShape.lineTo(hw - 2.5, hy - 2);
    borderShape.lineTo(-hw + 2.5, hy - 2);
    borderShape.closePath();

    const borderHole = new THREE.Path();
    borderHole.moveTo(-hw + 2.5 + frameT, -hy + 2 + frameT);
    borderHole.lineTo(hw - 2.5 - frameT, -hy + 2 + frameT);
    borderHole.lineTo(hw - 2.5 - frameT, hy - 2 - frameT);
    borderHole.lineTo(-hw + 2.5 + frameT, hy - 2 - frameT);
    borderHole.closePath();
    borderShape.holes.push(borderHole);

    const outerFrameGeo = new THREE.ExtrudeGeometry(borderShape, {
        depth: 1.3,
        bevelEnabled: false
    });

    // Barras ejecutivas laterales izquierda y derecha (estilo placa de dirección/coordinación)
    const sideBarW = 4.5;
    const sideBarH = Math.max(12, height - 14);
    const leftBarGeo = createRoundedBoxGeometry(sideBarW, sideBarH, 1.6, 1.5);
    leftBarGeo.translate(-hw + 8.5, 0, 0);
    const rightBarGeo = createRoundedBoxGeometry(sideBarW, sideBarH, 1.6, 1.5);
    rightBarGeo.translate(hw - 8.5, 0, 0);

    const frameGeo = mergeGeometriesManually([outerFrameGeo, leftBarGeo, rightBarGeo]);
    frameGeo.rotateX(alpha);
    const centerRampZ = frontLipZ + hy * tanAlpha;
    frameGeo.translate(0, 0, centerRampZ);

    return {
        baseGeo: extruded,
        frameGeo,
        alpha,
        tanAlpha,
        frontLipZ,
        backHeightZ,
        hy
    };
}

/**
 * NUEVO ESTILO 7: RÓTULO COLGANTE DE TECHO (Inspirado en las fotos de "Sección de Periódicos" y "Folletos / Sección Guatemala")
 * - Panel panorámico con rieles tubulares/biselados superior e inferior de aluminio/acento.
 * - Dos argollas/cáncamos superiores reforzados integrados en la placa para colgar del techo con tensores/cables.
 * - Anillo/medallón institucional central opcional en bajorrelieve sutil como el escudo de fondo de las fotos.
 */
export function createCeilingSuspendedAssembly(width, height, baseDepth, options = {}) {
    const {
        isSplit = false,
        splitGap = 0,
        cutOffsetX = 0
    } = options;

    const hw = width / 2;
    const hh = height / 2;
    const cornerR = 4.0;
    const railH = 5.2;
    const railDepth = 2.2;

    // Posición X de los dos tensores/cables de techo (aprox. a 68% del ancho, igual que en las fotos)
    const hangerOffsetX = Math.max(35, Math.min(hw - 22, width * 0.34));

    // Helper para crear una argolla de suspensión de techo con cuello reforzado
    function createCeilingHangerGeo(cx, topY, depth) {
        const outerR = 7.2;
        const holeR = 2.3; // Agujero Ø 4.6 mm para cable de acero, nylon o hembrilla
        const centerY = topY + outerR * 0.65;

        const tabShape = new THREE.Shape();
        // Base ancha fusionada dentro del borde superior del panel
        tabShape.moveTo(cx - outerR * 1.35, topY - 3.0);
        tabShape.lineTo(cx + outerR * 1.35, topY - 3.0);
        tabShape.lineTo(cx + outerR, centerY);
        tabShape.absarc(cx, centerY, outerR, 0, Math.PI, false);
        tabShape.lineTo(cx - outerR * 1.35, topY - 3.0);
        tabShape.closePath();

        const holePath = new THREE.Path();
        holePath.absarc(cx, centerY + 0.5, holeR, 0, Math.PI * 2, true);
        tabShape.holes.push(holePath);

        const tabGeo = new THREE.ExtrudeGeometry(tabShape, {
            steps: 1,
            depth: depth,
            bevelEnabled: false,
            curveSegments: 18
        });

        // Collarín metálico de refuerzo alrededor del ojal
        const ringShape = new THREE.Shape();
        ringShape.absarc(cx, centerY + 0.5, outerR * 0.78, 0, Math.PI * 2, false);
        const ringHole = new THREE.Path();
        ringHole.absarc(cx, centerY + 0.5, holeR + 0.2, 0, Math.PI * 2, true);
        ringShape.holes.push(ringHole);

        const ringGeo = new THREE.ExtrudeGeometry(ringShape, {
            steps: 1,
            depth: railDepth * 0.75,
            bevelEnabled: false,
            curveSegments: 16
        });
        ringGeo.translate(0, 0, depth);

        return { tabGeo, ringGeo };
    }

    // División automática por partes: el panel lo construye segmentation.js; aquí solo argollas y rieles
    if (options.forSegmentation) {
        const leftHanger = createCeilingHangerGeo(-hangerOffsetX, hh, baseDepth);
        const rightHanger = createCeilingHangerGeo(hangerOffsetX, hh, baseDepth);
        return {
            hangerTabs: [leftHanger.tabGeo, rightHanger.tabGeo],
            rings: [leftHanger.ringGeo, rightHanger.ringGeo],
            rails: [
                { y: hh - railH / 2, h: railH, d: railDepth, name: 'Riel_Superior' },
                { y: -hh + railH / 2, h: railH, d: railDepth, name: 'Riel_Inferior' }
            ],
            cornerR,
            railH
        };
    }

    const baseMeshesInfo = [];
    const accentGeos = [];

    if (!isSplit) {
        // Panel continuo de 1 pieza
        const panelGeo = createRoundedBoxGeometry(width, height, baseDepth, cornerR);
        const leftHanger = createCeilingHangerGeo(-hangerOffsetX, hh, baseDepth);
        const rightHanger = createCeilingHangerGeo(hangerOffsetX, hh, baseDepth);

        const unifiedBase = mergeGeometriesManually([panelGeo, leftHanger.tabGeo, rightHanger.tabGeo]);
        baseMeshesInfo.push({ geo: unifiedBase, name: "Panel_Techo_Base", shiftX: 0 });

        // Rieles horizontales superior e inferior (idénticos a los perfiles plateados superior e inferior de las fotos)
        const topRailGeo = createRoundedBoxGeometry(width, railH, railDepth, 1.8);
        topRailGeo.translate(0, hh - railH / 2, baseDepth);
        const botRailGeo = createRoundedBoxGeometry(width, railH, railDepth, 1.8);
        botRailGeo.translate(0, -hh + railH / 2, baseDepth);

        accentGeos.push(
            { geo: topRailGeo, name: "Riel_Superior_Aluminio" },
            { geo: botRailGeo, name: "Riel_Inferior_Aluminio" },
            { geo: leftHanger.ringGeo, name: "Anillo_Tensor_Techo_Izq" },
            { geo: rightHanger.ringGeo, name: "Anillo_Tensor_Techo_Der" }
        );
    } else {
        // Panel dividido en 2 partes con conector rompecabezas para imprimir rótulos de techo grandes (>25 cm)
        const leftPanel = createLeftPuzzlePlaque(width, height, baseDepth, cornerR, 24, 14, 14, cutOffsetX);
        const leftHanger = createCeilingHangerGeo(-hangerOffsetX, hh, baseDepth);
        const leftMerged = mergeGeometriesManually([leftPanel, leftHanger.tabGeo]);
        leftMerged.translate(-splitGap / 2, 0, 0);
        baseMeshesInfo.push({ geo: leftMerged, name: "Panel_Techo_Parte1_Izquierda_Macho", shiftX: -splitGap / 2 });

        const rightPanel = createRightPuzzlePlaque(width, height, baseDepth, cornerR, 24, 14, 14, cutOffsetX, 0.28);
        const rightHanger = createCeilingHangerGeo(hangerOffsetX, hh, baseDepth);
        const rightMerged = mergeGeometriesManually([rightPanel, rightHanger.tabGeo]);
        rightMerged.translate(splitGap / 2, 0, 0);
        baseMeshesInfo.push({ geo: rightMerged, name: "Panel_Techo_Parte2_Derecha_Hembra", shiftX: splitGap / 2 });

        // Rieles divididos en Parte 1 (Izquierda) y Parte 2 (Derecha)
        const leftW = hw + cutOffsetX;
        const rightW = hw - cutOffsetX;
        const leftCenterX = -hw + leftW / 2 - splitGap / 2;
        const rightCenterX = hw - rightW / 2 + splitGap / 2;

        const topRailL = createRoundedBoxGeometry(leftW, railH, railDepth, 1.5);
        topRailL.translate(leftCenterX, hh - railH / 2, baseDepth);
        const botRailL = createRoundedBoxGeometry(leftW, railH, railDepth, 1.5);
        botRailL.translate(leftCenterX, -hh + railH / 2, baseDepth);
        leftHanger.ringGeo.translate(-splitGap / 2, 0, 0);

        const topRailR = createRoundedBoxGeometry(rightW, railH, railDepth, 1.5);
        topRailR.translate(rightCenterX, hh - railH / 2, baseDepth);
        const botRailR = createRoundedBoxGeometry(rightW, railH, railDepth, 1.5);
        botRailR.translate(rightCenterX, -hh + railH / 2, baseDepth);
        rightHanger.ringGeo.translate(splitGap / 2, 0, 0);

        accentGeos.push(
            { geo: topRailL, name: "Riel_Superior_Parte1" },
            { geo: botRailL, name: "Riel_Inferior_Parte1" },
            { geo: leftHanger.ringGeo, name: "Anillo_Tensor_Parte1" },
            { geo: topRailR, name: "Riel_Superior_Parte2" },
            { geo: botRailR, name: "Riel_Inferior_Parte2" },
            { geo: rightHanger.ringGeo, name: "Anillo_Tensor_Parte2" }
        );
    }

    return { baseMeshesInfo, accentGeos, railH };
}

/**
 * BRAZO ARQUITECTÓNICO DE HIERRO FORJADO CON PUNTA DE FLECHA Y VOLUTAS (Imagen 2)
 */
export function createOrnateBracketGeometry({
    armLengthMm = 240,
    armHeightMm = 10,
    postHeightMm = 120,
    postWidthMm = 12,
    thicknessMm = 5.5,
    eyeletXs = [60, 160],
    braceRadiusMm = 40
} = {}) {
    // Sistema de coordenadas: cara derecha del montante en X = 0, cara superior del brazo en Y = 0.
    // Todas las piezas se solapan ~1 mm para que el sólido impreso salga en una sola pieza.
    const armH = armHeightMm;
    const armL = armLengthMm;
    const yc = -armH / 2;

    // Montante vertical (se atornilla al lateral del anaquel) con 2 perforaciones avellanables
    const post = new THREE.Shape();
    post.moveTo(-postWidthMm, -postHeightMm);
    post.lineTo(0, -postHeightMm);
    post.lineTo(0, 8);
    post.lineTo(-postWidthMm, 8);
    post.closePath();
    [-postHeightMm + 14, -armH - 22].forEach(hy => {
        const hole = new THREE.Path();
        hole.absarc(-postWidthMm / 2, hy, 2.2, 0, Math.PI * 2, true);
        post.holes.push(hole);
    });

    // Remate superior redondeado del montante
    const finial = new THREE.Shape();
    finial.absarc(-postWidthMm / 2, 8, postWidthMm * 0.62, 0, Math.PI * 2, false);

    // Brazo horizontal con punta de flecha clásica centrada en su eje
    const arm = new THREE.Shape();
    arm.moveTo(-1, 0);
    arm.lineTo(armL - 24, 0);
    arm.lineTo(armL - 29, yc + 10);
    arm.lineTo(armL, yc);
    arm.lineTo(armL - 29, yc - 10);
    arm.lineTo(armL - 24, -armH);
    arm.lineTo(-1, -armH);
    arm.closePath();

    // Refuerzo curvo doble (cartabón de herrería) entre montante y brazo, centrado en la esquina interior
    const createBraceBand = (outerR, bandW) => {
        const s = new THREE.Shape();
        const a0 = -Math.PI / 2 - 0.12;
        const a1 = 0.12;
        s.absarc(0, -armH, outerR, a0, a1, false);
        s.absarc(0, -armH, outerR - bandW, a1, a0, true);
        s.closePath();
        return s;
    };
    const braceOuter = createBraceBand(braceRadiusMm, 5);
    const braceInner = createBraceBand(braceRadiusMm * 0.55, 3.5);

    // Ojales bajo el brazo, alineados con las argollas de la placa
    const eyelets = eyeletXs.map(x => createEyeletShape(x, -armH + 1, 6, 3.2));

    const bevel = { bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 2 };
    const geos = [
        new THREE.ExtrudeGeometry(post, { depth: thicknessMm, ...bevel }),
        new THREE.ExtrudeGeometry(finial, { depth: thicknessMm, ...bevel }),
        new THREE.ExtrudeGeometry(arm, { depth: thicknessMm, ...bevel }),
        new THREE.ExtrudeGeometry(braceOuter, { depth: thicknessMm, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.4, bevelSegments: 2 }),
        new THREE.ExtrudeGeometry(braceInner, { depth: thicknessMm, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.4, bevelSegments: 2 }),
        ...eyelets.map(e => new THREE.ExtrudeGeometry(e, { depth: thicknessMm, bevelEnabled: false }))
    ];

    return mergeGeometriesManually(geos);
}

function createEyeletShape(cx, topY, outerR = 6, innerR = 3.2) {
    const s = new THREE.Shape();
    s.absarc(cx, topY - outerR, outerR, 0, Math.PI * 2, false);
    const h = new THREE.Path();
    h.absarc(cx, topY - outerR, innerR, 0, Math.PI * 2, true);
    s.holes.push(h);
    return s;
}

/**
 * PLACA COLGANTE CON MARCO INSET Y ARGOLLAS SUPERIORES E INFERIORES MODULARES (Imagen 2)
 * `loopSpacing` debe ser igual en todas las placas para que las cadenas caigan verticales.
 */
export function createHangingPlateMesh(width, height, depth, hasLowerLoops = true, matBase, matFrame, loopSpacing = Math.min(100, width * 0.55)) {
    const group = { baseMesh: null, frameMesh: null, totalHeight: height };
    const hw = width / 2;
    const hh = height / 2;
    const cornerR = 7;

    const plateShape = new THREE.Shape();
    plateShape.moveTo(-hw + cornerR, -hh);
    plateShape.lineTo(hw - cornerR, -hh);
    plateShape.absarc(hw - cornerR, -hh + cornerR, cornerR, -Math.PI / 2, 0, false);
    plateShape.lineTo(hw, hh - cornerR);
    plateShape.absarc(hw - cornerR, hh - cornerR, cornerR, 0, Math.PI / 2, false);
    plateShape.lineTo(-hw + cornerR, hh);
    plateShape.absarc(-hw + cornerR, hh - cornerR, cornerR, Math.PI / 2, Math.PI, false);
    plateShape.lineTo(-hw, -hh + cornerR);
    plateShape.absarc(-hw + cornerR, -hh + cornerR, cornerR, Math.PI, Math.PI * 1.5, false);
    plateShape.closePath();

    const loopX1 = -loopSpacing / 2;
    const loopX2 = loopSpacing / 2;

    const topLoop1 = createEyeletShape(loopX1, hh + 9, 6.5, 3.4);
    const topLoop2 = createEyeletShape(loopX2, hh + 9, 6.5, 3.4);

    const plateGeo = new THREE.ExtrudeGeometry(plateShape, { depth: depth, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.7, bevelSegments: 2 });
    const l1Geo = new THREE.ExtrudeGeometry(topLoop1, { depth: depth, bevelEnabled: false });
    const l2Geo = new THREE.ExtrudeGeometry(topLoop2, { depth: depth, bevelEnabled: false });

    const geometries = [plateGeo, l1Geo, l2Geo];

    if (hasLowerLoops) {
        const bottomLoop1 = createEyeletShape(loopX1, -hh + 3, 6.5, 3.4);
        const bottomLoop2 = createEyeletShape(loopX2, -hh + 3, 6.5, 3.4);
        const bl1Geo = new THREE.ExtrudeGeometry(bottomLoop1, { depth: depth, bevelEnabled: false });
        const bl2Geo = new THREE.ExtrudeGeometry(bottomLoop2, { depth: depth, bevelEnabled: false });
        geometries.push(bl1Geo, bl2Geo);
    }

    const mergedBaseGeo = mergeGeometriesManually(geometries);
    group.baseMesh = new THREE.Mesh(mergedBaseGeo, matBase);
    group.baseMesh.name = "Placa_Base";

    const frameInset = 4.2;
    const frameT = 2.4;
    const fhw = hw - frameInset;
    const fhh = hh - frameInset;

    const frameOuter = new THREE.Shape();
    frameOuter.moveTo(-fhw + 4, -fhh);
    frameOuter.lineTo(fhw - 4, -fhh);
    frameOuter.absarc(fhw - 4, -fhh + 4, 4, -Math.PI / 2, 0, false);
    frameOuter.lineTo(fhw, fhh - 4);
    frameOuter.absarc(fhw - 4, fhh - 4, 4, 0, Math.PI / 2, false);
    frameOuter.lineTo(-fhw + 4, fhh);
    frameOuter.absarc(-fhw + 4, fhh - 4, 4, Math.PI / 2, Math.PI, false);
    frameOuter.lineTo(-fhw, -fhh + 4);
    frameOuter.absarc(-fhw + 4, -fhh + 4, 4, Math.PI, Math.PI * 1.5, false);
    frameOuter.closePath();

    const frameHole = new THREE.Path();
    const ifhw = fhw - frameT;
    const ifhh = fhh - frameT;
    frameHole.moveTo(-ifhw + 2, -ifhh);
    frameHole.lineTo(ifhw - 2, -ifhh);
    frameHole.absarc(ifhw - 2, -ifhh + 2, 2, -Math.PI / 2, 0, false);
    frameHole.lineTo(ifhw, ifhh - 2);
    frameHole.absarc(ifhw - 2, ifhh - 2, 2, 0, Math.PI / 2, false);
    frameHole.lineTo(-ifhw + 2, ifhh);
    frameHole.absarc(-ifhw + 2, ifhh - 2, 2, Math.PI / 2, Math.PI, false);
    frameHole.lineTo(-ifhw, -ifhh + 2);
    frameHole.absarc(-ifhw + 2, -ifhh + 2, 2, Math.PI, Math.PI * 1.5, false);
    frameHole.closePath();
    frameOuter.holes.push(frameHole);

    const frameGeo = new THREE.ExtrudeGeometry(frameOuter, { depth: 1.4, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.3, bevelSegments: 1 });
    frameGeo.translate(0, 0, depth);
    group.frameMesh = new THREE.Mesh(frameGeo, matFrame);
    group.frameMesh.name = "Marco_Placa_Relieve";

    return group;
}

/**
 * ESLABÓN EN 'C' DESMONTABLE PARA IMPRESIÓN 3D
 */
export function createChainLinkGeometry(lengthMm = 14, widthMm = 11, thicknessMm = 2.5, gapMm = 1.6) {
    // Contorno único en 'C' (sin agujeros): exterior + interior unidos por la abertura lateral.
    // La abertura permite enganchar el eslabón en las argollas girándolo, sin pegamento.
    const hl = lengthMm / 2;
    const r = widthMm / 2;
    const ir = Math.max(1.8, r - thicknessMm);
    const ihl = Math.max(ir + 0.1, hl - thicknessMm);
    const straightOuter = hl - r;
    const straightInner = ihl - ir;
    const g = Math.min(gapMm / 2, Math.max(0.2, Math.min(straightOuter, straightInner) - 0.2));

    const shape = new THREE.Shape();
    shape.moveTo(r, g);
    shape.lineTo(r, straightOuter);
    shape.absarc(0, straightOuter, r, 0, Math.PI, false);
    shape.lineTo(-r, -straightOuter);
    shape.absarc(0, -straightOuter, r, Math.PI, Math.PI * 2, false);
    shape.lineTo(r, -g);
    shape.lineTo(ir, -g);
    shape.lineTo(ir, -straightInner);
    shape.absarc(0, -straightInner, ir, Math.PI * 2, Math.PI, true);
    shape.lineTo(-ir, straightInner);
    shape.absarc(0, straightInner, ir, Math.PI, 0, true);
    shape.lineTo(ir, g);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: thicknessMm,
        bevelEnabled: true,
        bevelThickness: 0.3,
        bevelSize: 0.25,
        bevelSegments: 2
    });
    // Centrado en Z para que pueda girarse 90° sobre su propio eje al formar la cadena
    geo.translate(0, 0, -thicknessMm / 2);
    return geo;
}

/**
 * Une varias BufferGeometry en una sola
 */
function mergeGeometriesManually(geos) {
    let totalPos = 0;
    let totalIndices = 0;

    geos.forEach(g => {
        if (!g.attributes.position) return;
        totalPos += g.attributes.position.array.length;
        if (g.index) totalIndices += g.index.array.length;
    });

    const mergedPos = new Float32Array(totalPos);
    let mergedIndices = totalIndices > 0 ? new Uint32Array(totalIndices) : null;

    let posOffset = 0;
    let indexOffset = 0;
    let vertexCountOffset = 0;

    geos.forEach(g => {
        const pos = g.attributes.position;
        if (!pos) return;
        mergedPos.set(pos.array, posOffset);

        if (g.index && mergedIndices) {
            for (let i = 0; i < g.index.count; i++) {
                mergedIndices[indexOffset + i] = g.index.array[i] + vertexCountOffset;
            }
            indexOffset += g.index.count;
        }

        posOffset += pos.array.length;
        vertexCountOffset += pos.count;
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
    if (mergedIndices) {
        merged.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
    }
    merged.computeVertexNormals();
    return merged;
}

/**
 * Libera de forma segura geometrías y mallas de un Three.Group
 */
export function clearGroupGeometries(group) {
    if (!group) return;
    while (group.children.length > 0) {
        const obj = group.children[0];
        if (obj.geometry) obj.geometry.dispose();
        group.remove(obj);
    }
}
