import { defaultDb, ADMIN_PASSWORD } from './config.js';
import { customAlert, customConfirm } from './modal.js';
import { initSupabase, saveSupabaseConfig, pushDataToSupabase, getIsCloudActive } from './supabase.js';
import { calculatePhysics } from './physics.js';
import { runMatchmaker } from './matchmaker.js';
import {
    renderAdminToolTable,
    editToolFromAdmin,
    resetToolForm,
    saveToolFromForm,
    toggleToolGeoFields,
    renderAdminMachinesList,
    addNewMachine,
    renderAdminMaterialsList,
    addNewMaterial,
    renderAdminProfilesList,
    addNewProfile
} from './admin.js';

let db = loadDatabase();
let currentCalculatedResults = { rpm: 0, vf: 0, ap: 0, ae: 0, q: 0, power: 0, torque: 0, fz_eff: 0, vc_eff: 0, fc: 0, stress: 0 };

function loadDatabase() {
    const saved = localStorage.getItem('toolpilot_master_db');
    if (saved) {
        try { 
            const parsed = JSON.parse(saved);
            if (parsed && parsed.tools && Object.keys(parsed.tools).length > 0) {
                parsed.machines = Object.assign({}, defaultDb.machines, parsed.machines || {});
                parsed.materials = Object.assign({}, defaultDb.materials, parsed.materials || {});
                parsed.rigidity = Object.assign({}, defaultDb.rigidity, parsed.rigidity || {});
                parsed.profiles = Object.assign({}, defaultDb.profiles, parsed.profiles || {});
                parsed.tools = Object.assign({}, defaultDb.tools, parsed.tools || {});
                if(!parsed.history) parsed.history = [];
                if(!parsed.favorites) parsed.favorites = [];
                if(!parsed.swarm_data) parsed.swarm_data = [];
                return parsed;
            }
        } catch (e) { console.error(e); }
    }
    return JSON.parse(JSON.stringify(defaultDb));
}

function saveDatabase() {
    localStorage.setItem('toolpilot_master_db', JSON.stringify(db));
    if (getIsCloudActive()) {
        pushDataToSupabase(db);
    }
}

// -------------------------------------------------------------
// UI Navigation & Handlers
// -------------------------------------------------------------
export function toggleExpertMode() {
    const panel = document.getElementById('expert-panel');
    const icon = document.getElementById('expert-toggle-icon');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        if (icon) icon.innerText = '▲ Zuklappen';
    } else {
        panel.classList.add('hidden');
        if (icon) icon.innerText = '▼ Aufklappen';
    }
}

export function switchAdminTab(tabName) {
    const tabs = ['tools', 'machines', 'materials', 'profiles', 'cloud'];
    tabs.forEach(t => {
        const tabEl = document.getElementById(`admin-tab-${t}`);
        const btnEl = document.getElementById(`tab-btn-${t}`);
        if (tabEl && btnEl) {
            if (t === tabName) {
                tabEl.classList.remove('hidden');
                btnEl.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition bg-white text-slate-900 shadow-sm";
            } else {
                tabEl.classList.add('hidden');
                btnEl.className = "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition";
            }
        }
    });

    if (tabName === 'tools') renderAdminToolTable(db);
    if (tabName === 'machines') renderAdminMachinesList(db);
    if (tabName === 'materials') renderAdminMaterialsList(db);
    if (tabName === 'profiles') renderAdminProfilesList(db);
}

export async function toggleAdmin() {
    const panel = document.getElementById('admin-panel');
    if (panel.classList.contains('hidden')) {
        const pwd = prompt("Bitte Admin-Passwort eingeben:");
        if (pwd === ADMIN_PASSWORD) {
            panel.classList.remove('hidden');
            renderAdminToolTable(db);
        } else if (pwd !== null) {
            await customAlert("Falsches Passwort!");
        }
    } else {
        panel.classList.add('hidden');
    }
}

