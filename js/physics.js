import { evaluateSwarmAI } from './swarm.js';

// --- ZENTRALE RATTERGRENZE (DRY-Prinzip) ---
export function getChatterLimit(D, Lmax, geo_type, lc_max) {
    const ld_ratio = Lmax / D;
    if (geo_type === 'torus') {
        return Math.min(D * 0.8, lc_max);
    } else if (geo_type === 'ball') {
        return D / 2; // R
    } else {
        const ld_safe = Math.max(ld_ratio, 2.0);
        return Math.min(D * (6.0 / Math.pow(ld_safe, 1.3)), lc_max);
    }
}

export function calculatePhysics({ db, machId, matId, profId, toolId, rigId, holderType, physicsActive, isRegrind, customD, customR, ap, ae }) {
    const mach = db.machines[machId];
    const mat = db.materials[matId];
    const profile = db.profiles[profId];
    const tool = db.tools[toolId];
    const rigidity = db.rigidity[rigId];
    
    if(!mach || !tool || !mat || !profile || !rigidity) return null;

    let D = isRegrind && !isNaN(customD) && customD > 0 ? customD : tool.diameter;
    let R = tool.geo_type === "ball" ? D / 2 : (isRegrind && !isNaN(customR) && customR >= 0 ? customR : (tool.radius || 0));

    const z = tool.z;
    const Lmax = tool.max_overhang || (D * 3);
    let lc_max = tool.flute_len || (tool.geo_type === 'torus' ? Math.max(R * 2, D * 1.0) : (tool.geo_type === 'ball' ? D * 0.5 : D * 1.5));

    const warnings = [];
    let physicsInfoHtml = "";

    // SCHNEIDENLÄNGEN-CHECK
    if (ap > lc_max * 1.05) {
        warnings.push(`<div class="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-300 shadow-sm flex items-start gap-2"><span class="text-base leading-none">⛔</span> <div><strong>SCHAFT-KOLLISION:</strong> ap (${ap.toFixed(1)}mm) > Schneidenlänge (${lc_max.toFixed(1)}mm)!</div></div>`);
    }

    let baseVc = tool.vc_per_material ? (tool.vc_per_material[matId] || 150) : 150;
    let fz_nom = tool.fz_nom || (D * 0.007); 

    const swarm = evaluateSwarmAI(db, toolId, matId, profId);
    physicsInfoHtml += swarm.infoHtml;
    if (swarm.vetoWarning) warnings.push(swarm.vetoWarning);

    baseVc *= swarm.factor;
    fz_nom *= swarm.factor;

    let Deff = D;
    if (tool.geo_type === "ball") {
        Deff = 2 * Math.sqrt(Math.min(ap, D / 2) * (D - Math.min(ap, D / 2)));
    } else if (tool.geo_type === "torus" && ap <= R) {
        Deff = D - 2*R + 2 * Math.sqrt(Math.pow(R, 2) - Math.pow(R - ap, 2));
    }
    Deff = Math.max(0.1, Math.min(Deff, D));

    let base_fz = fz_nom * (profile.fz_ratio || 1.0);
    let ae_ratio = Math.min(ae / Deff, 1.0);
    let phi_s_rad = Math.acos(Math.max(-1, 1 - 2 * ae_ratio)); 

    let act_ratio = 1.0;
    if ((tool.geo_type === "torus" || tool.geo_type === "ball") && R > 0) {
        act_ratio = Math.max(Math.sqrt(1 - Math.pow(1 - (Math.min(ap, R) / R), 2)), 0.10);
    }

    let combined_thinning = Math.max((ae_ratio < 0.5 && phi_s_rad > 0 ? Math.sin(phi_s_rad) : 1.0) * act_ratio, 0.05);
    let fz_geo = physicsActive && profile.rct_active !== false ? Math.min(base_fz / combined_thinning, fz_nom * 4.0) : Math.max(base_fz, 0.004 / combined_thinning);

    const ld_ratio = Lmax / D;
    let k_vc_overhang = ld_ratio > 7.0 ? 0.60 : (ld_ratio > 5.0 ? 0.80 : (ld_ratio > 3.5 ? 0.90 : 1.0));
    let k_fz_overhang = ld_ratio > 7.0 ? 0.70 : (ld_ratio > 5.0 ? 0.85 : (ld_ratio > 3.5 ? 0.90 : 1.0));

    let effectiveVc = baseVc * k_vc_overhang * (holderType === 'schrumpf' ? 1.08 : (holderType === 'hydro' ? 1.05 : (holderType === 'weldon' ? 0.90 : 1.0))) * (isRegrind ? 0.90 : 1.0);
    let effectiveFz = fz_geo * k_fz_overhang * (rigidity.factor || 1.0);

    let n_theo = (effectiveVc * 1000) / (Math.PI * Deff);
    let n_eff = Math.min(n_theo, mach.max_rpm);
    let vf_eff = Math.min(effectiveFz * z * n_eff, mach.max_vf);

    // Limit-Warnungen
    if (n_theo > mach.max_rpm) warnings.push(`<div class="text-[11px] font-bold text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">⚠️ <strong>Drehzahl-Limit:</strong> Maschine limitiert auf ${mach.max_rpm} U/min.</div>`);
    if ((effectiveFz * z * n_theo) > mach.max_vf) warnings.push(`<div class="text-[11px] font-bold text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">⚠️ <strong>Vorschub-Limit:</strong> Maschine limitiert auf ${mach.max_vf} mm/min.</div>`);

    const ap_krit = getChatterLimit(D, Lmax, tool.geo_type, lc_max);
    const hasChatter = ap > ap_krit * 1.05;
    if (hasChatter) warnings.push(`<div class="text-xs font-bold text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-300 shadow-sm flex items-start gap-2"><span class="text-base leading-none">🔔</span> <div><strong>RATTER-GEFAHR:</strong> ap (${ap.toFixed(1)}mm) > Limit (${ap_krit.toFixed(1)}mm)!</div></div>`);

    let hm_real = Math.max(phi_s_rad > 0 ? (effectiveFz * act_ratio * 2 * ae) / (Deff * phi_s_rad) : 0.0005, 0.0005); 
    const kc_real = Math.min(mat.kc11 / Math.pow(hm_real, mat.mc !== undefined ? mat.mc : 0.25), 8000); 

    const Q_cm3 = (ap * ae * vf_eff) / 1000; 
    const power_kw = (Q_cm3 * kc_real) / 60000; 
    const torque_nm = (power_kw * 9549.3) / n_eff;

    if (power_kw > mach.max_kw * 0.85) warnings.push(`<div class="text-[11px] font-bold text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">⚠️ <strong>LEISTUNGS-LIMIT:</strong> Spindelleistung am Limit!</div>`);
    if (torque_nm > (mach.max_nm || 100) * 0.9) warnings.push(`<div class="text-[11px] font-bold text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">⚠️ <strong>DREHMOMENT-LIMIT:</strong> Spindel überlastet!</div>`);

    const sigma_b = ((kc_real * ap * hm_real * 0.45) * Math.max(Lmax - (ap / 2), Lmax * 0.1)) / ((Math.PI * Math.pow(D * (z <= 2 ? 0.5 : (z === 3 ? 0.55 : (z === 4 ? 0.65 : 0.70))), 3)) / 32);
    if (sigma_b > 2500) warnings.push(`<div class="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 shadow-sm">⚠️ <strong>BRUCHGEFAHR:</strong> Biegespannung zu hoch!</div>`);

    return {
        rpm: n_eff, vf: vf_eff, ap, ae, lc_max, ap_krit, hasChatter, isFluteExceeded: ap > lc_max,
        ap_factor, ae_factor, q: Q_cm3, power: power_kw, torque: torque_nm, fz_eff: effectiveFz, vc_eff: (Math.PI * Deff * n_eff) / 1000,
        fc: kc_real * ap * hm_real * Math.max(1.0, (phi_s_rad / (2 * Math.PI)) * z), stress: sigma_b,
        isOverPower: power_kw > (mach.max_kw * 0.85), isOverTorque: torque_nm > (mach.max_nm || 100) * 0.9,
        warnings, physicsInfoHtml
    };
}
