/**
 * Panel de Vitrina del diseñador CAD (solo uso local)
 * - ★ en cada configuración guardada para publicarla (o quitarla) de la vitrina de Netlify
 * - Bitácora de horas reales trabajadas, que la vitrina muestra a jefatura
 */
import { loadVitrina, saveVitrina, totalLoggedHours } from '../config/vitrina.js';
import { STORAGE_SAVED_CONFIGS_KEY, renderUserPresetsList } from '../config/persistence.js';
import { showToast } from './uiController.js';

let vitrina = null;

export function isInVitrina(id) {
    return !!vitrina && vitrina.designs.some(d => d.id === id);
}

export async function initVitrinaPanel() {
    vitrina = await loadVitrina();
    renderUserPresetsList();
    renderVitrinaPanel();
}

async function persist(successTitle, successDesc) {
    try {
        vitrina = await saveVitrina(vitrina);
        if (successTitle) showToast(successTitle, successDesc || 'Guardado en public/vitrina.json');
    } catch (err) {
        console.error('[Vitrina]', err);
        showToast('No se pudo guardar la vitrina', 'Abre el diseñador con "npm run dev" para poder escribir public/vitrina.json');
        vitrina = await loadVitrina();
    }
    renderUserPresetsList();
    renderVitrinaPanel();
}

export async function toggleVitrinaDesign(id) {
    if (!vitrina) return;

    if (isInVitrina(id)) {
        vitrina.designs = vitrina.designs.filter(d => d.id !== id);
        await persist('Quitado de la vitrina', 'Ya no aparecerá en la página para jefatura');
        return;
    }

    let found = null;
    try {
        const list = JSON.parse(localStorage.getItem(STORAGE_SAVED_CONFIGS_KEY) || '[]');
        found = list.find(item => item.id === id);
    } catch (e) {
        // Lista corrupta: se trata como vacía
    }
    if (!found) return;

    vitrina.designs.push(JSON.parse(JSON.stringify(found)));
    await persist('★ Añadido a la vitrina', `"${found.name}" se mostrará a jefatura en Netlify`);
}

export async function removeVitrinaDesign(id) {
    if (!vitrina) return;
    vitrina.designs = vitrina.designs.filter(d => d.id !== id);
    await persist('Quitado de la vitrina');
}

export async function addWorkLogEntry() {
    if (!vitrina) return;
    const dateEl = document.getElementById('worklog-date');
    const taskEl = document.getElementById('worklog-task');
    const hoursEl = document.getElementById('worklog-hours');

    const hours = parseFloat(hoursEl?.value);
    const task = (taskEl?.value || '').trim();
    if (!task || isNaN(hours) || hours <= 0) {
        showToast('Faltan datos', 'Escribe la actividad y las horas (mayor que 0)');
        return;
    }

    vitrina.work.entries.push({
        id: `w_${Date.now()}`,
        date: dateEl?.value || new Date().toISOString().slice(0, 10),
        task,
        hours: Math.round(hours * 100) / 100
    });
    vitrina.work.entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    if (taskEl) taskEl.value = '';
    if (hoursEl) hoursEl.value = '';
    await persist('Horas registradas', `${hours} h • ${task}`);
}

export async function removeWorkLogEntry(entryId) {
    if (!vitrina) return;
    vitrina.work.entries = vitrina.work.entries.filter(e => e.id !== entryId);
    await persist();
}

export async function updateAssignedHours() {
    if (!vitrina) return;
    const val = parseFloat(document.getElementById('worklog-assigned')?.value);
    if (isNaN(val) || val < 0) return;
    vitrina.work.assignedHoursPerWeek = val;
    await persist('Horas asignadas actualizadas', `${val} h por semana`);
}

export async function publishCalculatorEstimate() {
    if (!vitrina) return;
    // Solo este botón cambia la estimación publicada (las ★ y la bitácora no la tocan)
    const est = parseFloat(document.getElementById('hrs-total')?.textContent || '');
    if (isNaN(est)) return;
    vitrina.work.estimatedProjectHours = est;
    await persist('Estimación publicada', `La vitrina mostrará ${est} h estimadas para producir los letreros`);
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function renderVitrinaPanel() {
    if (!vitrina) return;

    const designsEl = document.getElementById('vitrina-designs-list');
    if (designsEl) {
        designsEl.innerHTML = vitrina.designs.length === 0
            ? `<div class="text-[11px] text-slate-500 italic p-3 text-center border border-dashed border-slate-800 rounded-xl">
                   Ningún diseño en la vitrina. En el Diseñador CAD, pulsa ★ en una configuración guardada.
               </div>`
            : vitrina.designs.map(d => `
                <div class="flex items-center justify-between gap-2 p-2 bg-slate-950/70 border border-slate-800 rounded-xl">
                    <div class="min-w-0">
                        <div class="text-xs font-bold text-white truncate">★ ${escapeHtml(d.name)}</div>
                        <div class="text-[10px] text-slate-400 truncate">${escapeHtml((d.text || '').replace(/\n/g, ' / '))}</div>
                    </div>
                    <button type="button" onclick="window.removeVitrinaDesign('${d.id}')" class="text-slate-500 hover:text-rose-400 p-1 rounded transition shrink-0" title="Quitar de la vitrina">
                        <i data-lucide="x" class="w-3.5 h-3.5"></i>
                    </button>
                </div>`).join('');
    }

    const assignedEl = document.getElementById('worklog-assigned');
    if (assignedEl && document.activeElement !== assignedEl) {
        assignedEl.value = vitrina.work.assignedHoursPerWeek;
    }

    const dateEl = document.getElementById('worklog-date');
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

    const entriesEl = document.getElementById('worklog-entries');
    if (entriesEl) {
        const entries = vitrina.work.entries;
        entriesEl.innerHTML = entries.length === 0
            ? `<tr><td colspan="4" class="text-[11px] text-slate-500 italic p-3 text-center">Aún no hay horas registradas.</td></tr>`
            : entries.slice().reverse().map(e => `
                <tr class="border-t border-slate-800">
                    <td class="py-1.5 pr-2 font-mono text-slate-400 whitespace-nowrap">${escapeHtml(e.date)}</td>
                    <td class="py-1.5 pr-2 text-slate-200">${escapeHtml(e.task)}</td>
                    <td class="py-1.5 pr-2 text-right font-bold text-amber-300 whitespace-nowrap">${e.hours} h</td>
                    <td class="py-1.5 text-right">
                        <button type="button" onclick="window.removeWorkLogEntry('${e.id}')" class="text-slate-500 hover:text-rose-400 p-0.5 rounded transition" title="Eliminar registro">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </td>
                </tr>`).join('');
    }

    const totalEl = document.getElementById('worklog-total');
    if (totalEl) totalEl.textContent = `${Math.round(totalLoggedHours(vitrina.work) * 10) / 10} h`;

    const countEl = document.getElementById('vitrina-count');
    if (countEl) countEl.textContent = `${vitrina.designs.length} diseño(s) en la vitrina`;

    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }
}