export function switchBottomTab(tab) {
    const btnFav = document.getElementById('bottom-tab-fav');
    const btnHist = document.getElementById('bottom-tab-hist');
    const contentFav = document.getElementById('tab-content-favorites');
    const contentHist = document.getElementById('tab-content-history');
    const searchWrapper = document.getElementById('favorites-search-wrapper');

    if (tab === 'favorites') {
        btnFav.className = "px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-800 text-white shadow-sm";
        btnHist.className = "px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 transition";
        contentFav.classList.remove('hidden');
        contentHist.classList.add('hidden');
        searchWrapper.classList.remove('hidden');
    } else {
        btnHist.className = "px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-800 text-white shadow-sm";
        btnFav.className = "px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 transition";
        contentHist.classList.remove('hidden');
        contentFav.classList.add('hidden');
        searchWrapper.classList.add('hidden');
    }
}

export function toggleBottomSection() {
    const content = document.getElementById('bottom-section-content');
    const btn = document.getElementById('toggle-section-btn');
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        btn.innerText = "▲ Ausblenden";
    } else {
        content.classList.add('hidden');
        btn.innerText = "▼ Einblenden";
    }
}

// -------------------------------------------------------------
// Dropdowns & Selektoren
// -------------------------------------------------------------
export function populateDropdowns() {
    const machSel = document.getElementById('machine-select');
    const mmMachSel = document.getElementById('mm-machine-select');
    if (machSel) machSel.innerHTML = '';
    if (mmMachSel) mmMachSel.innerHTML = '';
    for (const [id, m] of Object.entries(db.machines || {})) {
        if (machSel) machSel.add(new Option(m.name, id));
        if (mmMachSel) mmMachSel.add(new Option(m.name, id));
    }

    const matSel = document.getElementById('material-select');
    const mmMatSel = document.getElementById('mm-material-select');
    if (matSel) matSel.innerHTML = '';
    if (mmMatSel) mmMatSel.innerHTML = '';
    for (const [id, m] of Object.entries(db.materials || {})) {
        if (matSel) matSel.add(new Option(m.name, id));
        if (mmMatSel) mmMatSel.add(new Option(m.name, id));
    }

    const profSel = document.getElementById('profile-select');
    const mmProfSel = document.getElementById('mm-profile-select');
    if (profSel) profSel.innerHTML = '';
    if (mmProfSel) mmProfSel.innerHTML = '';
    for (const [id, p] of Object.entries(db.profiles || {})) {
        if (profSel) profSel.add(new Option(p.name, id));
        if (mmProfSel) mmProfSel.add(new Option(p.name, id));
    }

    const rigSel = document.getElementById('rigidity-select');
    if (rigSel) {
        rigSel.innerHTML = '';
        for (const [id, r] of Object.entries(db.rigidity || {})) {
            rigSel.add(new Option(`${r.name} (Faktor: ${r.factor})`, id));
        }
        if(db.rigidity && db.rigidity["mittel"]) rigSel.value = "mittel";
    }

    renderToolMatrixInputs();
    renderProfileCheckboxes();
    populateBrandDropdown();
}

export function syncMmToExpert() {
    const mmMach = document.getElementById('mm-machine-select')?.value;
    const mmMat = document.getElementById('mm-material-select')?.value;
    const mmProf = document.getElementById('mm-profile-select')?.value;
    if (mmMach) document.getElementById('machine-select').value = mmMach;
    if (mmMat) document.getElementById('material-select').value = mmMat;
    if (mmProf) document.getElementById('profile-select').value = mmProf;
    onMaterialOrProfileChange();
    triggerMatchmaker();
}

function renderProfileCheckboxes() {
    const container = document.getElementById('adm-tool-profiles-container');
    if(!container) return;
    container.innerHTML = '';
    for (const [profId, p] of Object.entries(db.profiles || {})) {
        const div = document.createElement('div');
        div.className = "flex items-center gap-1.5";
        div.innerHTML = `
            <input type="checkbox" id="tool-prof-${profId}" checked class="rounded border-slate-300 text-slate-800">
            <label for="tool-prof-${profId}" class="text-slate-700 cursor-pointer text-[11px] font-medium truncate" title="${p.name}">${p.name}</label>
        `;
        container.appendChild(div);
    }
}

