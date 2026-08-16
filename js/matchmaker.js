import { calculatePhysics } from './physics.js';

export function runMatchmaker(db, machId, matId, rigId) {
    const depthInput = parseFloat(document.getElementById('mm-depth')?.value || 25);
    const radiusInput = parseFloat(document.getElementById('mm-radius')?.value || 5);
    const customAp = parseFloat(document.getElementById('mm-ap')?.value);
    const customAe = parseFloat(document.getElementById('mm-ae')?.value);
    const profId = document.getElementById('mm-profile-select')?.value;
    const resultsContainer = document.getElementById('mm-results');

    if (!resultsContainer || !db || !db.tools) return;

    if (isNaN(depthInput) || isNaN(radiusInput) || !profId || !matId || !machId) {
        resultsContainer.innerHTML = '<div class="text-xs text-slate-400 italic p-6 text-center">Bitte Werkstoff, Maschine & Profil auswählen.</div>';
        return;
    }

    let validTools = [];

    // 1. Geometrische Vorfilterung
    for (const [toolId, tool] of Object.entries(db.tools || {})) {
        if (tool.suitable_materials && tool.suitable_materials.length > 0 && !tool.suitable_materials.includes(matId)) continue;
        if (tool.suitable_profiles && tool.suitable_profiles.length > 0 && !tool.suitable_profiles.includes(profId)) continue;
        
        const maxD = radiusInput * 2;
        if (radiusInput > 0 && tool.diameter > maxD) continue; 
        
        const overhang = tool.max_overhang || (tool.diameter * 3);
        if (depthInput > 0 && overhang < depthInput) continue; 

        validTools.push(toolId);
    }

    if (validTools.length === 0) {
        resultsContainer.innerHTML = `<div class="text-xs text-rose-600 bg-rose-50 p-4 rounded-xl border border-rose-200">Kein passendes Werkzeug gefunden. Benötigt: max. Ø${(radiusInput * 2).toFixed(1)} mm, min. ${depthInput} mm Auskragung für dieses Material.</div>`;
        return;
    }

    // 2. Physikalische Simulation aller Treffer
    let rankedResults = [];
    const profile = db.profiles[profId] || { ap_factor: 0.5, ae_factor: 0.5 };
    const isUserForcedAp = !isNaN(customAp) && customAp > 0;

    validTools.forEach(toolId => {
        const tool = db.tools[toolId];
        const D = tool.diameter;
        const R = tool.radius || 0;
        const Lmax = tool.max_overhang || (D * 3);
        const ld_ratio = Lmax / D;

        // Physische Schneidenlänge lc
        let lc_max = tool.flute_len;
        if (!lc_max) {
            if (tool.geo_type === 'torus') lc_max = Math.max(R * 2, D * 1.0);
            else if (tool.geo_type === 'ball') lc_max = D * 0.5;
            else lc_max = D * 1.5;
        }

        // Maximale STABILE Schnitttiefe für diesen Fräser
        let ap_krit = 0;
        if (tool.geo_type === 'torus') {
            ap_krit = Math.min(D * 0.8, lc_max);
        } else if (tool.geo_type === 'ball') {
            ap_krit = R;
        } else {
            const ld_safe = Math.max(ld_ratio, 2.0);
            ap_krit = Math.min(D * (6.0 / Math.pow(ld_safe, 1.3)), lc_max);
        }

        let ap_sim = 0;
        let passes = 1;

        if (isUserForcedAp) {
            // Nutzer erzwingt Schnitttiefe
            ap_sim = customAp;
            passes = Math.max(1, Math.ceil(depthInput / ap_sim));
        } else {
            // KI ermittelt automatische, 100% ratterfreie Mehrebenen-Schritte
            const safe_step = Math.min(ap_krit * 0.95, lc_max * 0.95);
            passes = Math.max(1, Math.ceil(depthInput / safe_step));
            ap_sim = depthInput / passes;
        }

        const ae_sim = (!isNaN(customAe) && customAe > 0) ? customAe : (D * profile.ae_factor);

        const res = calculatePhysics({
            db,
            machId,
            matId,
            profId,
            toolId,
            rigId,
            holderType: 'spannzange', 
            physicsActive: true,
            isRegrind: false,
            ap: ap_sim,
            ae: ae_sim
        });

        if (res) {
            let stabilityPenalty = 1.0;
            if (res.isFluteExceeded) stabilityPenalty *= 0.05; // Fast komplett ausschließen bei Kollision
            if (res.hasChatter) stabilityPenalty *= 0.15;       // Starke Strafe bei Rattergefahr
            if (res.isOverPower) stabilityPenalty *= 0.40;
            if (res.stress > 2500) stabilityPenalty *= 0.20;

            const effectiveScore = (res.q / passes) * stabilityPenalty;

            rankedResults.push({
                toolId: toolId,
                toolName: tool.name,
                brand: tool.brand,
                diameter: tool.diameter,
                geoType: tool.geo_type || 'shaft',
                q: res.q, 
                score: effectiveScore,
                rpm: res.rpm,
                vf: res.vf,
                ap: ap_sim,
                ae: ae_sim,
                passes: passes,
                isUserForcedAp: isUserForcedAp,
                power: res.power,
                hasChatter: res.hasChatter,
                isFluteExceeded: res.isFluteExceeded,
                lc_max: res.lc_max,
                ap_krit: res.ap_krit,
                stress: res.stress,
                isOverPower: res.isOverPower
            });
        }
    });

    // 3. Ranking nach Stabilität & Zeitspanvolumen sortieren
    rankedResults.sort((a, b) => b.score - a.score);

    resultsContainer.innerHTML = '';
    if (rankedResults.length === 0) {
        resultsContainer.innerHTML = '<div class="text-xs text-amber-600 bg-amber-50 p-4 rounded-xl border border-amber-200">Keine Schnittdaten ermittelbar.</div>';
        return;
    }

    // 4. Anzeige der Ergebnisse
    rankedResults.slice(0, 4).forEach((item, index) => { 
        const div = document.createElement('div');
        const isFaulty = item.hasChatter || item.isFluteExceeded;
        const isWinner = index === 0 && !isFaulty;
        
        let borderClass = "border-slate-200 bg-white";
        if (item.isFluteExceeded) {
            borderClass = "border-rose-300 bg-rose-50/50";
        } else if (item.hasChatter) {
            borderClass = "border-amber-300 bg-amber-50/40";
        } else if (isWinner) {
            borderClass = "border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-400 shadow-md";
        }
        
        let statusBadge = '';
        if (item.isFluteExceeded) {
            statusBadge = `<span class="bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full text-[10px] font-bold">⛔ Schaftkollision (ap > Schneidenlänge ${item.lc_max.toFixed(1)}mm)</span>`;
        } else if (item.hasChatter) {
            statusBadge = `<span class="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-bold">⚠️ Rattergefahr (${item.ap.toFixed(1)}mm > Limit ${item.ap_krit.toFixed(1)}mm)</span>`;
        } else if (item.passes > 1) {
            statusBadge = `<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">🟢 100% Stabil (${item.passes}× Z à ${item.ap.toFixed(2)}mm)</span>`;
        } else {
            statusBadge = `<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">🟢 100% Stabil (1 Schnitt)</span>`;
        }

        let topBadge = '';
        if (isWinner) {
            topBadge = `<span class="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">Top Empfehlung</span>`;
        } else if (isFaulty) {
            topBadge = `<span class="bg-rose-200 text-rose-900 px-2 py-0.5 rounded text-[10px] font-bold">Platz ${index + 1} (Ungeeignet)</span>`;
        } else {
            topBadge = `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">Platz ${index + 1}</span>`;
        }

        div.className = `p-4 rounded-2xl border ${borderClass} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm transition hover:shadow-md`;
        div.innerHTML = `
            <div class="space-y-1.5">
                <div class="flex items-center gap-2 flex-wrap">
                    ${topBadge}
                    ${statusBadge}
                    <strong class="text-slate-900 text-sm">${item.brand ? `[${item.brand}] ` : ''}${item.toolName}</strong>
                </div>
                <div class="text-xs text-slate-500 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>Ø: <strong class="text-slate-800">${item.diameter}mm</strong></span>
                    <span>ap: <strong class="${isFaulty ? 'text-rose-600 font-black' : 'text-slate-800'}">${item.ap.toFixed(2)}mm</strong></span>
                    <span>ae: <strong class="text-slate-800">${item.ae.toFixed(2)}mm</strong></span>
                    <span>Pc: <strong>${item.power.toFixed(1)}kW</strong></span>
                </div>
            </div>
            <div class="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-slate-200/60 pt-2 sm:pt-0">
                <div class="text-left sm:text-right">
                    <div class="text-indigo-700 font-black font-mono text-base">${item.q.toFixed(1)} cm³/min</div>
                    <div class="text-[10px] font-mono text-slate-500">${item.rpm.toFixed(0)} U/min | ${item.vf.toFixed(0)} mm/min</div>
                </div>
                <button onclick="applyMatchmakerResult('${item.toolId}', ${item.ap}, ${item.ae})" class="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm whitespace-nowrap">
                    Laden & Details 👉
                </button>
            </div>
        `;
        resultsContainer.appendChild(div);
    });
}
