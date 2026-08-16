import { customAlert } from './modal.js';
import { escapeHTML } from './config.js';

export function renderAdminToolTable(db) {
    const tbody = document.getElementById('adm-tool-table-body');
    const searchInput = document.getElementById('adm-tool-search');
    if(!tbody) return;

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tbody.innerHTML = '';

    let toolEntries = Object.entries(db.tools || {}).filter(([id, t]) => 
        `${t.brand||''} ${t.line||''} ${t.name||''} Ø${t.diameter}`.toLowerCase().includes(query)
    );

    const countEl = document.getElementById('adm-tool-count');
    if(countEl) countEl.innerText = toolEntries.length;

    if (toolEntries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-slate-400 italic">Keine Werkzeuge gefunden</td></tr>`;
        return;
    }

    toolEntries.forEach(([id, t]) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
        const brandLine = `${t.brand ? '<strong>[' + escapeHTML(t.brand) + ']</strong> ' : ''}${t.line ? escapeHTML(t.line) + ' - ' : ''}`;
        
        tr.innerHTML = `
            <td class="p-2.5">
                <div class="font-medium text-slate-900">${brandLine}${escapeHTML(t.name)}</div>
                <div class="text-[10px] text-slate-400 font-mono">${t.type || 'Schaftfräser'}</div>
            </td>
            <td class="p-2.5"><span class="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold text-[10px]">Ø${t.diameter} Z${t.z}</span></td>
            <td class="p-2.5 text-right space-x-1">
                <button onclick="editToolFromAdmin('${id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] px-2 py-1 rounded border border-slate-200">✏️</button>
                <button onclick="duplicateToolAdmin('${id}')" class="bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] px-2 py-1 rounded border border-slate-200">📋</button>
                <button onclick="deleteToolAdmin('${id}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] px-2 py-1 rounded border border-rose-200">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

export function duplicateToolAdmin(id, db, onSave) {
    const source = db.tools[id];
    if(!source) return;
    const copy = JSON.parse(JSON.stringify(source));
    copy.name += " (Kopie)";
    db.tools['tool_' + Date.now()] = copy;
    if(typeof onSave === 'function') onSave();
}

export function toggleToolGeoFields() {
    const geoType = document.getElementById('adm-tool-geotype').value;
    const radiusContainer = document.getElementById('adm-tool-radius-container');
    if(geoType === 'shaft') {
        radiusContainer.classList.add('hidden');
    } else {
        radiusContainer.classList.remove('hidden');
    }
}

export function editToolFromAdmin(id, db) {
    const t = db.tools[id];
    if(!t) return;
    document.getElementById('adm-editing-tool-id').value = id;
    document.getElementById('adm-tool-brand').value = t.brand || '';
    document.getElementById('adm-tool-line').value = t.line || '';
    document.getElementById('adm-tool-geotype').value = t.geo_type || 'shaft';
    document.getElementById('adm-tool-name').value = t.name || '';
    document.getElementById('adm-tool-d').value = t.diameter || 10;
    document.getElementById('adm-tool-z').value = t.z || 4;
    document.getElementById('adm-tool-overhang').value = t.max_overhang || 30;
    document.getElementById('adm-tool-radius').value = t.radius || 0;
    document.getElementById('adm-tool-fznom').value = t.fz_nom || (t.diameter * 0.007);
    toggleToolGeoFields();

    for (const matId of Object.keys(db.materials || {})) {
        const chk = document.getElementById(`tool-suit-${matId}`);
        const input = document.getElementById(`tool-vc-${matId}`);
        if(chk) chk.checked = t.suitable_materials ? t.suitable_materials.includes(matId) : true;
        if(input) input.value = t.vc_per_material && t.vc_per_material[matId] ? t.vc_per_material[matId] : '';
    }
}

export function resetToolForm() {
    document.getElementById('adm-editing-tool-id').value = '';
    document.getElementById('adm-tool-brand').value = '';
    document.getElementById('adm-tool-line').value = '';
    document.getElementById('adm-tool-name').value = '';
    document.getElementById('adm-tool-d').value = 10;
    document.getElementById('adm-tool-z').value = 4;
    document.getElementById('adm-tool-overhang').value = 30;
    document.getElementById('adm-tool-radius').value = 0;
    document.getElementById('adm-tool-fznom').value = 0.065;
}

export async function saveToolFromForm(db, onSave) {
    const editId = document.getElementById('adm-editing-tool-id').value;
    const geoType = document.getElementById('adm-tool-geotype').value;
    const d = parseFloat(document.getElementById('adm-tool-d').value);
    const z = parseInt(document.getElementById('adm-tool-z').value);
    
    if(isNaN(d) || isNaN(z)) return await customAlert('Bitte Durchmesser und Zähnezahl prüfen.');

    let vcMap = {}; 
    let suitableMaterials = [];
    for (const matId of Object.keys(db.materials || {})) {
        const chk = document.getElementById(`tool-suit-${matId}`);
        const vcInput = document.getElementById(`tool-vc-${matId}`);
        if (chk && chk.checked) suitableMaterials.push(matId);
        const vcVal = vcInput ? parseFloat(vcInput.value) : NaN;
        vcMap[matId] = isNaN(vcVal) ? 100 : vcVal; 
    }

    let suitableProfiles = [];
    for (const profId of Object.keys(db.profiles || {})) {
        const chkProf = document.getElementById(`tool-prof-${profId}`);
        if (chkProf && chkProf.checked) suitableProfiles.push(profId);
    }

    const id = editId ? editId : ('tool_' + Date.now());
    db.tools[id] = {
        name: document.getElementById('adm-tool-name').value.trim() || `Fräser D${d} Z${z}`,
        brand: document.getElementById('adm-tool-brand').value.trim(),
        line: document.getElementById('adm-tool-line').value.trim(),
        type: geoType === 'ball' ? 'Kugelfräser' : (geoType === 'torus' ? 'Torusfräser' : 'Schaftfräser'),
        geo_type: geoType,
        diameter: d, z: z,
        radius: parseFloat(document.getElementById('adm-tool-radius').value) || 0,
        fz_nom: parseFloat(document.getElementById('adm-tool-fznom').value) || (d * 0.007),
        max_overhang: parseFloat(document.getElementById('adm-tool-overhang').value) || (d * 3),
        flute_len: parseFloat(document.getElementById('adm-tool-d').value) * 1.5, 
        vc_per_material: vcMap,
        suitable_materials: suitableMaterials,
        suitable_profiles: suitableProfiles
    };

    resetToolForm();
    if(typeof onSave === 'function') onSave();
    await customAlert('Werkzeug erfolgreich gespeichert!');
}

export function renderAdminMachinesList(db) {
    const container = document.getElementById('adm-machines-list');
    if(!container) return;
    container.innerHTML = '';
    for (const [id, m] of Object.entries(db.machines || {})) {
        const div = document.createElement('div');
        div.className = "bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs";
        div.innerHTML = `<div><strong class="text-slate-900">${escapeHTML(m.name)}</strong></div>
            <button onclick="deleteMachineAdmin('${id}')" class="bg-rose-50 text-rose-700 px-2 py-1 rounded">🗑️</button>`;
        container.appendChild(div);
    }
}

export async function addNewMachine(db, onSave) {
    const id = document.getElementById('adm-mach-id').value.trim();
    const name = document.getElementById('adm-mach-name').value.trim();
    const rpm = parseFloat(document.getElementById('adm-mach-rpm').value);
    const vf = parseFloat(document.getElementById('adm-mach-vf').value);
    const kw = parseFloat(document.getElementById('adm-mach-kw').value);
    const nm = parseFloat(document.getElementById('adm-mach-nm').value);

    if (!id || !name || isNaN(rpm) || isNaN(vf) || isNaN(kw) || isNaN(nm)) return await customAlert("Bitte fülle alle Maschinenfelder korrekt aus.");

    if (!db.machines) db.machines = {};
    db.machines[id] = { name, max_rpm: rpm, max_vf: vf, max_kw: kw, max_nm: nm };
    document.getElementById('adm-mach-id').value = ''; document.getElementById('adm-mach-name').value = '';
    if(typeof onSave === 'function') onSave();
}

export function deleteMachineAdmin(id, db, onSave) {
    if(Object.keys(db.machines || {}).length <= 1) {
        customAlert('Mindestens eine Maschine ist nötig.');
        return;
    }
    delete db.machines[id];
    if(typeof onSave === 'function') onSave();
}

export function renderAdminMaterialsList(db) {
    const container = document.getElementById('adm-materials-list');
    if(!container) return;
    container.innerHTML = '';
    for (const [id, m] of Object.entries(db.materials || {})) {
        const div = document.createElement('div');
        div.className = "bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs";
        div.innerHTML = `<div><strong class="text-slate-900">${escapeHTML(m.name)}</strong></div>
            <button onclick="deleteMaterialAdmin('${id}')" class="bg-rose-50 text-rose-700 px-2 py-1 rounded">🗑️</button>`;
        container.appendChild(div);
    }
}

export async function addNewMaterial(db, onSave) {
    const id = document.getElementById('adm-mat-id').value.trim();
    const name = document.getElementById('adm-mat-name').value.trim();
    const kc11 = parseFloat(document.getElementById('adm-mat-kc11').value);
    const mc = parseFloat(document.getElementById('adm-mat-mc').value);

    if (!id || !name || isNaN(kc11) || isNaN(mc)) return await customAlert("Bitte fülle alle Materialfelder korrekt aus.");
    if (!db.materials) db.materials = {};
    db.materials[id] = { name, kc11, mc };
    document.getElementById('adm-mat-id').value = ''; document.getElementById('adm-mat-name').value = '';
    if(typeof onSave === 'function') onSave();
}

export function deleteMaterialAdmin(id, db, onSave) {
    if(Object.keys(db.materials || {}).length <= 1) {
        customAlert('Mindestens ein Material ist nötig.');
        return;
    }
    delete db.materials[id];
    if(typeof onSave === 'function') onSave();
}

export function renderAdminProfilesList(db) {
    const container = document.getElementById('adm-profiles-list');
    if(!container) return;
    container.innerHTML = '';
    for (const [id, p] of Object.entries(db.profiles || {})) {
        const div = document.createElement('div');
        div.className = "bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs";
        div.innerHTML = `<div><strong class="text-slate-900">${escapeHTML(p.name)}</strong></div>
            <button onclick="deleteProfileAdmin('${id}')" class="bg-rose-50 text-rose-700 px-2 py-1 rounded">🗑️</button>`;
        container.appendChild(div);
    }
}

export async function addNewProfile(db, onSave) {
    const id = document.getElementById('adm-prof-id').value.trim();
    const name = document.getElementById('adm-prof-name').value.trim();
    const ap_factor = parseFloat(document.getElementById('adm-prof-ap').value);
    const ae_factor = parseFloat(document.getElementById('adm-prof-ae').value);
    const fz_ratio = parseFloat(document.getElementById('adm-prof-fzratio').value);
    const rct_active = document.getElementById('adm-prof-rct').value === 'true';

    if (!id || !name || isNaN(ap_factor) || isNaN(ae_factor) || isNaN(fz_ratio)) return await customAlert("Bitte fülle alle Profilfelder korrekt aus.");
    if (!db.profiles) db.profiles = {};
    db.profiles[id] = { name, ap_factor, ae_factor, fz_ratio, rct_active };
    document.getElementById('adm-prof-id').value = ''; document.getElementById('adm-prof-name').value = '';
    if(typeof onSave === 'function') onSave();
}

export function deleteProfileAdmin(id, db, onSave) {
    if(Object.keys(db.profiles || {}).length <= 1) {
        customAlert('Mindestens ein Profil ist nötig.');
        return;
    }
    delete db.profiles[id];
    if(typeof onSave === 'function') onSave();
}

export function renderProfileCheckboxes(db) {
    const container = document.getElementById('adm-tool-profiles-container');
    if(!container) return;
    container.innerHTML = '';
    for (const [profId, p] of Object.entries(db.profiles || {})) {
        const div = document.createElement('div');
        div.className = "flex items-center gap-1.5";
        div.innerHTML = `
            <input type="checkbox" id="tool-prof-${profId}" checked class="rounded border-slate-300 text-slate-800">
            <label for="tool-prof-${profId}" class="text-slate-700 cursor-pointer text-[11px] font-medium truncate" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</label>
        `;
        container.appendChild(div);
    }
}

export function renderToolMatrixInputs(db) {
    const container = document.getElementById('adm-tool-matrix-container');
    if(!container) return;
    container.innerHTML = '';
    for (const [matId, mat] of Object.entries(db.materials || {})) {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between gap-1 bg-white p-1.5 rounded-lg border border-slate-300";
        div.innerHTML = `
            <label class="flex items-center gap-1.5 truncate text-slate-700 cursor-pointer flex-1 text-[11px]">
                <input type="checkbox" id="tool-suit-${matId}" checked class="rounded border-slate-300 text-slate-800">
                <span class="truncate font-medium">${escapeHTML(mat.name)}</span>
            </label>
            <input type="number" id="tool-vc-${matId}" placeholder="vc..." class="w-12 bg-slate-50 border border-slate-300 rounded p-0.5 text-slate-900 text-right text-xs font-mono">
        `;
        container.appendChild(div);
    }
}
