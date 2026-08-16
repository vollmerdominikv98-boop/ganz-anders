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
            if (parsed && parsed.tools && Object.keys(parsed.tools).length >= 1) {
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
// UI Initialisierung & Navigation
// -------------------------------------------------------------
export function initApp() {
    populateDropdowns();
    resetSliders(); 
    renderFavorites();
    renderHistory();
    renderAdminToolTable(db);
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

export function toggleCamCalc() {
    const content = document.getElementById('cam-calc-content');
    const arrow = document.getElementById('cam-calc-arrow');
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        arrow.innerText = '▲';
    } else {
        content.classList.add('hidden');
        arrow.innerText = '▼';
    }
}

// -------------------------------------------------------------
// Dropdowns & Selektoren
// -------------------------------------------------------------
export function populateDropdowns() {
    const machSel = document.getElementById('machine-select');
    machSel.innerHTML = '';
    for (const [id, m] of Object.entries(db.machines || {})) {
        machSel.add(new Option(m.name, id));
    }

    const matSel = document.getElementById('material-select');
    matSel.innerHTML = '';
    for (const [id, m] of Object.entries(db.materials || {})) {
        matSel.add(new Option(m.name, id));
    }

    const profSel = document.getElementById('profile-select');
    profSel.innerHTML = '';
    for (const [id, p] of Object.entries(db.profiles || {})) {
        profSel.add(new Option(p.name, id));
    }

    const rigSel = document.getElementById('rigidity-select');
    rigSel.innerHTML = '';
    for (const [id, r] of Object.entries(db.rigidity || {})) {
        rigSel.add(new Option(`${r.name} (Faktor: ${r.factor})`, id));
    }
    if(db.rigidity && db.rigidity["mittel"]) rigSel.value = "mittel";

    renderToolMatrixInputs();
    renderProfileCheckboxes();
    populateBrandDropdown();
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
    const selectedMat = document.getElementById('material-select').value;
    const selectedProf = document.getElementById('profile-select').value;
    const brandSel = document.getElementById('brand-select');
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
    const selectedMat = document.getElementById('material-select').value;
    const selectedProf = document.getElementById('profile-select').value;
    const selectedBrand = document.getElementById('brand-select').value;
    const lineSel = document.getElementById('line-select');
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
    const selectedMat = document.getElementById('material-select').value;
    const selectedProf = document.getElementById('profile-select').value;
    const selectedBrand = document.getElementById('brand-select').value;
    const selectedLine = document.getElementById('line-select').value;
    const toolSel = document.getElementById('tool-select');
    
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
    const toolId = document.getElementById('tool-select').value;
    if(!db.tools) return;
    const tool = db.tools[toolId];
    if(tool) {
        if(tool.brand) {
            document.getElementById('brand-select').value = tool.brand;
            onBrandChange();
        }
        if(tool.line) {
            document.getElementById('line-select').value = tool.line;
            onLineChange();
            document.getElementById('tool-select').value = toolId;
        }
        document.getElementById('input-d-ist').value = tool.diameter.toFixed(2);
        document.getElementById('input-r-ist').value = (tool.radius || 0).toFixed(2);
    }
    resetSliders();
}

export function toggleRegrindFields() {
    const active = document.getElementById('regrind-toggle').checked;
    const container = document.getElementById('regrind-container');
    const toolId = document.getElementById('tool-select').value;
    if(!db.tools) return;
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
// Slider & Shortcuts
// -------------------------------------------------------------
export function resetSliders() {
    if(!db.tools || !db.profiles) return;
    const toolId = document.getElementById('tool-select').value;
    const profId = document.getElementById('profile-select').value;
    const t = db.tools[toolId];
    const p = db.profiles[profId];
    
    if (t && p) {
        let D = t.diameter;
        if (document.getElementById('regrind-toggle').checked) {
            D = parseFloat(document.getElementById('input-d-ist').value) || D;
        }
        
        const Lmax = t.max_overhang || (D * 3);
        const apS = document.getElementById('slider-ap');
        const aeS = document.getElementById('slider-ae');
        
        apS.max = Lmax.toFixed(2);
        aeS.max = D.toFixed(2);
        
        let targetAp = D * p.ap_factor;
        let targetAe = D * p.ae_factor;

        if (profId === 'schlichten_gehaertet') {
            targetAp = Math.min(D * p.ap_factor, 0.25); 
            targetAe = Math.min(D * p.ae_factor, 0.20); 
        }
        
        document.getElementById('input-ap-mm').value = targetAp.toFixed(2);
        apS.value = targetAp.toFixed(2);
        document.getElementById('input-ae-mm').value = targetAe.toFixed(2);
        aeS.value = targetAe.toFixed(2);
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

export function setApShortcut(value) {
    if(!db.tools) return;
    const toolId = document.getElementById('tool-select').value;
    const tool = db.tools[toolId];
    if(!tool) return;

    let D = tool.diameter;
    if(document.getElementById('regrind-toggle').checked) {
        D = parseFloat(document.getElementById('input-d-ist').value) || D;
    }

    let val = value >= 0.5 ? D * value : value;
    document.getElementById('input-ap-mm').value = val.toFixed(2);
    document.getElementById('slider-ap').value = val.toFixed(2);
    calculate();
}

export function setAeShortcut(value) {
    if(!db.tools) return;
    const toolId = document.getElementById('tool-select').value;
    const tool = db.tools[toolId];
    if(!tool) return;

    let D = tool.diameter;
    if(document.getElementById('regrind-toggle').checked) {
        D = parseFloat(document.getElementById('input-d-ist').value) || D;
    }

    let val = value >= 0.5 ? D * value : value;
    document.getElementById('input-ae-mm').value = val.toFixed(2);
    document.getElementById('slider-ae').value = val.toFixed(2);
    calculate();
}

// -------------------------------------------------------------
// Haupt-Berechnung & CAM
// -------------------------------------------------------------
export function calculateCamFeed() {
    if(!db.tools) return;
    const toolId = document.getElementById('tool-select').value;
    const tool = db.tools[toolId];
    const isRegrind = document.getElementById('regrind-toggle').checked;
    const rInput = document.getElementById('input-cam-r');
    const resPercent = document.getElementById('res-cam-percent');
    const warning = document.getElementById('cam-calc-warning');

    if (!tool || !rInput) return;

    let D = tool.diameter;
    if (isRegrind) {
        const customD = parseFloat(document.getElementById('input-d-ist').value);
        if (!isNaN(customD) && customD > 0) D = customD;
    }

    const rTool = D / 2;
    const rContour = parseFloat(rInput.value);

    if (isNaN(rContour) || rContour <= 0) {
        resPercent.innerText = "-- %";
        warning.classList.add('hidden');
        return;
    }

    if (rContour <= rTool) {
        resPercent.innerText = "0 %";
        warning.innerHTML = `⚠️ Kontur-Radius (${rContour} mm) ist zu klein/exakt gleich für Fräser (R${rTool} mm)!`;
        warning.classList.remove('hidden');
        resPercent.classList.replace('bg-emerald-50', 'bg-rose-50');
        resPercent.classList.replace('text-emerald-700', 'text-rose-700');
        resPercent.classList.replace('border-emerald-200', 'border-rose-200');
    } else {
        const percent = ((rContour - rTool) / rContour) * 100;
        resPercent.innerText = percent.toFixed(1) + " %";
        warning.classList.add('hidden');
        resPercent.classList.replace('bg-rose-50', 'bg-emerald-50');
        resPercent.classList.replace('text-rose-700', 'text-emerald-700');
        resPercent.classList.replace('border-rose-200', 'border-emerald-200');
    }
}

export function calculate() {
    const res = calculatePhysics({
        db,
        machId: document.getElementById('machine-select').value,
        matId: document.getElementById('material-select').value,
        profId: document.getElementById('profile-select').value,
        toolId: document.getElementById('tool-select').value,
        rigId: document.getElementById('rigidity-select').value,
        holderType: document.getElementById('holder-select').value,
        physicsActive: document.getElementById('physics-toggle').checked,
        isRegrind: document.getElementById('regrind-toggle').checked,
        customD: parseFloat(document.getElementById('input-d-ist').value),
        customR: parseFloat(document.getElementById('input-r-ist').value),
        ap: parseFloat(document.getElementById('input-ap-mm').value) || 0.01,
        ae: parseFloat(document.getElementById('input-ae-mm').value) || 0.01
    });

    if(!res) {
        document.getElementById('res-rpm').innerText = "-- U/min";
        document.getElementById('res-vf').innerText = "-- mm/min";
        document.getElementById('res-apae').innerText = "-- / -- mm";
        document.getElementById('res-q').innerText = "-- cm³/min";
        document.getElementById('res-power').innerText = "-- kW";
        document.getElementById('res-torque').innerText = "-- Nm";
        document.getElementById('res-fc').innerText = "-- N";
        document.getElementById('res-stress').innerText = "-- MPa";
        return;
    }

    currentCalculatedResults = res;

    document.getElementById('val-ap-factor').innerText = `(${res.ap_factor.toFixed(2)} × D)`;
    document.getElementById('val-ae-factor').innerText = `(${res.ae_factor.toFixed(2)} × D)`;

    const warningBox = document.getElementById('calc-warnings');
    if (res.warnings.length > 0) {
        warningBox.innerHTML = res.warnings.join('');
        warningBox.classList.remove('hidden');
    } else {
        warningBox.innerHTML = '';
        warningBox.classList.add('hidden');
    }

    document.getElementById('physics-info').innerHTML = res.physicsInfoHtml;

    const rpmEl = document.getElementById('res-rpm');
    const vfEl = document.getElementById('res-vf');
    const powerEl = document.getElementById('res-power');
    const torqueEl = document.getElementById('res-torque');
    const fcEl = document.getElementById('res-fc');
    const stressEl = document.getElementById('res-stress');

    rpmEl.innerText = res.rpm.toFixed(0) + " U/min";
    rpmEl.className = res.isOverRpm ? "text-xl font-black font-mono text-rose-600" : "text-xl font-black font-mono text-slate-900";
    document.getElementById('res-vc-eff').innerText = `vc(eff): ${res.vc_eff.toFixed(0)} m/min`;

    vfEl.innerText = res.vf.toFixed(0) + " mm/min";
    vfEl.className = res.isOverVf ? "text-xl font-black font-mono text-rose-600" : "text-xl font-black font-mono text-slate-900";
    document.getElementById('res-fz-eff').innerText = `fz(eff): ${res.fz_eff.toFixed(4)} mm`;

    document.getElementById('res-apae').innerText = res.ap.toFixed(2) + " / " + res.ae.toFixed(2) + " mm";
    
    if (res.q < 0.01) {
        document.getElementById('res-q').innerText = res.q_mm3.toFixed(1) + " mm³/min";
    } else {
        document.getElementById('res-q').innerText = res.q.toFixed(2) + " cm³/min";
    }

    if (res.power < 0.01) {
        powerEl.innerText = (res.power * 1000).toFixed(1) + " W";
        powerEl.className = "text-base font-bold font-mono text-slate-800";
    } else {
        powerEl.innerText = res.power.toFixed(2) + " kW";
        powerEl.className = res.isOverPower ? "text-base font-bold font-mono text-rose-600 animate-pulse" : "text-base font-bold font-mono text-slate-800";
    }

    if(torqueEl) {
        torqueEl.innerText = res.torque < 0.1 ? res.torque.toFixed(2) + " Nm" : res.torque.toFixed(1) + " Nm";
        torqueEl.className = res.isOverTorque ? "text-base font-bold font-mono text-rose-600 animate-pulse" : "text-base font-bold font-mono text-slate-800";
    }

    fcEl.innerText = Math.max(res.fc, 1).toFixed(0) + " N";
    
    if(stressEl) {
        stressEl.innerHTML = Math.max(res.stress, 1).toFixed(0) + " MPa";
        if (res.stress > 2500) stressEl.className = "text-base font-bold font-mono text-rose-600 animate-pulse";
        else if (res.stress > 1500) stressEl.className = "text-base font-bold font-mono text-amber-600";
        else stressEl.className = "text-base font-bold font-mono text-slate-800";
    }

    calculateCamFeed();
}

// -------------------------------------------------------------
// Favoriten & Verlauf
// -------------------------------------------------------------
export function renderFavorites() {
    const container = document.getElementById('tab-content-favorites');
    const searchInput = document.getElementById('fav-search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    container.innerHTML = '';
    
    let filteredFavs = db.favorites || [];
    if (query !== '') {
        filteredFavs = filteredFavs.filter(f => 
            f.title.toLowerCase().includes(query) || 
            (f.feedback && f.feedback.toLowerCase().includes(query))
        );
    }

    if (filteredFavs.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-400 italic col-span-4">Keine passenden Favoriten gefunden.</div>`;
        return;
    }

    filteredFavs.forEach(fav => {
        const card = document.createElement('div');
        card.className = "bg-slate-50 p-3.5 rounded-xl border border-slate-200 hover:border-slate-400 transition flex flex-col justify-between space-y-2 shadow-sm";
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start">
                    <span class="font-bold text-slate-900 text-xs truncate">${fav.title}</span>
                    <span class="text-amber-500 text-[10px] flex-shrink-0">${'⭐'.repeat(fav.rating)}</span>
                </div>
                <p class="text-[11px] text-slate-500 mt-1 italic truncate">"${fav.feedback || 'Keine Notiz'}"</p>
                <div class="text-[10px] text-slate-600 mt-2 space-y-0.5 font-mono">
                    <div>n: <strong class="text-slate-900">${fav.rpm} U/min</strong> | vf: <strong class="text-slate-900">${fav.feed_rate_vf} mm/min</strong></div>
                </div>
            </div>
            <div class="flex gap-2 pt-1">
                <button onclick="loadFavorite('${fav.id}')" class="flex-1 bg-white hover:bg-slate-100 text-slate-800 text-xs py-1 rounded-lg border border-slate-200 font-semibold transition">Laden</button>
                <button onclick="deleteFavorite('${fav.id}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs px-2.5 rounded-lg border border-rose-200 transition">🗑️</button>
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
    countEl.innerText = db.history.length;
    container.innerHTML = '';

    if (db.history.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-400 italic col-span-4">Noch kein Verlauf aufgezeichnet. Klicke oben auf "✔ Bestätigen", um Setups hier zu sichern!</div>`;
        return;
    }

    db.history.slice(-30).reverse().forEach(item => {
        const card = document.createElement('div');
        card.className = "bg-slate-50 p-3.5 rounded-xl border border-slate-200 hover:border-slate-400 transition flex flex-col justify-between space-y-3 shadow-sm";
        
        const hasFeedback = !!item.feedback_status;
        const feedbackHtml = hasFeedback 
            ? `<div class="w-full text-center bg-slate-100 border border-slate-200 text-slate-500 text-[10px] py-1.5 rounded-lg font-bold">✔ Feedback gesendet</div>`
            : `<div id="feedback-actions-${item.id}" class="flex gap-1.5 w-full">
                   <button onclick="submitFeedback('${item.id}', 'success')" class="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] py-1.5 rounded-lg font-bold transition">🟢 Top</button>
                   <button onclick="submitFeedback('${item.id}', 'chatter')" class="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[10px] py-1.5 rounded-lg font-bold transition">🟡 Rattert</button>
                   <button onclick="submitFeedback('${item.id}', 'break')" class="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] py-1.5 rounded-lg font-bold transition">🔴 Bruch</button>
               </div>
               <div id="feedback-done-${item.id}" class="hidden w-full text-center bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] py-1.5 rounded-lg font-bold">✔ Feedback gesendet</div>`;

        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start">
                    <span class="font-bold text-slate-900 text-xs truncate">${item.tool_name || 'Berechnung'}</span>
                    <span class="text-[9px] text-slate-400 font-mono">${item.time}</span>
                </div>
                <div class="text-[10px] text-slate-500 mt-1 truncate">${item.mat_name} | ${item.prof_name}</div>
                <div class="text-[10px] text-slate-700 mt-2 space-y-0.5 font-mono">
                    <div>n: <strong class="text-slate-900">${item.rpm} U/min</strong> | vf: <strong class="text-slate-900">${item.vf} mm/min</strong></div>
                </div>
            </div>
            <div class="space-y-2 pt-2 border-t border-slate-200">
                ${feedbackHtml}
                <div class="flex gap-2">
                    <button onclick="loadHistoryItem('${item.id}')" class="flex-1 bg-white hover:bg-slate-100 text-slate-800 text-[10px] py-1.5 rounded-lg border border-slate-200 font-semibold transition">🔄 Laden</button>
                    <button onclick="saveHistoryAsFavorite('${item.id}')" class="flex-1 bg-slate-800 hover:bg-slate-900 text-white text-[10px] py-1.5 rounded-lg font-semibold transition">⭐ Favorit</button>
                </div>
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
        db.swarm_data.push({
            tool_id: item.tool_id,
            mat_id: item.mat_id,
            prof_id: item.prof_id,
            status: status,
            timestamp: Date.now()
        });

        saveDatabase();
        calculate();
    }

    const actionsEl = document.getElementById(`feedback-actions-${id}`);
    const doneEl = document.getElementById(`feedback-done-${id}`);
    if (actionsEl) actionsEl.classList.add('hidden');
    if (doneEl) doneEl.classList.remove('hidden');
}

export async function confirmAndPushToHistory() {
    if(!db.machines || !db.tools || !db.materials || !db.profiles) return;
    const machId = document.getElementById('machine-select').value;
    const matId = document.getElementById('material-select').value;
    const profId = document.getElementById('profile-select').value;
    const toolId = document.getElementById('tool-select').value;
    const rigId = document.getElementById('rigidity-select').value;
    
    const mach = db.machines[machId];
    const mat = db.materials[matId];
    const profile = db.profiles[profId];
    const tool = db.tools[toolId];

    if(!mach || !tool || !mat || !profile) return await customAlert("Bitte wähle alle Konfigurationsparameter aus.");

    const ap = parseFloat(document.getElementById('input-ap-mm').value) || 0.01;
    const ae = parseFloat(document.getElementById('input-ae-mm').value) || 0.01;

    if(!db.history) db.history = [];
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const historyItem = {
        id: 'hist_' + Date.now(),
        time: timeStr,
        tool_id: toolId,
        tool_name: tool.name,
        mat_id: matId,
        mat_name: mat.name,
        prof_id: profId,
        prof_name: profile.name,
        mach_id: machId,
        rigidity_id: rigId,
        ap: ap.toFixed(2),
        ae: ae.toFixed(2),
        rpm: currentCalculatedResults.rpm.toFixed(0),
        vf: currentCalculatedResults.vf.toFixed(0),
        fc: currentCalculatedResults.fc.toFixed(0),
        stress: currentCalculatedResults.stress.toFixed(0),
        rating: 5,
        note: ""
    };

    db.history.push(historyItem);
    if(db.history.length > 30) db.history.shift();

    saveDatabase();
    renderHistory();
    switchBottomTab('history');
}

export function loadHistoryItem(id) {
    const item = db.history.find(h => h.id === id);
    if(!item) return;

    if(db.machines && db.machines[item.mach_id]) document.getElementById('machine-select').value = item.mach_id;
    if(db.materials && db.materials[item.mat_id]) document.getElementById('material-select').value = item.mat_id;
    if(db.profiles && db.profiles[item.prof_id]) document.getElementById('profile-select').value = item.prof_id;
    
    onMaterialOrProfileChange();

    if(db.tools && db.tools[item.tool_id]) {
        const t = db.tools[item.tool_id];
        if(t.brand) {
            document.getElementById('brand-select').value = t.brand;
            onBrandChange();
        }
        if(t.line) {
            document.getElementById('line-select').value = t.line;
            onLineChange();
        }
        document.getElementById('tool-select').value = item.tool_id;
    }

    if(db.rigidity && item.rigidity_id && db.rigidity[item.rigidity_id]) document.getElementById('rigidity-select').value = item.rigidity_id;

    document.getElementById('input-ap-mm').value = item.ap;
    document.getElementById('slider-ap').value = item.ap;
    document.getElementById('input-ae-mm').value = item.ae;
    document.getElementById('slider-ae').value = item.ae;

    calculate();
}

export async function saveHistoryAsFavorite(id) {
    const item = db.history.find(h => h.id === id);
    if(!item) return;

    const rating = 5;
    let note = "Aus Verlauf übernommen";
    if (item.feedback_status === 'success') note = "Lief wie Butter";
    else if (item.feedback_status === 'chatter') note = "Hat leicht gerattert";
    else if (item.feedback_status === 'break') note = "Bruch / Verschleiß";

    item.rating = rating;
    item.note = note;

    if(!db.favorites) db.favorites = [];

    const newFav = {
        id: 'fav_' + Date.now(),
        title: `${item.tool_name} (${item.prof_name})`,
        tool_id: item.tool_id,
        material_id: item.mat_id,
        profile_id: item.prof_id,
        rigidity_id: item.rigidity_id,
        machine_id: item.mach_id,
        ap_mm: parseFloat(item.ap),
        ae_mm: parseFloat(item.ae),
        rating: rating,
        feedback: note,
        rpm: parseFloat(item.rpm),
        feed_rate_vf: parseFloat(item.vf)
    };

    db.favorites.push(newFav);
    saveDatabase();
    renderFavorites();
    switchBottomTab('favorites');
    await customAlert('Erfolgreich als Favorit gespeichert!');
}

export async function clearHistory() {
    if(await customConfirm("Verlauf wirklich leeren?")) {
        db.history = [];
        saveDatabase();
        renderHistory();
    }
}

export function loadFavorite(favId) {
    const fav = db.favorites.find(f => f.id === favId);
    if(!fav) return;

    if(db.machines && fav.machine_id && db.machines[fav.machine_id]) {
        document.getElementById('machine-select').value = fav.machine_id;
    }
    if(db.rigidity && fav.rigidity_id && db.rigidity[fav.rigidity_id]) {
        document.getElementById('rigidity-select').value = fav.rigidity_id;
    }

    if(db.materials && db.materials[fav.material_id]) document.getElementById('material-select').value = fav.material_id;
    if(db.profiles && db.profiles[fav.profile_id]) document.getElementById('profile-select').value = fav.profile_id;
    
    onMaterialOrProfileChange();

    if(db.tools && db.tools[fav.tool_id]) {
        const t = db.tools[fav.tool_id];
        if(t.brand) {
            document.getElementById('brand-select').value = t.brand;
            onBrandChange();
        }
        if(t.line) {
            document.getElementById('line-select').value = t.line;
            onLineChange();
        }
        document.getElementById('tool-select').value = fav.tool_id;
    }
    
    if(db.tools) {
        const tool = db.tools[fav.tool_id];
        if(tool) {
            const D = tool.diameter;
            const apVal = fav.ap_mm !== undefined ? fav.ap_mm : (fav.ap_factor !== undefined ? fav.ap_factor * D : D);
            const aeVal = fav.ae_mm !== undefined ? fav.ae_mm : (fav.ae_factor !== undefined ? fav.ae_factor * D : D * 0.5);

            document.getElementById('input-ap-mm').value = apVal.toFixed(2);
            document.getElementById('slider-ap').value = apVal.toFixed(2);

            document.getElementById('input-ae-mm').value = aeVal.toFixed(2);
            document.getElementById('slider-ae').value = aeVal.toFixed(2);
        }
    }

    calculate();
}

export function deleteFavorite(favId) {
    db.favorites = db.favorites.filter(f => f.id !== favId);
    saveDatabase();
    renderFavorites();
}

// -------------------------------------------------------------
// Backup & Werkseinstellungen
// -------------------------------------------------------------
export function exportDatabaseJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `cncpilot_db_export_${Date.now()}.json`);
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
            if (importedDb && importedDb.tools && importedDb.materials) {
                db = importedDb;
                if(!db.history) db.history = [];
                if(!db.favorites) db.favorites = [];
                if(!db.swarm_data) db.swarm_data = [];
                saveDatabase();
                initApp();
                await customAlert("Datenbank erfolgreich importiert & synchronisiert!");
            } else {
                await customAlert("Ungültiges Dateiformat.");
            }
        } catch (err) {
            await customAlert("Fehler beim Lesen der JSON-Datei.");
        }
    };
    reader.readAsText(file);
}

export async function resetToDefaultData() {
    if(await customConfirm("Datenbank auf Werkseinstellungen zurücksetzen? Dies überschreibt auch die Cloud-Datenbank!")) {
        db = JSON.parse(JSON.stringify(defaultDb));
        saveDatabase();
        initApp();
        await customAlert("Erfolgreich zurückgesetzt!");
    }
}

// -------------------------------------------------------------
// Globale Funktionszuweisung (für inline HTML onclick-Events)
// -------------------------------------------------------------
window.toggleMatchmaker = () => {
    const panel = document.getElementById('matchmaker-panel');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        
        const machSel = document.getElementById('mm-machine-select');
        machSel.innerHTML = '';
        for (const [id, m] of Object.entries(db.machines || {})) { machSel.add(new Option(m.name, id)); }
        machSel.value = document.getElementById('machine-select').value; 

        const matSel = document.getElementById('mm-material-select');
        matSel.innerHTML = '';
        for (const [id, m] of Object.entries(db.materials || {})) { matSel.add(new Option(m.name, id)); }
        matSel.value = document.getElementById('material-select').value;

        const profSel = document.getElementById('mm-profile-select');
        profSel.innerHTML = '';
        for (const [id, p] of Object.entries(db.profiles || {})) { profSel.add(new Option(p.name, id)); }
        profSel.value = document.getElementById('profile-select').value;

    } else {
        panel.classList.add('hidden');
    }
};

window.runMatchmaker = () => {
    const machId = document.getElementById('mm-machine-select').value;
    const matId = document.getElementById('mm-material-select').value;
    const rigId = document.getElementById('rigidity-select').value; 
    runMatchmaker(db, machId, matId, rigId);
};

window.applyMatchmakerResult = (toolId) => {
    document.getElementById('machine-select').value = document.getElementById('mm-machine-select').value;
    document.getElementById('material-select').value = document.getElementById('mm-material-select').value;
    document.getElementById('profile-select').value = document.getElementById('mm-profile-select').value;
    
    window.onMaterialOrProfileChange();
    
    const tool = db.tools[toolId];
    if(tool) {
        if(tool.brand) {
            document.getElementById('brand-select').value = tool.brand;
            window.onBrandChange();
        }
        if(tool.line) {
            document.getElementById('line-select').value = tool.line;
            window.onLineChange();
        }
        document.getElementById('tool-select').value = toolId;
        window.onToolChange();
    }
    
    document.getElementById('matchmaker-panel').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.toggleAdmin = toggleAdmin;
window.switchAdminTab = switchAdminTab;
window.switchBottomTab = switchBottomTab;
window.toggleBottomSection = toggleBottomSection;
window.toggleCamCalc = toggleCamCalc;
window.calculateCamFeed = calculateCamFeed;
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
window.setApShortcut = setApShortcut;
window.setAeShortcut = setAeShortcut;
window.renderFavorites = renderFavorites;
window.loadFavorite = loadFavorite;
window.deleteFavorite = deleteFavorite;
window.loadHistoryItem = loadHistoryItem;
window.saveHistoryAsFavorite = saveHistoryAsFavorite;
window.clearHistory = clearHistory;
window.submitFeedback = submitFeedback;
window.confirmAndPushToHistory = confirmAndPushToHistory;
window.saveSupabaseConfig = () => saveSupabaseConfig(handleSupabaseData);
window.exportDatabaseJSON = exportDatabaseJSON;
window.importDatabaseJSON = importDatabaseJSON;
window.resetToDefaultData = resetToDefaultData;

// Admin Werkzeug-Handler
window.renderAdminToolTable = () => renderAdminToolTable(db);
window.editToolFromAdmin = (id) => editToolFromAdmin(id, db);
window.resetToolForm = resetToolForm;
window.saveToolFromForm = () => saveToolFromForm(db, () => { saveDatabase(); populateDropdowns(); });
window.duplicateToolAdmin = (id) => {
    const source = db.tools[id];
    if(!source) return;
    const copy = JSON.parse(JSON.stringify(source));
    copy.name += " (Kopie)";
    db.tools['tool_' + Date.now()] = copy;
    saveDatabase();
    populateDropdowns();
    renderAdminToolTable(db);
};
window.deleteToolAdmin = async (id) => {
    if(await customConfirm("Werkzeug wirklich löschen?")) {
        delete db.tools[id];
        saveDatabase();
        populateDropdowns();
        renderAdminToolTable(db);
    }
};
window.toggleToolGeoFields = toggleToolGeoFields;

// Admin Maschinen-Handler
window.addNewMachine = () => addNewMachine(db, () => { saveDatabase(); populateDropdowns(); renderAdminMachinesList(db); });
window.deleteMachineAdmin = async (id) => {
    if(Object.keys(db.machines || {}).length <= 1) return await customAlert('Mindestens eine Maschine ist nötig.');
    if(await customConfirm("Maschine wirklich löschen?")) {
        delete db.machines[id];
        saveDatabase();
        populateDropdowns();
        renderAdminMachinesList(db);
    }
};

// Admin Material-Handler
window.addNewMaterial = () => addNewMaterial(db, () => { saveDatabase(); populateDropdowns(); renderAdminMaterialsList(db); });
window.deleteMaterialAdmin = async (id) => {
    if(Object.keys(db.materials || {}).length <= 1) return await customAlert('Mindestens ein Material ist nötig.');
    if(await customConfirm("Material wirklich löschen?")) {
        delete db.materials[id];
        saveDatabase();
        populateDropdowns();
        renderAdminMaterialsList(db);
    }
};

// Admin Profil-Handler
window.addNewProfile = () => addNewProfile(db, () => { saveDatabase(); populateDropdowns(); renderAdminProfilesList(db); });
window.deleteProfileAdmin = async (id) => {
    if(Object.keys(db.profiles || {}).length <= 1) return await customAlert('Mindestens ein Profil ist nötig.');
    if(await customConfirm("Profil wirklich löschen?")) {
        delete db.profiles[id];
        saveDatabase();
        populateDropdowns();
        renderAdminProfilesList(db);
    }
};

function handleSupabaseData(data) {
    if (data.machines) db.machines = data.machines;
    if (data.materials) db.materials = data.materials;
    if (data.rigidity) db.rigidity = data.rigidity;
    if (data.profiles) db.profiles = data.profiles;
    if (data.tools) db.tools = data.tools;
    if (data.appStateData) {
        if (data.appStateData.history) db.history = data.appStateData.history;
        if (data.appStateData.favorites) db.favorites = data.appStateData.favorites;
        if (data.appStateData.swarm_data) db.swarm_data = data.appStateData.swarm_data;
    }
    localStorage.setItem('toolpilot_master_db', JSON.stringify(db));
    initApp();
}

// Start
initSupabase(handleSupabaseData);
initApp();