function renderToolMatrixInputs() {
    const container = document.getElementById('adm-tool-matrix-container');
    if(!container) return;
    container.innerHTML = '';
    for (const [matId, mat] of Object.entries(db.materials || {})) {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between gap-1 bg-white p-1.5 rounded-lg border border-slate-300";
        div.innerHTML = `
            <label class="flex items-center gap-1.5 truncate text-slate-700 cursor-pointer flex-1 text-[11px]">
                <input type="checkbox" id="tool-suit-${matId}" checked class="rounded border-slate-300 text-slate-800">
                <span class="truncate font-medium">${mat.name}</span>
            </label>
            <input type="number" id="tool-vc-${matId}" value="200" class="w-12 bg-slate-50 border border-slate-300 rounded p-0.5 text-slate-900 text-right text-xs font-mono">
        `;
        container.appendChild(div);
    }
}

export function onMaterialOrProfileChange() {
    populateBrandDropdown();
}

export function populateBrandDropdown() {
    const selectedMat = document.getElementById('material-select')?.value;
    const selectedProf = document.getElementById('profile-select')?.value;
    const brandSel = document.getElementById('brand-select');
    if (!brandSel) return;
    brandSel.innerHTML = '';
    
    let brands = new Set();
    for (const t of Object.values(db.tools || {})) {
        const matFit = !t.suitable_materials || t.suitable_materials.includes(selectedMat);
        const profFit = !t.suitable_profiles || t.suitable_profiles.includes(selectedProf);
        if (matFit && profFit && t.brand && t.brand.trim() !== '') brands.add(t.brand.trim());
    }

    if (brands.size === 0) {
        for (const t of Object.values(db.tools || {})) {
            if (t.brand && t.brand.trim() !== '') brands.add(t.brand.trim());
        }
    }

    brandSel.add(new Option('-- Alle --', 'ALL'));
    brands.forEach(b => brandSel.add(new Option(b, b)));
    onBrandChange();
}

export function onBrandChange() {
    const selectedMat = document.getElementById('material-select')?.value;
    const selectedProf = document.getElementById('profile-select')?.value;
    const selectedBrand = document.getElementById('brand-select')?.value;
    const lineSel = document.getElementById('line-select');
    if (!lineSel) return;
    lineSel.innerHTML = '';

    let lines = new Set();
    const populateLines = (fallback) => {
        for (const t of Object.values(db.tools || {})) {
            const matFit = fallback || !t.suitable_materials || t.suitable_materials.includes(selectedMat);
            const profFit = fallback || !t.suitable_profiles || t.suitable_profiles.includes(selectedProf);
            const brandMatch = (selectedBrand === 'ALL' || t.brand === selectedBrand);

            if (matFit && profFit && brandMatch && t.line && t.line.trim() !== '') {
                lines.add(t.line.trim());
            }
        }
    };

    populateLines(false);
    if (lines.size === 0) populateLines(true);

    lineSel.add(new Option('-- Alle --', 'ALL'));
    lines.forEach(l => lineSel.add(new Option(l, l)));
    onLineChange();
}

export function onLineChange() {
    const selectedMat = document.getElementById('material-select')?.value;
    const selectedProf = document.getElementById('profile-select')?.value;
    const selectedBrand = document.getElementById('brand-select')?.value;
    const selectedLine = document.getElementById('line-select')?.value;
    const toolSel = document.getElementById('tool-select');
    if (!toolSel) return;
    
    const previousToolId = toolSel.value;
    toolSel.innerHTML = '';

    let toolCount = 0;
    const populateTools = (fallback) => {
        for (const [id, t] of Object.entries(db.tools || {})) {
            const matFit = fallback || !t.suitable_materials || t.suitable_materials.includes(selectedMat);
            const profFit = fallback || !t.suitable_profiles || t.suitable_profiles.includes(selectedProf);
            const brandMatch = (selectedBrand === 'ALL' || t.brand === selectedBrand);
            const lineMatch = (selectedLine === 'ALL' || t.line === selectedLine);

            if (matFit && profFit && brandMatch && lineMatch) {
                const label = `${t.line ? '[' + t.line + '] ' : ''}${t.name}` + (fallback ? " (Bedingt geeignet)" : "");
                toolSel.add(new Option(label, id));
                toolCount++;
            }
        }
    };

    populateTools(false);
    if (toolCount === 0) populateTools(true);

    if (toolCount === 0) {
        toolSel.add(new Option('-- Keine passenden Werkzeuge --', ''));
    } else {
        let options = Array.from(toolSel.options).map(opt => opt.value);
        if (options.includes(previousToolId)) toolSel.value = previousToolId;
    }

    resetSliders();
}

