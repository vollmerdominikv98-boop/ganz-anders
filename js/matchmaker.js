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

    // 1. Geometrische Vorfilterung (Radius & Auskragung)
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

    // 2. Physikalische Simulation
    let rankedResults = [];
    const profile = db.profiles[profId] || { ap_factor: 0.5, ae_factor: 0.5 };
    const isUserForcedAp = !isNaN(customAp) && customAp > 0;

    validTools.forEach(toolId => {
        const tool = db.tools[toolId];
        const D = tool.diameter;
        const Lmax = tool.max_overhang || (D * 3);
        const ld_ratio = Lmax / D;
        
        // Rattergrenze (Chatter Limit)
        const ap_krit = ld_ratio > 3.0 ? (D * Math.pow((3.0 / ld_ratio), 1.5)) : (D * 2.5);

        let ap_sim = 0;
        let passes = 1;

        if (isUserForcedAp) {
            // Nutzer erzwingt feste Schnitttiefe ap
            ap_sim = customAp;
            passes = Math.max(1, Math.ceil(depthInput / ap_sim));
        } else {
            // Automatische Rattervermeidung: Ermittle maximale stabile Schnitttiefe
            const max_profile_ap = D * profile.ap_factor;
            const safe_single_ap = Math.min(max_profile_ap, ap_krit * 0.95);
            
            passes = Math.max(1, Math.ceil(depthInput / safe_single_ap));
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
            // Qualitäts- & Stabilitätsbewertung
            let stabilityPenalty = 1.0;
            if (res.hasChatter) stabilityPenalty *= 0.15; // Massive Abwertung bei Rattergefahr
            if (res.isOverPower) stabilityPenalty *= 0.40;
            if (res.stress > 2500) stabilityPenalty *= 0.20;

            const effectiveRemovalRate = (res.q / passes) * stabilityPenalty;

            rankedResults.push({
                toolId: toolId,
                toolName: tool.name,
                brand: tool.brand,
                diameter: tool.diameter,
                q: res.q, 
                score: effectiveRemovalRate,
                rpm: res.rpm,
                vf: res.vf,
                ap: ap_sim,
                ae: ae_sim,
                passes: passes,
                isUserForcedAp: isUserForcedAp,
                power: res.power,
                hasChatter: res.hasChatter,
                ap_krit: res.ap_krit,
                stress: res.stress,
                isOverPower: res.isOverPower
            });
        }
    });

    // 3. Ranking nach Stabilität und Effizienz sortieren
    rankedResults.sort((a, b) => b.score - a.score);

    resultsContainer.innerHTML = '';
    if (rankedResults.length === 0) {
        resultsContainer.innerHTML = '<div class="text-xs text-amber-600 bg-amber-50 p-4 rounded-xl border border-amber-200">Keine Schnittdaten berechenbar.</div>';
        return;
    }

    // 4. Anzeige der Ergebnisse
    rankedResults.slice(0, 4).forEach((item, index) => { 
        const div = document.createElement('div');
        const isWinner = index === 0 && !item.hasChatter;
        const borderClass = item.hasChatter 
            ? "border-rose-300 bg-rose-50/40" 
            : (isWinner ? "border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-400 shadow-md" : "border-slate-200 bg-white");
        
        let statusBadge = '';
        if (item.hasChatter) {
            statusBadge = `<span class="bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-full text-[10px] font-bold">⚠️ Rattergefahr (${item.ap.toFixed(1)}mm > Limit ${item.ap_krit.toFixed(1)}mm)</span>`;
        } else if (item.isUserForcedAp) {
            statusBadge = `<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">🟢 100% Stabil (Erzwungenes ap = ${item.ap.toFixed(2)}mm)</span>`;
        } else if (item.passes > 1) {
            statusBadge = `<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">🟢 100% Stabil (${item.passes}× Z à ${item.ap.toFixed(2)}mm)</span>`;
        } else {
            statusBadge = `<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">🟢 100% Stabil (1 Schnitt à ${item.ap.toFixed(2)}mm)</span>`;
        }

        let topBadge = '';
        if (isWinner) {
            topBadge = `<span class="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">Top Empfehlung</span>`;
        } else if (item.hasChatter) {
            topBadge = `<span class="bg-rose-200 text-rose-900 px-2 py-0.5 rounded text-[10px] font-bold">Platz ${index + 1} (Instabil)</span>`;
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
                    <span>ap: <strong class="${item.hasChatter ? 'text-rose-600 font-black' : 'text-slate-800'}">${item.ap.toFixed(2)}mm</strong></span>
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
