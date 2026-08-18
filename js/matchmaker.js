import { calculatePhysics, getChatterLimit } from './physics.js';
import { evaluateSwarmAI } from './swarm.js';
import { escapeHTML } from './config.js';

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
    for (const [toolId, tool] of Object.entries(db.tools || {})) {
        if (tool.suitable_materials && tool.suitable_materials.length > 0 && !tool.suitable_materials.includes(matId)) continue;
        if (tool.suitable_profiles && tool.suitable_profiles.length > 0 && !tool.suitable_profiles.includes(profId)) continue;
        if (radiusInput > 0 && tool.diameter > radiusInput * 2) continue; 
        if (depthInput > 0 && (tool.max_overhang || (tool.diameter * 3)) < depthInput) continue; 
        validTools.push(toolId);
    }

    if (validTools.length === 0) {
        resultsContainer.innerHTML = `<div class="text-xs text-rose-600 bg-rose-50 p-4 rounded-xl border border-rose-200 font-semibold">Kein passendes Werkzeug in deinem Bestand gefunden.</div>`;
        return;
    }

    let rankedResults = [];
    const profile = db.profiles[profId] || { ap_factor: 0.5, ae_factor: 0.5 };
    const isUserForcedAp = !isNaN(customAp) && customAp > 0;

    validTools.forEach(toolId => {
        const tool = db.tools[toolId];
        const D = tool.diameter;
        let lc_max = tool.flute_len || (tool.geo_type === 'torus' ? Math.max((tool.radius||0) * 2, D * 1.0) : (tool.geo_type === 'ball' ? D * 0.5 : D * 1.5));

        // ae zuerst bestimmen: eine kleine Schlicht-Zustellung senkt die Schnittkraft massiv
        // und erlaubt dadurch axial ein viel tieferes, ratterfreies ap (siehe getChatterLimit).
        let ae_sim = (!isNaN(customAe) && customAe > 0) ? customAe : (D * profile.ae_factor);
        if (profile.max_ae_limit) ae_sim = Math.min(ae_sim, profile.max_ae_limit);
        const ae_ratio_est = Math.min(ae_sim / D, 1.0);

        // Ebene 3: Einfahr-Faktor aus der Produktionshistorie dieser exakten Kombination
        const swarm = evaluateSwarmAI(db, toolId, matId, profId);

        const chatterLimit = getChatterLimit({
            D, Lmax: tool.max_overhang || (D * 3), geo_type: tool.geo_type, lc_max,
            ae_ratio: ae_ratio_est, mfrApSlot: tool.mfr_ap_slot, mfrApLight: tool.mfr_ap_light,
            apConfidence: swarm.apConfidence
        });
        const ap_krit = chatterLimit.value;

        let safe_step;
        if (isUserForcedAp) {
            // "ap fix" ist ein Wunsch-Maximalwert - trotzdem nie über das physikalische Limit des Werkzeugs gehen
            safe_step = Math.min(customAp, ap_krit * 0.95, lc_max * 0.95);
        } else {
            let maxProfileAp = D * profile.ap_factor;
            if (profile.max_ap_limit) maxProfileAp = Math.min(maxProfileAp, profile.max_ap_limit);
            safe_step = Math.min(ap_krit * 0.95, lc_max * 0.95, maxProfileAp);
        }

        const passes = Math.max(1, Math.ceil(depthInput / safe_step));
        const ap_sim = depthInput / passes;

        const res = calculatePhysics({ db, machId, matId, profId, toolId, rigId, holderType: 'spannzange', physicsActive: true, isRegrind: false, ap: ap_sim, ae: ae_sim });

        if (res) {
            let stabilityPenalty = 1.0;
            if (res.isFluteExceeded) stabilityPenalty *= 0.05;
            if (res.hasChatter) stabilityPenalty *= 0.15;
            if (res.isOverPower) stabilityPenalty *= 0.40;
            if (res.stress > 2500) stabilityPenalty *= 0.20;

            rankedResults.push({
                toolId, brand: tool.brand, toolName: tool.name, diameter: D,
                q: res.q, score: (res.q / passes) * stabilityPenalty, rpm: res.rpm, vf: res.vf,
                ap: ap_sim, ae: ae_sim, passes, power: res.power, hasChatter: res.hasChatter,
                isFluteExceeded: res.isFluteExceeded, lc_max: res.lc_max, ap_krit: res.ap_krit,
                apLimitSource: chatterLimit.source, isBreakIn: chatterLimit.isBreakIn, apConfidence: chatterLimit.confidence
            });
        }
    });

    rankedResults.sort((a, b) => b.score - a.score);
    resultsContainer.innerHTML = '';

    rankedResults.slice(0, 4).forEach((item, index) => { 
        const div = document.createElement('div');
        const isFaulty = item.hasChatter || item.isFluteExceeded;
        const isWinner = index === 0 && !isFaulty;
        
        let borderClass = item.isFluteExceeded ? "border-rose-300 bg-rose-50/50" : (item.hasChatter ? "border-amber-300 bg-amber-50/40" : (isWinner ? "border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-400 shadow-md" : "border-slate-200 bg-white"));
        
        let statusBadge = item.isFluteExceeded ? `<span class="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full text-[10px] font-bold">⛔ Schaftkollision</span>` : 
            (item.hasChatter ? `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[10px] font-bold">⚠️ Rattergefahr</span>` : 
            `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-bold">🟢 ${item.passes > 1 ? `${item.passes}× Z` : '1 Schnitt'} (Stabil)</span>`);

        const topBadge = isWinner ? `<span class="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black uppercase">Top Wahl</span>` : `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">#${index + 1}</span>`;
        const sourceBadge = `<span class="text-slate-400 text-[9px] font-mono" title="Datenquelle des ap-Limits">${item.apLimitSource === 'Hersteller' ? '📋 Herstellerwert' : '📐 Faustregel'}</span>`;
        const breakInBadge = item.isBreakIn ? `<span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold" title="Neue/unbestätigte Kombination - ap vorsichtshalber gedrosselt">🐣 Einfahren (${(item.apConfidence * 100).toFixed(0)}%)</span>` : '';

        div.id = `match-card-${item.toolId}`;
        div.className = `p-4 rounded-2xl border ${borderClass} flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm transition hover:shadow-md`;
        
        div.innerHTML = `
            <div class="space-y-1.5 flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">${topBadge}${statusBadge}${breakInBadge}
                    <strong class="text-slate-900 text-sm truncate">${item.brand ? `[${escapeHTML(item.brand)}] ` : ''}${escapeHTML(item.toolName)}</strong>
                </div>
                <div class="text-xs text-slate-500 font-mono flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                    <span>Ø: <strong>${item.diameter}mm</strong></span>
                    <span>ap: <strong class="${isFaulty ? 'text-rose-600 font-black' : 'text-slate-800'}">${item.ap.toFixed(2)}mm</strong></span>
                    <span>ae: <strong>${item.ae.toFixed(2)}mm</strong></span>
                    ${sourceBadge}
                </div>
            </div>
            <div class="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-slate-200/60 pt-3 md:pt-0">
                <div class="flex items-center gap-2 bg-slate-900 text-white px-3.5 py-2 rounded-xl shadow-sm">
                    <div class="text-center pr-2 border-r border-slate-700">
                        <div class="text-[9px] uppercase font-bold text-indigo-300 leading-none">Drehzahl (n)</div>
                        <div class="text-base font-black font-mono leading-tight">${item.rpm.toFixed(0)} <span class="text-[10px] font-normal text-slate-400">U/min</span></div>
                    </div>
                    <div class="text-center pl-1">
                        <div class="text-[9px] uppercase font-bold text-emerald-300 leading-none">Vorschub (vf)</div>
                        <div class="text-base font-black font-mono leading-tight text-emerald-400">${item.vf.toFixed(0)} <span class="text-[10px] font-normal text-slate-400">mm/min</span></div>
                    </div>
                </div>
                <button onclick="applyMatchmakerResult('${item.toolId}', ${item.ap}, ${item.ae})" class="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 hover:border-slate-400 px-3.5 py-2.5 rounded-xl text-xs font-bold transition shadow-sm whitespace-nowrap active:scale-95">
                    <span>✔</span> Übernehmen
                </button>
            </div>
        `;
        resultsContainer.appendChild(div);
    });
}