export function onToolChange() {
    const toolId = document.getElementById('tool-select')?.value;
    if(!db.tools || !toolId) return;
    const tool = db.tools[toolId];
    if(tool) {
        if(tool.brand && document.getElementById('brand-select')) {
            document.getElementById('brand-select').value = tool.brand;
            onBrandChange();
        }
        if(tool.line && document.getElementById('line-select')) {
            document.getElementById('line-select').value = tool.line;
            onLineChange();
            document.getElementById('tool-select').value = toolId;
        }
        if (document.getElementById('input-d-ist')) document.getElementById('input-d-ist').value = tool.diameter.toFixed(2);
        if (document.getElementById('input-r-ist')) document.getElementById('input-r-ist').value = (tool.radius || 0).toFixed(2);
    }
    resetSliders();
}

export function toggleRegrindFields() {
    const active = document.getElementById('regrind-toggle')?.checked;
    const container = document.getElementById('regrind-container');
    const toolId = document.getElementById('tool-select')?.value;
    if(!db.tools || !container) return;
    const tool = db.tools[toolId];

    if(active) {
        container.classList.remove('hidden');
        if(tool) {
            document.getElementById('input-d-ist').value = tool.diameter.toFixed(2);
            document.getElementById('input-r-ist').value = (tool.radius || 0).toFixed(2);
        }
        const rBox = document.getElementById('regrind-r-box');
        if(tool && tool.geo_type === 'shaft') {
            rBox.classList.add('hidden');
        } else {
            rBox.classList.remove('hidden');
        }
    } else {
        container.classList.add('hidden');
    }
    calculate();
}

// -------------------------------------------------------------
// Slider & Synchronisation
// -------------------------------------------------------------
export function resetSliders() {
    if(!db.tools || !db.profiles) return;
    const toolId = document.getElementById('tool-select')?.value;
    const profId = document.getElementById('profile-select')?.value;
    const t = db.tools[toolId];
    const p = db.profiles[profId];
    
    if (t && p) {
        let D = t.diameter;
        if (document.getElementById('regrind-toggle')?.checked) {
            D = parseFloat(document.getElementById('input-d-ist').value) || D;
        }
        
        const Lmax = t.max_overhang || (D * 3);
        const apS = document.getElementById('slider-ap');
        const aeS = document.getElementById('slider-ae');
        
        if (apS) apS.max = Lmax.toFixed(2);
        if (aeS) aeS.max = D.toFixed(2);
        
        let targetAp = D * p.ap_factor;
        let targetAe = D * p.ae_factor;

        if (profId === 'schlichten_gehaertet') {
            targetAp = Math.min(D * p.ap_factor, 0.25); 
            targetAe = Math.min(D * p.ae_factor, 0.20); 
        }
        
        if (document.getElementById('input-ap-mm')) document.getElementById('input-ap-mm').value = targetAp.toFixed(2);
        if (apS) apS.value = targetAp.toFixed(2);
        if (document.getElementById('input-ae-mm')) document.getElementById('input-ae-mm').value = targetAe.toFixed(2);
        if (aeS) aeS.value = targetAe.toFixed(2);
    }
    calculate();
}

export function syncApFromSlider() {
    const val = parseFloat(document.getElementById('slider-ap').value) || 0.01;
    document.getElementById('input-ap-mm').value = val.toFixed(2);
    calculate();
}

export function syncApFromInput() {
    const val = parseFloat(document.getElementById('input-ap-mm').value) || 0.01;
    document.getElementById('slider-ap').value = val;
    calculate();
}

export function syncAeFromSlider() {
    const val = parseFloat(document.getElementById('slider-ae').value) || 0.01;
    document.getElementById('input-ae-mm').value = val.toFixed(2);
    calculate();
}

export function syncAeFromInput() {
    const val = parseFloat(document.getElementById('input-ae-mm').value) || 0.01;
    document.getElementById('slider-ae').value = val;
    calculate();
}

