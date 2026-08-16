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

    resultsContainer.innerHTML = '<div class="text-xs text-slate-400 italic p-4 text-center animate-pulse">Analysiere Werkzeuge und simuliere Schnitte...</div>';

    setTimeout(() => {
        let validTools = [];

        // 1. FILTERN: Passen Durchmesser und Auskragung?
        for (const [toolId, tool] of Object.entries(db.tools || {})) {
            if (tool.suitable_materials && !tool.suitable_materials.includes(matId)) continue;
            if (tool.suitable_profiles && !tool.suitable_profiles.includes(profId)) continue;
            
            const maxD = radiusInput * 2; // Fräser muss in die Ecke passen
            if (tool.diameter > maxD) continue; 
            
            const overhang = tool.max_overhang || (tool.diameter * 3);
            if (overhang < depthInput) continue; // Zu kurz für die Tiefe

            validTools.push(toolId);
        }

        if (validTools.length === 0) {
            resultsContainer.innerHTML = '<div class="text-xs text-rose-600 bg-rose-50 p-4 rounded-xl border border-rose-200">Kein passendes Werkzeug in deinem Bestand gefunden. Du brauchst einen längeren oder dünneren Fräser.</div>';
            return;
        }

        // 2. SIMULATION
        let rankedResults = [];
        const profile = db.profiles[profId];
        
        validTools.forEach(toolId => {
            const tool = db.tools[toolId];
            
            // Wenn ap/ae manuell eingegeben wurden, nutze diese – sonst Profil-Standardfaktoren
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

            if (res) {
                // Nur aufnehmen, wenn Spindel nicht überlastet und Biegespannung sicher
                if (!res.isOverPower && res.stress < 2500) {
                    rankedResults.push({
                        toolId: toolId,
                        toolName: tool.name,
                        brand: tool.brand,
                        diameter: tool.diameter,
                        q: res.q, 
                        rpm: res.rpm,
                        vf: res.vf,
                        ap: ap,
                        ae: ae
                    });
                }
            }
        });

        // 3. RANKING nach Zeitspanvolumen (Q)
        rankedResults.sort((a, b) => b.q - a.q);

        // 4. AUSGABE
        resultsContainer.innerHTML = '';
        if (rankedResults.length === 0) {
            resultsContainer.innerHTML = '<div class="text-xs text-amber-600 bg-amber-50 p-4 rounded-xl border border-amber-200">Werkzeuge gefunden, aber alle würden bei dieser Belastung (ap/ae) brechen oder die Spindel überlasten.</div>';
            return;
        }

        rankedResults.slice(0, 5).forEach((item, index) => { 
            const div = document.createElement('div');
            const borderClass = index === 0 ? "border-amber-400 bg-amber-50/30" : "border-slate-200 bg-white";
            const badge = index === 0 ? `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">🥇 Top Empfehlung</span>` : '';

            div.className = `p-3 rounded-xl border ${borderClass} flex flex-col md:flex-row justify-between items-start md:items-center gap-2 shadow-sm transition hover:shadow-md`;
            div.innerHTML = `
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <strong class="text-slate-900 text-sm">${item.brand ? `[${item.brand}] ` : ''}${item.toolName}</strong>
                        ${badge}
                    </div>
                    <div class="text-[11px] text-slate-500 font-mono mt-1">
                        Ø${item.diameter}mm | ap: ${item.ap.toFixed(2)}mm | ae: ${item.ae.toFixed(2)}mm
                    </div>
                </div>
                <div class="flex-shrink-0 text-right">
                    <div class="text-indigo-700 font-black font-mono text-base">${item.q.toFixed(1)} cm³/min</div>
                    <div class="text-[10px] text-slate-400">n: ${item.rpm.toFixed(0)} | vf: ${item.vf.toFixed(0)}</div>
                </div>
                <button onclick="applyMatchmakerResult('${item.toolId}')" class="ml-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold transition">
                    Übernehmen
                </button>
            `;
            resultsContainer.appendChild(div);
        });

    }, 300); 
}
