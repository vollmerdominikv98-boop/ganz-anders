import { customAlert, customConfirm } from './modal.js';
import { defaultDb } from './config.js';

export function renderAdminToolTable(db) {
    const tbody = document.getElementById('adm-tool-table-body');
    const searchInput = document.getElementById('adm-tool-search');
    const countEl = document.getElementById('adm-tool-count');
    if(!tbody) return;

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    tbody.innerHTML = '';

    let toolEntries = Object.entries(db.tools || {});
    if(countEl) countEl.innerText = toolEntries.length;

    toolEntries = toolEntries.filter(([id, t]) => {
        const fullStr = `${t.brand || ''} ${t.line || ''} ${t.name || ''} Ø${t.diameter}`.toLowerCase();
        return fullStr.includes(query);
    });

    if (toolEntries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-slate-400 italic">Keine Werkzeuge gefunden</td></tr>`;
        return;
    }

    toolEntries.forEach(([id, t]) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
        
        const brandLine = `${t.brand ? '<strong>[' + t.brand + ']</strong> ' : ''}${t.line ? t.line + ' - ' : ''}`;
        const geoBadge = `<span class="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold text-[10px]">Ø${t.diameter} Z${t.z} (fz ${t.fz_nom || 0.05}mm)</span>`;

        tr.innerHTML = `
            <td class="p-2.5">
                <div class="font-medium text-slate-900">${brandLine}${t.name}</div>
                <div class="text-[10px] text-slate-400 font-mono">${t.type || 'Schaftfräser'}</div>
            </td>
            <td class="p-2.5">${geoBadge}</td>
            <td class="p-2.5 text-right space-x-1">
                <button onclick="editToolFromAdmin('${id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] px-2 py-1 rounded font-semibold border border-slate-200 transition">✏️ Bearbeiten</button>
                <button onclick="duplicateToolAdmin('${id}')" class="bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] px-2 py-1 rounded font-semibold border border-slate-200 transition">📋 Kopieren</button>
                <button onclick="deleteToolAdmin('${id}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] px-2 py-1 rounded border border-rose-200 transition">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

export function editToolFromAdmin(id, db) {
    const t = db.tools[id];
    if(!t) return;

    document.getElementById('adm-editing-tool-id').value = id;
    document.getElementById('adm-tool-form-title').innerText = `Werkzeug bearbeiten`;
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

    for (const profId of Object.keys(db.profiles || {})) {
        const chk = document.getElementById(`tool-prof-${profId}`);
        if(chk) chk.checked = t.suitable_profiles ? t.suitable_profiles.includes(profId) : true;
    }

    for (const matId of Object.keys(db.materials || {})) {
        const chk = document.getElementById(`tool-suit-${matId}`);
        const input = document.getElementById(`tool-vc-${matId}`);
        if(chk) chk.checked = t.suitable_materials ? t.suitable_materials.includes(matId) : true;
        if(input) input.value = t.vc_per_material && t.vc_per_material[matId] !== undefined ? t.vc_per_material[matId] : 200;
    }
}

export function resetToolForm() {
    document.getElementById('adm-editing-tool-id').value = '';
    document.getElementById('adm-tool-form-title').innerText = `Neues Werkzeug anlegen`;
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
    const brand = document.getElementById('adm-tool-brand').value.trim();
    const line = document.getElementById('adm-tool-line').value.trim();
    const d = parseFloat(document.getElementById('adm-tool-d').value);
    const z = parseInt(document.getElementById('adm-tool-z').value);
    const radius = parseFloat(document.getElementById('adm-tool-radius').value) || 0;
    const fz_nom = parseFloat(document.getElementById('adm-tool-fznom').value) || (d * 0.007);
    
    if(isNaN(d) || isNaN(z)) return await customAlert('Bitte Durchmesser und Zähnezahl prüfen.');

    let baseTitle = document.getElementById('adm-tool-name').value.trim();
    if(!baseTitle) {
        if(geoType === 'shaft') baseTitle = `Schaftfräser D${d} Z${z}`;
        if(geoType === 'ball') baseTitle = `Kugelfräser D${d} Z${z}`;
        if(geoType === 'torus') baseTitle = `Torusfräser D${d} R${radius} Z${z}`;
    }

    const fullName = baseTitle;
    const id = editId ? editId : ('tool_' + Date.now());
    
    let vcMap = {}; 
    let suitableMaterials = [];
    for (const matId of Object.keys(db.materials || {})) {
        const chk = document.getElementById(`tool-suit-${matId}`);
        const vcInput = document.getElementById(`tool-vc-${matId}`);
        if (chk && chk.checked) suitableMaterials.push(matId);
        vcMap[matId] = vcInput ? parseFloat(vcInput.value) : 200;
    }

    let suitableProfiles = [];
    for (const profId of Object.keys(db.profiles || {})) {
        const chkProf = document.getElementById(`tool-prof-${profId}`);
        if (chkProf && chkProf.checked) suitableProfiles.push(profId);
    }

    db.tools[id] = {
        name: fullName,
        brand: brand,
        line: line,
        type: geoType === 'ball' ? 'Kugelfräser' : (geoType === 'torus' ? 'Torusfräser' : 'Schaftfräser'),
        geo_type: geoType,
        radius: radius,
        material_schneidstoff: "VHM",
        diameter: d,
        z: z,
        fz_nom: fz_nom,
        max_overhang: parseFloat(document.getElementById('adm-tool-overhang').value) || (d * 3),
        vc_per_material: vcMap,
        suitable_materials: suitableMaterials,
        suitable_profiles: suitableProfiles
    };

    resetToolForm();
    if(typeof onSave === 'function') onSave();
    await customAlert('Werkzeug erfolgreich gespeichert!');
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

export function renderAdminMachinesList(db) {
    const container = document.getElementById('adm-machines-list');
    if(!container) return;
    container.innerHTML = '';
    for (const [id, m] of Object.entries(db.machines || {})) {
        const div = document.createElement('div');
        div.className = "bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs";
        div.innerHTML = `
            <div>
                <strong class="text-slate-900">${m.name}</strong>
                <div class="text-slate-500 text-[10px] font-mono">Max: ${m.max_rpm} U/min | ${m.max_vf} mm/min | ${m.max_kw} kW | ${m.max_nm || '--'} Nm</div>
            </div>
            <button onclick="deleteMachineAdmin('${id}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 px-2.5 py-1 rounded border border-rose-200 font-semibold transition">🗑️</button>
        `;
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

    if (!id || !name || isNaN(rpm) || isNaN(vf) || isNaN(kw) || isNaN(nm)) {
        return await customAlert("Bitte fülle alle Maschinenfelder korrekt aus.");
    }

    if (!db.machines) db.machines = {};
    db.machines[id] = { name, max_rpm: rpm, max_vf: vf, max_kw: kw, max_nm: nm };

    document.getElementById('adm-mach-id').value = '';
    document.getElementById('adm-mach-name').value = '';
    if(typeof onSave === 'function') onSave();
    await customAlert("Maschine erfolgreich hinzugefügt!");
}

export function renderAdminMaterialsList(db) {
    const container = document.getElementById('adm-materials-list');
    if(!container) return;
    container.innerHTML = '';
    for (const [id, m] of Object.entries(db.materials || {})) {
        const div = document.createElement('div');
        div.className = "bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs";
        div.innerHTML = `
            <div>
                <strong class="text-slate-900">${m.name}</strong>
                <div class="text-slate-500 text-[10px] font-mono">kc1.1: ${m.kc11} N/mm² | mc: ${m.mc || 0.25}</div>
            </div>
            <button onclick="deleteMaterialAdmin('${id}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 px-2.5 py-1 rounded border border-rose-200 font-semibold transition">🗑️</button>
        `;
        container.appendChild(div);
    }
}

export async function addNewMaterial(db, onSave) {
    const id = document.getElementById('adm-mat-id').value.trim();
    const name = document.getElementById('adm-mat-name').value.trim();
    const kc11 = parseFloat(document.getElementById('adm-mat-kc11').value);
    const mc = parseFloat(document.getElementById('adm-mat-mc').value);

    if (!id || !name || isNaN(kc11) || isNaN(mc)) {
        return await customAlert("Bitte fülle alle Materialfelder korrekt aus.");
    }

    if (!db.materials) db.materials = {};
    db.materials[id] = { name, kc11, mc };

    document.getElementById('adm-mat-id').value = '';
    document.getElementById('adm-mat-name').value = '';
    if(typeof onSave === 'function') onSave();
    await customAlert("Material erfolgreich hinzugefügt!");
}

export function renderAdminProfilesList(db) {
    const container = document.getElementById('adm-profiles-list');
    if(!container) return;
    container.innerHTML = '';
    for (const [id, p] of Object.entries(db.profiles || {})) {
        const div = document.createElement('div');
        div.className = "bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs";
        
        const fzRatio = p.fz_ratio !== undefined ? p.fz_ratio : 1.0;
        const rctText = p.rct_active ? "Aktiv (HSC)" : "Inaktiv (Schlichten)";

        div.innerHTML = `
            <div>
                <strong class="text-slate-900">${p.name}</strong>
                <div class="text-slate-500 text-[10px]">ap: ${p.ap_factor}D | ae: ${p.ae_factor}D | fz-Ratio: ${fzRatio} | RCT: ${rctText}</div>
            </div>
            <button onclick="deleteProfileAdmin('${id}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 px-2.5 py-1 rounded border border-rose-200 font-semibold transition">🗑️</button>
        `;
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
    const desc = document.getElementById('adm-prof-desc').value.trim();

    if (!id || !name || isNaN(ap_factor) || isNaN(ae_factor) || isNaN(fz_ratio)) {
        return await customAlert("Bitte fülle alle Profilfelder korrekt aus.");
    }

    if (!db.profiles) db.profiles = {};
    db.profiles[id] = { name, ap_factor, ae_factor, fz_ratio, rct_active, description: desc };

    document.getElementById('adm-prof-id').value = '';
    document.getElementById('adm-prof-name').value = '';
    document.getElementById('adm-prof-desc').value = '';
    if(typeof onSave === 'function') onSave();
    await customAlert("Profil erfolgreich hinzugefügt!");
}