// -------------------------------------------------------------
// CAM & Physics Runner
// -------------------------------------------------------------
export function calculateCamFeed() {
    if(!db.tools) return;
    const toolId = document.getElementById('tool-select')?.value;
    const tool = db.tools[toolId];
    const isRegrind = document.getElementById('regrind-toggle')?.checked;
    const rInput = document.getElementById('input-cam-r');
    const resPercent = document.getElementById('res-cam-percent');
    const warning = document.getElementById('cam-calc-warning');

    if (!tool || !rInput || !resPercent) return;

    let D = tool.diameter;
    if (isRegrind) {
        const customD = parseFloat(document.getElementById('input-d-ist')?.value);
        if (!isNaN(customD) && customD > 0) D = customD;
    }

    const rTool = D / 2;
    const rContour = parseFloat(rInput.value);

    if (isNaN(rContour) || rContour <= 0) {
        resPercent.innerText = "-- %";
        if (warning) warning.classList.add('hidden');
        return;
    }

    if (rContour <= rTool) {
        resPercent.innerText = "0 %";
        if (warning) {
            warning.innerHTML = `⚠️ Kontur-Radius (${rContour} mm) ist zu klein für Fräser (R${rTool} mm)!`;
            warning.classList.remove('hidden');
        }
    } else {
        const percent = ((rContour - rTool) / rContour) * 100;
        resPercent.innerText = percent.toFixed(1) + " %";
        if (warning) warning.classList.add('hidden');
    }
}

export function calculate() {
    const toolId = document.getElementById('tool-select')?.value;
    if (!toolId || !db.tools || !db.tools[toolId]) return;

    const res = calculatePhysics({
        db,
        machId: document.getElementById('machine-select')?.value,
        matId: document.getElementById('material-select')?.value,
        profId: document.getElementById('profile-select')?.value,
        toolId: toolId,
        rigId: document.getElementById('rigidity-select')?.value,
        holderType: document.getElementById('holder-select')?.value,
        physicsActive: document.getElementById('physics-toggle')?.checked,
        isRegrind: document.getElementById('regrind-toggle')?.checked,
        customD: parseFloat(document.getElementById('input-d-ist')?.value),
        customR: parseFloat(document.getElementById('input-r-ist')?.value),
        ap: parseFloat(document.getElementById('input-ap-mm')?.value) || 0.01,
        ae: parseFloat(document.getElementById('input-ae-mm')?.value) || 0.01
    });

    if(!res) return;

    currentCalculatedResults = res;

    if (document.getElementById('val-ap-factor')) document.getElementById('val-ap-factor').innerText = `(${res.ap_factor.toFixed(2)} × D)`;
    if (document.getElementById('val-ae-factor')) document.getElementById('val-ae-factor').innerText = `(${res.ae_factor.toFixed(2)} × D)`;

    const warningBox = document.getElementById('calc-warnings');
    if (warningBox) {
        if (res.warnings.length > 0) {
            warningBox.innerHTML = res.warnings.join('');
            warningBox.classList.remove('hidden');
        } else {
            warningBox.innerHTML = '';
            warningBox.classList.add('hidden');
        }
    }

    if (document.getElementById('physics-info')) document.getElementById('physics-info').innerHTML = res.physicsInfoHtml;

    if (document.getElementById('res-rpm')) document.getElementById('res-rpm').innerText = res.rpm.toFixed(0) + " U/min";
    if (document.getElementById('res-vc-eff')) document.getElementById('res-vc-eff').innerText = `vc: ${res.vc_eff.toFixed(0)} m/min`;
    if (document.getElementById('res-vf')) document.getElementById('res-vf').innerText = res.vf.toFixed(0) + " mm/min";
    if (document.getElementById('res-fz-eff')) document.getElementById('res-fz-eff').innerText = `fz: ${res.fz_eff.toFixed(4)} mm`;
    if (document.getElementById('res-apae')) document.getElementById('res-apae').innerText = res.ap.toFixed(2) + " / " + res.ae.toFixed(2) + " mm";
    if (document.getElementById('res-q')) document.getElementById('res-q').innerText = res.q.toFixed(2) + " cm³/min";
    if (document.getElementById('res-power')) document.getElementById('res-power').innerText = res.power.toFixed(2) + " kW";
    if (document.getElementById('res-torque')) document.getElementById('res-torque').innerText = res.torque.toFixed(1) + " Nm";
    if (document.getElementById('res-fc')) document.getElementById('res-fc').innerText = res.fc.toFixed(0) + " N";
    if (document.getElementById('res-stress')) document.getElementById('res-stress').innerText = res.stress.toFixed(0) + " MPa";

    calculateCamFeed();
}

