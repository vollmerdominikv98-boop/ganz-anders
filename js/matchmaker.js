import { calculatePhysics } from './physics.js';

export function runMatchmaker(db, machId, matId, rigId) {
    const depthInput = parseFloat(document.getElementById('mm-depth').value);
    const radiusInput = parseFloat(document.getElementById('mm-radius').value);
    const customAp = parseFloat(document.getElementById('mm-ap').value);
    const customAe = parseFloat(document.getElementById('mm-ae').value);
    const profId = document.getElementById('mm-profile-select').value;
    const resultsContainer = document.getElementById('mm-results');

    if (isNaN(depthInput) || isNaN(radiusInput) || !profId) {
        alert("Bitte fülle Feature-Tiefe Z und den kleinsten Radius aus.");
        return;
    }

    resultsContainer.innerHTML = '<div class="text-xs text-slate-400 italic p-6 text-center animate-pulse">Analysiere Werkzeuge und simuliere physikalische Schnittdaten...</div>';

    setTimeout(() => {
        let validTools = [];

        // 1. Filter: Passen Durchmesser und Auskragung?
        for (const [toolId, tool] of Object.entries(db.tools || {})) {
            if (tool.suitable_materials && !tool.suitable_materials.includes(matId)) continue;
            if (tool.suitable_profiles && !tool.suitable_profiles.includes(profId)) continue;
            
            const maxD = radiusInput * 2;
            if (tool.diameter > maxD) continue; 
            
            const overhang = tool.max_overhang || (tool.diameter * 3);
            if (overhang < depthInput) continue; 

            validTools.push(toolId);
        }

        if (validTools.length === 0) {
            resultsContainer.innerHTML = '<div class="text-xs text-rose-600 bg-rose-50 p-4 rounded-xl border border-rose-200">Kein passendes Werkzeug gefunden. Du benötigst einen Fräser mit kleinerem Durchmesser oder größerer Auskragung.</div>';
            return;
        }

        // 2. Physikalische Simulation aller Treffer
        let rankedResults = [];
        const profile = db.profiles[profId];
        
        validTools.forEach(toolId => {
            const tool = db.tools[toolId];
            const ap = !isNaN(customAp) && customAp > 0 ? customAp : tool.diameter * profile.ap_factor;
            const ae = !isNaN(customAe) && customAe > 0 ? customAe : tool.diameter * profile.ae_factor;

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
                ap: ap,
                ae: ae
            });

            if (res && !res.isOverPower && res.stress < 2500) {
                rankedResults.push({
                    toolId: toolId,
                    toolName: tool.name,
                    brand: tool.brand,
                    diameter: tool.diameter,
                    q: res.q, 
                    rpm: res.rpm,
                    vf: res.vf,
                    ap: ap,
                    ae: ae,
                    power: res.power,
                    torque: res.torque
                });
            }
        });

        // 3. Ranking nach Zeitspanvolumen (Q)
        rankedResults.sort((a, b) => b.q - a.q);

        resultsContainer.innerHTML = '';
        if (rankedResults.length === 0) {
            resultsContainer.innerHTML = '<div class="text-xs text-amber-600 bg-amber-50 p-4 rounded-xl border border-amber-200">Werkzeuge gefunden, aber alle würden bei dieser Belastung (ap/ae) brechen oder die Spindel überlasten.</div>';
            return;
        }

        // 4. Anzeige der Top 3-5 Empfehlungen als Karten
        rankedResults.slice(0, 4).forEach((item, index) => { 
            const div = document.createElement('div');
            const isWinner = index === 0;
            const borderClass = isWinner ? "border-indigo-400 bg-indigo-50/40 ring-1 ring-indigo-400" : "border-slate-200 bg-white";
            const badge = isWinner 
                ? `<span class="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">Top Empfehlung</span>` 
                : `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">Platz ${index + 1}</span>`;

            div.className = `p-4 rounded-2xl border ${borderClass} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm transition hover:shadow-md`;
            div.innerHTML = `
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        ${badge}
                        <strong class="text-slate-900 text-sm">${item.brand ? `[${item.brand}] ` : ''}${item.toolName}</strong>
                    </div>
                    <div class="text-xs text-slate-500 font-mono flex flex-wrap gap-x-3 gap-y-0.5 pt-1">
                        <span>Ø: <strong class="text-slate-800">${item.diameter}mm</strong></span>
                        <span>ap: <strong class="text-slate-800">${item.ap.toFixed(2)}mm</strong></span>
                        <span>ae: <strong class="text-slate-800">${item.ae.toFixed(2)}mm</strong></span>
                        <span>Pc: <strong>${item.power.toFixed(1)}kW</strong></span>
                    </div>
                </div>
                <div class="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-slate-200/60 pt-2 sm:pt-0">
                    <div class="text-left sm:text-right">
                        <div class="text-indigo-700 font-black font-mono text-base">${item.q.toFixed(1)} cm³/min</div>
                        <div class="text-[10px] font-mono text-slate-500">${item.rpm.toFixed(0)} U/min | ${item.vf.toFixed(0)} mm/min</div>
                    </div>
                    <button onclick="applyMatchmakerResult('${item.toolId}')" class="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm whitespace-nowrap">
                        Laden & Details 👉
                    </button>
                </div>
            `;
            resultsContainer.appendChild(div);
        });

    }, 250); 
}
