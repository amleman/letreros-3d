/**
 * Calculadora de horas técnicas y propuesta para jefatura
 */
export function updatePitchCalculator() {
    const signsInput = document.getElementById('calc-signs');
    const compInput = document.getElementById('calc-complexity');
    if (!signsInput || !compInput) return;

    const count = parseInt(signsInput.value, 10);
    const comp = parseInt(compInput.value, 10);

    const signsLabel = document.getElementById('calc-signs-label');
    if (signsLabel) signsLabel.textContent = `${count} letreros`;

    const compNames = {
        1: 'Nivel 1 (Letras Sólidas Clásicas)',
        2: 'Nivel 2 (Bloques Modulares / Bicolor)',
        3: 'Nivel 3 (Filigrana Multicapa + Capitulares)'
    };
    const compLabel = document.getElementById('calc-comp-label');
    if (compLabel) compLabel.textContent = compNames[comp];

    const cadPerSign = comp === 1 ? 0.45 : (comp === 2 ? 0.75 : 1.15);
    const opPerSign = comp === 1 ? 0.35 : (comp === 2 ? 0.60 : 0.85);
    const postPerSign = comp === 1 ? 0.25 : (comp === 2 ? 0.50 : 0.75);

    const hrsCad = (count * cadPerSign).toFixed(1);
    const hrsOp = (count * opPerSign).toFixed(1);
    const hrsPost = (count * postPerSign).toFixed(1);
    const hrsTotal = (parseFloat(hrsCad) + parseFloat(hrsOp) + parseFloat(hrsPost)).toFixed(1);
    const machineHrs = Math.round(count * (comp * 2.4));

    setElText('hrs-cad', `${hrsCad} hrs`);
    setElText('hrs-op', `${hrsOp} hrs activas`);
    setElText('hrs-post', `${hrsPost} hrs`);
    setElText('hrs-total', `${hrsTotal} Horas`);
    setElText('hrs-machine', `+ ${machineHrs} hrs de tiempo de máquina automatizado`);
    setElText('script-hours', `${Math.round(hrsTotal)} horas`);

    const externalPerSign = comp === 1 ? 26 : (comp === 2 ? 35 : 48);
    const internalPerSign = comp === 1 ? 2.8 : (comp === 2 ? 3.8 : 5.2);

    const extTotal = Math.round(count * externalPerSign);
    const intTotal = Math.round(count * internalPerSign);
    const netSavings = extTotal - intTotal;

    setElText('saving-count', count);
    setElText('external-cost', `$${extTotal} USD`);
    setElText('internal-cost', `$${intTotal} USD`);
    setElText('net-savings', `+$${netSavings} USD`);
}

function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

/**
 * Copia el guión ejecutivo al portapapeles
 */
export function copyPitchScript() {
    const hrs = document.getElementById('script-hours')?.textContent || '46 horas';
    const textToCopy = `Propuesta de Señalética 3D para Biblioteca:\n- Diseño CAD propio con exportación directa a archivos .STL / .3MF listos para producción.\n- Estética institucional cálida (bloques modulares, acabados mate/madera y codificación Dewey).\n- Ahorro superior al 80% frente a proveedores externos.\n- Requerimiento técnico: ~${hrs} de modelado, preparación multicolor y montaje (solicitando ampliación de horas o asignación por proyecto especial).`;

    navigator.clipboard?.writeText(textToCopy).then(() => {
        const feedback = document.getElementById('copy-feedback');
        if (feedback) {
            feedback.classList.remove('opacity-0');
            setTimeout(() => feedback.classList.add('opacity-0'), 2800);
        }
    }).catch(() => {
        // Respaldo execCommand si clipboard API está restringida
        const tempInput = document.createElement('textarea');
        tempInput.value = textToCopy;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);

        const feedback = document.getElementById('copy-feedback');
        if (feedback) {
            feedback.classList.remove('opacity-0');
            setTimeout(() => feedback.classList.add('opacity-0'), 2800);
        }
    });
}