// -------------------------------------------------------------
// Favoriten & Verlauf
// -------------------------------------------------------------
export function renderFavorites() {
    const container = document.getElementById('tab-content-favorites');
    const searchInput = document.getElementById('fav-search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    if (!container) return;
    
    container.innerHTML = '';
    let filteredFavs = db.favorites || [];
    if (query !== '') {
        filteredFavs = filteredFavs.filter(f => f.title.toLowerCase().includes(query) || (f.feedback && f.feedback.toLowerCase().includes(query)));
    }

    if (filteredFavs.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-400 italic col-span-4">Keine Favoriten vorhanden.</div>`;
        return;
    }

    filteredFavs.forEach(fav => {
        const card = document.createElement('div');
        card.className = "bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2";
        card.innerHTML = `
            <div>
                <span class="font-bold text-slate-900 text-xs truncate block">${fav.title}</span>
                <div class="text-[10px] text-slate-600 font-mono mt-1">${fav.rpm} U/min | ${fav.feed_rate_vf} mm/min</div>
            </div>
            <div class="flex gap-2 pt-1">
                <button onclick="loadFavorite('${fav.id}')" class="flex-1 bg-white border border-slate-200 text-slate-800 text-xs py-1 rounded font-semibold">Laden</button>
                <button onclick="deleteFavorite('${fav.id}')" class="bg-rose-50 text-rose-700 text-xs px-2 rounded">🗑️</button>
            </div>
        `;
        container.appendChild(card);
    });
}

export function renderHistory() {
    const container = document.getElementById('history-container');
    const countEl = document.getElementById('history-count');
    if(!container) return;

    if(!db.history) db.history = [];
    if (countEl) countEl.innerText = db.history.length;
    container.innerHTML = '';

    if (db.history.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-400 italic col-span-4">Noch kein Verlauf aufgezeichnet.</div>`;
        return;
    }

    db.history.slice(-30).reverse().forEach(item => {
        const card = document.createElement('div');
        card.className = "bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2";
        card.innerHTML = `
            <div>
                <span class="font-bold text-slate-900 text-xs truncate block">${item.tool_name}</span>
                <span class="text-[10px] text-slate-500">${item.mat_name}</span>
                <div class="text-[10px] text-slate-700 font-mono mt-1">${item.rpm} U/min | ${item.vf} mm/min</div>
            </div>
            <div class="flex gap-1.5 pt-1">
                <button onclick="submitFeedback('${item.id}', 'success')" class="flex-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] py-1 rounded font-bold">🟢 Top</button>
                <button onclick="submitFeedback('${item.id}', 'chatter')" class="flex-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] py-1 rounded font-bold">🟡 Rattert</button>
                <button onclick="submitFeedback('${item.id}', 'break')" class="flex-1 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] py-1 rounded font-bold">🔴 Bruch</button>
            </div>
        `;
        container.appendChild(card);
    });
}

export function submitFeedback(id, status) {
    const item = db.history.find(h => h.id === id);
    if(item) {
        item.feedback_status = status;
        if(!db.swarm_data) db.swarm_data = [];
        db.swarm_data.push({ tool_id: item.tool_id, mat_id: item.mat_id, prof_id: item.prof_id, status, timestamp: Date.now() });
        saveDatabase();
        calculate();
        renderHistory();
    }
}

export async function confirmAndPushToHistory() {
    const machId = document.getElementById('machine-select')?.value;
    const matId = document.getElementById('material-select')?.value;
    const profId = document.getElementById('profile-select')?.value;
    const toolId = document.getElementById('tool-select')?.value;
    const tool = db.tools[toolId];

    if(!tool) return;

    if(!db.history) db.history = [];
    db.history.push({
        id: 'hist_' + Date.now(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        tool_id: toolId,
        tool_name: tool.name,
        mat_id: matId,
        mat_name: db.materials[matId]?.name || matId,
        prof_id: profId,
        prof_name: db.profiles[profId]?.name || profId,
        mach_id: machId,
        rpm: currentCalculatedResults.rpm.toFixed(0),
        vf: currentCalculatedResults.vf.toFixed(0)
    });

    if(db.history.length > 30) db.history.shift();
    saveDatabase();
    renderHistory();
    switchBottomTab('history');
}

export function loadFavorite(favId) {
    const fav = db.favorites.find(f => f.id === favId);
    if(!fav) return;
    if(fav.machine_id && document.getElementById('machine-select')) document.getElementById('machine-select').value = fav.machine_id;
    if(fav.material_id && document.getElementById('material-select')) document.getElementById('material-select').value = fav.material_id;
    if(fav.profile_id && document.getElementById('profile-select')) document.getElementById('profile-select').value = fav.profile_id;
    onMaterialOrProfileChange();
    if(fav.tool_id && document.getElementById('tool-select')) document.getElementById('tool-select').value = fav.tool_id;
    onToolChange();
    calculate();
}

export function deleteFavorite(favId) {
    db.favorites = db.favorites.filter(f => f.id !== favId);
    saveDatabase();
    renderFavorites();
}

export async function clearHistory() {
    if(await customConfirm("Verlauf leeren?")) {
        db.history = [];
        saveDatabase();
        renderHistory();
    }
}

// -------------------------------------------------------------
// Backup & JSON
// -------------------------------------------------------------
export function exportDatabaseJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `cncpilot_db_${Date.now()}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
}

export async function importDatabaseJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedDb = JSON.parse(e.target.result);
            if (importedDb && importedDb.tools) {
                db = importedDb;
                saveDatabase();
                initApp();
                await customAlert("Erfolgreich importiert!");
            }
        } catch (err) {
            await customAlert("Fehler beim Lesen.");
        }
    };
    reader.readAsText(file);
}

export function triggerMatchmaker() {
    const machId = document.getElementById('mm-machine-select')?.value || document.getElementById('machine-select')?.value;
    const matId = document.getElementById('mm-material-select')?.value || document.getElementById('material-select')?.value;
    const rigId = document.getElementById('rigidity-select')?.value || 'mittel';
    runMatchmaker(db, machId, matId, rigId);
}

// -------------------------------------------------------------
// Globale Registrierungen (Window-Zuweisung)
// -------------------------------------------------------------
window.toggleExpertMode = toggleExpertMode;
window.toggleAdmin = toggleAdmin;
window.switchAdminTab = switchAdminTab;
window.switchBottomTab = switchBottomTab;
window.toggleBottomSection = toggleBottomSection;
window.calculate = calculate;
window.onMaterialOrProfileChange = onMaterialOrProfileChange;
window.onBrandChange = onBrandChange;
window.onLineChange = onLineChange;
window.onToolChange = onToolChange;
window.toggleRegrindFields = toggleRegrindFields;
window.syncApFromSlider = syncApFromSlider;
window.syncApFromInput = syncApFromInput;
window.syncAeFromSlider = syncAeFromSlider;
window.syncAeFromInput = syncAeFromInput;
window.renderFavorites = renderFavorites;
window.loadFavorite = loadFavorite;
window.deleteFavorite = deleteFavorite;
window.clearHistory = clearHistory;
window.submitFeedback = submitFeedback;
window.confirmAndPushToHistory = confirmAndPushToHistory;
window.saveSupabaseConfig = () => saveSupabaseConfig(handleSupabaseData);
window.exportDatabaseJSON = exportDatabaseJSON;
window.importDatabaseJSON = importDatabaseJSON;
window.triggerMatchmaker = triggerMatchmaker;
window.syncMmToExpert = syncMmToExpert;

// LEISE ÜBERNAHME: Werte werden synchronisiert, Nerd-Modus bleibt geschlossen!
window.applyMatchmakerResult = (toolId, apSuggested, aeSuggested) => {
    const mmMach = document.getElementById('mm-machine-select')?.value;
    const mmMat = document.getElementById('mm-material-select')?.value;
    const mmProf = document.getElementById('mm-profile-select')?.value;
    
    if (mmMach) document.getElementById('machine-select').value = mmMach;
    if (mmMat) document.getElementById('material-select').value = mmMat;
    if (mmProf) document.getElementById('profile-select').value = mmProf;
    
    window.onMaterialOrProfileChange();
    
    const tool = db.tools[toolId];
    if(tool) {
        if(tool.brand && document.getElementById('brand-select')) document.getElementById('brand-select').value = tool.brand;
        if(tool.line && document.getElementById('line-select')) document.getElementById('line-select').value = tool.line;
        if(document.getElementById('tool-select')) document.getElementById('tool-select').value = toolId;
        window.onToolChange();
    }

    if (typeof apSuggested === 'number' && apSuggested > 0) {
        document.getElementById('input-ap-mm').value = apSuggested.toFixed(2);
        if (document.getElementById('slider-ap')) document.getElementById('slider-ap').value = apSuggested;
    }
    if (typeof aeSuggested === 'number' && aeSuggested > 0) {
        document.getElementById('input-ae-mm').value = aeSuggested.toFixed(2);
        if (document.getElementById('slider-ae')) document.getElementById('slider-ae').value = aeSuggested;
    }

    calculate();

    // Optisches Feedback direkt auf der gewählten Karte
    document.querySelectorAll('[id^="match-card-"]').forEach(card => {
        card.classList.remove('ring-2', 'ring-emerald-500', 'border-emerald-500');
    });
    const activeCard = document.getElementById(`match-card-${toolId}`);
    if (activeCard) {
        activeCard.classList.add('ring-2', 'ring-emerald-500', 'border-emerald-500');
    }
};

// Admin Werkzeug-Handler
window.renderAdminToolTable = () => renderAdminToolTable(db);
window.editToolFromAdmin = (id) => editToolFromAdmin(id, db);
window.resetToolForm = resetToolForm;
window.saveToolFromForm = () => saveToolFromForm(db, () => { saveDatabase(); populateDropdowns(); });
window.deleteToolAdmin = async (id) => {
    if(await customConfirm("Werkzeug löschen?")) {
        delete db.tools[id];
        saveDatabase();
        populateDropdowns();
        renderAdminToolTable(db);
    }
};
window.toggleToolGeoFields = toggleToolGeoFields;

// Admin Maschinen, Material, Profile
window.addNewMachine = () => addNewMachine(db, () => { saveDatabase(); populateDropdowns(); renderAdminMachinesList(db); });
window.addNewMaterial = () => addNewMaterial(db, () => { saveDatabase(); populateDropdowns(); renderAdminMaterialsList(db); });
window.addNewProfile = () => addNewProfile(db, () => { saveDatabase(); populateDropdowns(); renderAdminProfilesList(db); });

function handleSupabaseData(data) {
    if (!data) return;
    if (data.machines && Object.keys(data.machines).length > 0) db.machines = Object.assign({}, defaultDb.machines, data.machines);
    if (data.materials && Object.keys(data.materials).length > 0) db.materials = Object.assign({}, defaultDb.materials, data.materials);
    if (data.rigidity && Object.keys(data.rigidity).length > 0) db.rigidity = Object.assign({}, defaultDb.rigidity, data.rigidity);
    if (data.profiles && Object.keys(data.profiles).length > 0) db.profiles = Object.assign({}, defaultDb.profiles, data.profiles);
    if (data.tools && Object.keys(data.tools).length > 0) db.tools = Object.assign({}, defaultDb.tools, data.tools);
    if (data.appStateData) {
        if (data.appStateData.history) db.history = data.appStateData.history;
        if (data.appStateData.favorites) db.favorites = data.appStateData.favorites;
        if (data.appStateData.swarm_data) db.swarm_data = data.appStateData.swarm_data;
    }
    localStorage.setItem('toolpilot_master_db', JSON.stringify(db));
    initApp();
}

function initApp() {
    populateDropdowns();
    resetSliders(); 
    renderFavorites();
    renderHistory();
    renderAdminToolTable(db);
    triggerMatchmaker();
}

initSupabase(handleSupabaseData);
initApp();
