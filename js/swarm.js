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

    if (swarmFeedback.break > 0) {
        swarm_k = Math.pow(0.90, swarmFeedback.break); 
        infoHtml = `<div class="text-[11px] text-rose-600 font-bold">🧠 [Schwarm-KI] ${swarmFeedback.break}x Bruch gemeldet! Drossele Schnittdaten (-${((1-swarm_k)*100).toFixed(0)}%)!</div>`;
        vetoWarning = `<div class="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 shadow-sm flex items-start gap-2"><span class="text-base leading-none">🧠</span> <div><strong>KI-VETO (BRUCHGEFAHR):</strong> Der Schwarm hat bei diesem Setup Fräserbruch gemeldet! Werte wurden massiv gedrosselt.</div></div>`;
    } else if (swarmFeedback.chatter > 0) {
        swarm_k = Math.pow(0.95, swarmFeedback.chatter);
        infoHtml = `<div class="text-[11px] text-amber-600 font-bold">🧠 [Schwarm-KI] ${swarmFeedback.chatter}x Rattern gemeldet! Drossele Dynamik (-${((1-swarm_k)*100).toFixed(0)}%).</div>`;
    } else if (swarmFeedback.success >= 3) {
        swarm_k = 1.05; 
        infoHtml = `<div class="text-[11px] text-emerald-600 font-bold">🧠 [Schwarm-KI] ${swarmFeedback.success}x "Top" gemeldet! Setup ist hochsicher (+5% Performance-Boost).</div>`;
    } else {
        infoHtml = `<div class="text-[11px] text-slate-400 font-medium">🧠 [Schwarm-KI] Zu wenig Schwarm-Daten. Nutze reine Physik-Berechnung.</div>`;
    }

    return { factor: swarm_k, infoHtml, vetoWarning };
}
