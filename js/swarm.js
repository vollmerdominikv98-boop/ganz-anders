export function evaluateSwarmAI(db, toolId, matId, profId) {
    let swarmFeedback = { success: 0, chatter: 0, break: 0 };

    if (db.swarm_data && db.swarm_data.length > 0) {
        db.swarm_data.forEach(item => {
            if (item.tool_id === toolId && item.mat_id === matId && item.prof_id === profId) {
                if (item.status === 'success') swarmFeedback.success++;
                if (item.status === 'chatter') swarmFeedback.chatter++;
                if (item.status === 'break') swarmFeedback.break++;
            }
        });
    } else if (db.history) {
        db.history.forEach(item => {
            if (item.tool_id === toolId && item.mat_id === matId && item.prof_id === profId) {
                if (item.feedback_status === 'success') swarmFeedback.success++;
                if (item.feedback_status === 'chatter') swarmFeedback.chatter++;
                if (item.feedback_status === 'break') swarmFeedback.break++;
            }
        });
    }

    let swarm_k = 1.0;
    let infoHtml = "";
    let vetoWarning = null;

    // Einfahr-Faktor (apConfidence): begrenzt zusätzlich die axiale Zustelltiefe (ap),
    // solange diese exakte Kombination aus Werkzeug/Material/Profil noch nicht durch
    // echte, bestätigte Schnitte abgesichert ist. Das ersetzt die fehlende Messung der
    // realen Systemsteifigkeit durch echte Produktionsdaten - wirtschaftlich sinnvoll
    // gerade bei Einzelteilfertigung, wo Klopftests pro Auftrag nicht tragbar sind.
    let apConfidence = 1.0;
    const totalPoints = swarmFeedback.success + swarmFeedback.chatter + swarmFeedback.break;

    if (swarmFeedback.break > 0) {
        swarm_k = Math.pow(0.90, swarmFeedback.break);
        apConfidence = Math.max(0.5, Math.pow(0.85, swarmFeedback.break));
        infoHtml = `<div class="text-[11px] text-rose-600 font-bold">🧠 [Schwarm-KI] ${swarmFeedback.break}x Bruch gemeldet! vc/fz gedrosselt (-${((1 - swarm_k) * 100).toFixed(0)}%), max. ap zusätzlich auf ${(apConfidence * 100).toFixed(0)}% begrenzt.</div>`;
        vetoWarning = `<div class="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 shadow-sm flex items-start gap-2"><span class="text-base leading-none">🧠</span> <div><strong>KI-VETO (BRUCHGEFAHR):</strong> Der Schwarm hat bei diesem Setup Fräserbruch gemeldet! Werte wurden massiv gedrosselt.</div></div>`;
    } else if (swarmFeedback.chatter > 0) {
        swarm_k = Math.pow(0.95, swarmFeedback.chatter);
        apConfidence = Math.max(0.6, Math.pow(0.90, swarmFeedback.chatter));
        infoHtml = `<div class="text-[11px] text-amber-600 font-bold">🧠 [Schwarm-KI] ${swarmFeedback.chatter}x Rattern gemeldet! Dynamik gedrosselt (-${((1 - swarm_k) * 100).toFixed(0)}%), max. ap auf ${(apConfidence * 100).toFixed(0)}% begrenzt.</div>`;
    } else if (swarmFeedback.success >= 3) {
        swarm_k = 1.05;
        apConfidence = 1.0;
        infoHtml = `<div class="text-[11px] text-emerald-600 font-bold">🧠 [Schwarm-KI] ${swarmFeedback.success}x bestätigt erfolgreich! Setup ist erprobt (+5% Performance-Boost, volle Zustelltiefe freigegeben).</div>`;
    } else if (totalPoints === 0) {
        apConfidence = 0.6;
        infoHtml = `<div class="text-[11px] text-indigo-600 font-bold">🧠 [Einfahr-Modus] Neue, unbestätigte Kombination. Zustelltiefe (ap) vorsichtshalber auf 60% begrenzt, bis erste Schnitte bestätigt sind.</div>`;
    } else {
        apConfidence = 0.8;
        infoHtml = `<div class="text-[11px] text-indigo-600 font-bold">🧠 [Einfahr-Modus] ${swarmFeedback.success}x bestätigt (noch &lt; 3). Zustelltiefe (ap) auf 80% begrenzt, wird nach weiteren Bestätigungen voll freigegeben.</div>`;
    }

    return { factor: swarm_k, apConfidence, infoHtml, vetoWarning };
}
