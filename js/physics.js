import { evaluateSwarmAI } from './swarm.js';

export function calculatePhysics({ db, machId, matId, profId, toolId, rigId, holderType, physicsActive, isRegrind, customD, customR, ap, ae }) {
    const mach = db.machines[machId];
    const mat = db.materials[matId];
    const profile = db.profiles[profId];
    const tool = db.tools[toolId];
    const rigidity = db.rigidity[rigId];
    
    if(!mach || !tool || !mat || !profile || !rigidity) {
        return null;
    }

    let D = tool.diameter;
    let R = tool.radius || 0;

    if (isRegrind) {
        if (!isNaN(customD) && customD > 0) D = customD;
        if (!isNaN(customR) && customR >= 0) R = customR;
    }

    if (tool.geo_type === "ball") R = D / 2;

    const z = tool.z;
    const Lmax = tool.max_overhang || (D * 3);
    const ap_factor = ap / D;
    const ae_factor = ae / D;

    const warnings = [];
    let physicsInfoHtml = "";

    // 1. Katalog-Grundwerte
    let baseVc = tool.vc_per_material ? (tool.vc_per_material[matId] || 150) : 150;
    let fz_nom = tool.fz_nom || (D * 0.007); 
    physicsInfoHtml += `<div class="text-[11px] text-slate-500">[Katalog] Base vc: ${baseVc.toFixed(0)} m/min | Nominal fz(50%D): ${fz_nom.toFixed(3)} mm</div>`;

    // 1.5. Schwarm-KI
    const swarm = evaluateSwarmAI(db, toolId, matId, profId);
    physicsInfoHtml += swarm.infoHtml;
    if (swarm.vetoWarning) warnings.push(swarm.vetoWarning);

    baseVc *= swarm.factor;
    fz_nom *= swarm.factor;

    // 2. Effektiver Durchmesser
    let Deff = D;
    if (tool.geo_type === "ball") {
        let effectiveAp = Math.min(ap, D / 2);
        Deff = 2 * Math.sqrt(effectiveAp * (D - effectiveAp));
        if (Deff < 0.1) Deff = 0.1;
        physicsInfoHtml += `<div class="text-[11px] text-cyan-800 font-semibold">[Geometrie] Kugelfräser Deff: ${Deff.toFixed(2)} mm</div>`;
    } else if (tool.geo_type === "torus") {
        if (ap <= R) {
            Deff = D - 2*R + 2 * Math.sqrt(Math.pow(R, 2) - Math.pow(R - ap, 2));
        } else {
            Deff = D;
        }
        if (Deff > D) Deff = D;
        if (Deff < 0.1) Deff = 0.1;
        physicsInfoHtml += `<div class="text-[11px] text-cyan-800 font-semibold">[Geometrie] Torusfräser Deff: ${Deff.toFixed(2)} mm</div>`;
    }

    const fz_ratio = profile.fz_ratio !== undefined ? profile.fz_ratio : 1.0;
    let base_fz = fz_nom * fz_ratio;
    physicsInfoHtml += `<div class="text-[11px] text-indigo-700 font-semibold">[Profil-Intent] Basis fz (Ratio ${fz_ratio.toFixed(2)}): ${base_fz.toFixed(4)} mm</div>`;

    // 3. 3D-Chip Thinning (Mechanischer Flaschenhals 1)
    let ae_ratio = Math.min(ae / Deff, 1.0);
    let phi_s_rad = Math.acos(Math.max(-1, 1 - 2 * ae_ratio)); 

    let rct_ratio = (ae_ratio < 0.5 && phi_s_rad > 0) ? Math.sin(phi_s_rad) : 1.0;
    let act_ratio = 1.0;
    if ((tool.geo_type === "torus" || tool.geo_type === "ball") && R > 0) {
        let ap_effective = Math.min(ap, R);
        let sin_kappa = Math.sqrt(1 - Math.pow(1 - (ap_effective / R), 2));
        act_ratio = Math.max(sin_kappa, 0.10);
    }

    let combined_thinning = Math.max(rct_ratio * act_ratio, 0.05);
    let fz_geo = base_fz;
    const isRctActive = profile.rct_active !== undefined ? profile.rct_active : (!profId.includes('schlichten'));
    const hm_min = 0.004;

    if (physicsActive && isRctActive) {
        fz_geo = base_fz / combined_thinning;
        if (fz_geo > fz_nom * 4.0) fz_geo = fz_nom * 4.0;
        let boostPercent = ((fz_geo / base_fz - 1) * 100).toFixed(0);
        if (boostPercent > 0) {
            physicsInfoHtml += `<div class="text-[11px] text-emerald-700 font-semibold">[3D-Chip Thinning] RCT & ACT aktiv: fz angehoben um +${boostPercent}% (${fz_geo.toFixed(4)} mm)</div>`;
        }
    } else if (physicsActive && !isRctActive) {
        let expected_hm = base_fz * combined_thinning;
        if (expected_hm < hm_min) {
            fz_geo = hm_min / combined_thinning;
            if (fz_geo > fz_nom * 3.0) fz_geo = fz_nom * 3.0;
            physicsInfoHtml += `<div class="text-[11px] text-rose-600 font-semibold">⚠️ [Schab-Schutz aktiv!] hm wäre nur ${expected_hm.toFixed(4)} mm (Fräser verglüht). fz zwingend auf ${fz_geo.toFixed(4)} mm angehoben!</div>`;
        } else {
            physicsInfoHtml += `<div class="text-[11px] text-amber-700 font-semibold">[Intent Routing] RCT deaktiviert (Oberflächen-Fokus). hm = ${expected_hm.toFixed(4)} mm (OK).</div>`;
        }
    }

    // 4. Setup-Korrekturen
    let k_vc_overhang = 1.0;
    let k_fz_overhang = 1.0;
    const ld_ratio = Lmax / D;

    if (ld_ratio > 8.0) {
        k_vc_overhang = 0.60; k_fz_overhang = 0.70;
        warnings.push(`<div class="text-xs font-bold text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-300 shadow-sm flex items-start gap-2"><span class="text-base leading-none">⚠️</span> <div><strong>EXTREME AUSKRAGUNG (L/D > 8):</strong> Dynamik stark gedrosselt (-40% vc, -30% fz)!</div></div>`);
    } else if (ld_ratio > 6.0) {
        k_vc_overhang = 0.85; k_fz_overhang = 0.90;
        warnings.push(`<div class="text-xs font-bold text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-300 shadow-sm flex items-start gap-2"><span class="text-base leading-none">⚠️</span> <div><strong>HOHE AUSKRAGUNG (L/D > 6):</strong> Leicht gedrosselt (-15% vc, -10% fz)!</div></div>`);
    } else if (ld_ratio > 4.0) {
        k_vc_overhang = 0.95; k_fz_overhang = 0.95;
    }

    let k_vc_holder = 1.0;
    if (holderType === 'schrumpf') k_vc_holder = 1.08;
    else if (holderType === 'hydro') k_vc_holder = 1.05;
    else if (holderType === 'weldon') k_vc_holder = 0.90;

    let k_fz_rigidity = rigidity.factor || 1.0;
    let k_vc_regrind = isRegrind ? 0.90 : 1.0;
    if (isRegrind) {
        physicsInfoHtml += `<div class="text-[11px] text-amber-800 font-semibold">[Nachschliff] vc -10% (Beschichtungsschutz)</div>`;
    }

    let effectiveVc = baseVc * k_vc_overhang * k_vc_holder * k_vc_regrind;
    let effectiveFz = fz_geo * k_fz_overhang * k_fz_rigidity;

    // === NEU: THERMISCHER WÄCHTER (Flaschenhals vc) ===
    if (mat.kc11 > 2000) { 
        const engagement_ratio = ae / Deff;
        if (engagement_ratio > 0.15) {
            const thermal_reduction = 1 - (engagement_ratio * 0.4); 
            const thermal_vc_limit = effectiveVc * thermal_reduction;
            if (thermal_vc_limit < effectiveVc) {
                effectiveVc = thermal_vc_limit;
                physicsInfoHtml += `<div class="text-[11px] text-orange-600 font-semibold">🔥 [Thermischer Wächter] Hohe Umschlingung bei hartem Material. vc auf ${effectiveVc.toFixed(0)} m/min abgeriegelt (Hitzestau).</div>`;
            }
        }
    }

    // === NEU: RAUTIEFEN-BEGRENZER (Flaschenhals fz) ===
    if (profId.includes('schlichten') && R > 0) {
        const target_Rth = 0.003; 
        const fz_surface_limit = Math.sqrt(target_Rth * 8 * R);
        if (effectiveFz > fz_surface_limit) {
            effectiveFz = fz_surface_limit;
            physicsInfoHtml += `<div class="text-[11px] text-cyan-700 font-semibold">✨ [Oberflächen-Wächter] fz hart auf ${effectiveFz.toFixed(4)} mm limitiert, um Rth < 3µm zu garantieren.</div>`;
        }
    }

    let runout_mm = 0.003; 
    if (holderType === 'spannzange') runout_mm = 0.012;
    else if (holderType === 'weldon') runout_mm = 0.020;

    physicsInfoHtml += `<div class="text-[11px] text-slate-600">[Setup-Check] L/D=${ld_ratio.toFixed(1)} | Halter=${holderType} | vc(korr): ${effectiveVc.toFixed(0)} m/min</div>`;

    // 5. Kinematik
    let n_theo = (effectiveVc * 1000) / (Math.PI * Deff);
    let n_eff = Math.min(n_theo, mach.max_rpm);
    let vf_eff = effectiveFz * z * n_eff;
    vf_eff = Math.min(vf_eff, mach.max_vf);
    let vc_eff_real = (Math.PI * Deff * n_eff) / 1000;

    // === NEU: RATTER- / STABILITÄTSGRENZE (Chatter Limit) ===
    if (ld_ratio > 3.0) {
        const ap_krit = D * Math.pow((3.0 / ld_ratio), 1.5); 
        if (ap > ap_krit) {
            warnings.push(`<div class="text-xs font-bold text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-300 shadow-sm flex items-start gap-2"><span class="text-base leading-none">🔔</span> <div><strong>RATTER-GEFAHR (Chatter):</strong> Schnitttiefe ap (${ap.toFixed(2)} mm) überschreitet das stabile Limit (${ap_krit.toFixed(2)} mm) für L/D=${ld_ratio.toFixed(1)}. Reduziere ap oder nimm einen kürzeren Fräser!</div></div>`);
        }
    }

    // 6. Kienzle & Dynamik
    let hm_real = phi_s_rad > 0 ? (effectiveFz * act_ratio * 2 * ae) / (Deff * phi_s_rad) : 0.0005;
    hm_real = Math.max(hm_real, 0.0005); 

    const mc = mat.mc !== undefined ? mat.mc : 0.25;
    let kc_raw = mat.kc11 / Math.pow(hm_real, mc);
    const kc_real = Math.min(kc_raw, 8000); 
    physicsInfoHtml += `<div class="text-[11px] text-slate-500">[Kienzle Engine] Reale ø-Spandicke hm: ${hm_real.toFixed(4)} mm | kc: ${kc_real.toFixed(0)} N/mm²</div>`;

    const Q_cm3 = (ap * ae * vf_eff) / 1000; 
    const Q_mm3 = ap * ae * vf_eff;
    const power_kw = (Q_cm3 * kc_real) / (60 * 1000); 
    const torque_nm = (power_kw * 9549.3) / n_eff;

    const mach_max_nm = mach.max_nm || 100; 
    if (torque_nm > mach_max_nm * 0.9) {
        warnings.push(`<div class="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 shadow-sm flex items-start gap-2"><span class="text-base leading-none">⚠️</span> <div><strong>SPINDEL ÜBERLASTET:</strong> Drehmoment (${torque_nm.toFixed(1)} Nm) überschreitet Limit (${mach_max_nm} Nm)!</div></div>`);
    }

    let z_in_cut = (phi_s_rad / (2 * Math.PI)) * z;
    let z_force_factor = Math.max(1.0, z_in_cut);
    const fc_avg = kc_real * ap * hm_real * z_force_factor;

    let fz_peak = effectiveFz + runout_mm;
    let hm_peak = Math.max(fz_peak * combined_thinning, 0.0005); 
    const kc_peak = Math.min(mat.kc11 / Math.pow(hm_peak, mc), 8000); 
    const fc_peak = kc_peak * ap * hm_peak; 
    const f_bend = fc_peak * 0.45; 

    let coreFactor = 0.6; 
    if (z <= 2) coreFactor = 0.50;
    else if (z === 3) coreFactor = 0.55;
    else if (z === 4) coreFactor = 0.65;
    else if (z >= 5) coreFactor = 0.70;
    
    const D_core = D * coreFactor;
    const W_b = (Math.PI * Math.pow(D_core, 3)) / 32;
    const Leff = Math.max(Lmax - (ap / 2), Lmax * 0.1);
    const M_b = f_bend * Leff; 
    const sigma_b = M_b / W_b; 

    if (sigma_b > 2500) {
        warnings.push(`<div class="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 shadow-sm flex items-start gap-2"><span class="text-base leading-none">⚠️</span> <div><strong>BRUCHGEFAHR:</strong> Peak-Biegespannung (${sigma_b.toFixed(0)} MPa) überschreitet Limit!</div></div>`);
    }

    return {
        rpm: n_eff,
        vf: vf_eff,
        ap,
        ae,
        ap_factor,
        ae_factor,
        q: Q_cm3,
        q_mm3: Q_mm3,
        power: power_kw,
        torque: torque_nm,
        fz_eff: effectiveFz,
        vc_eff: vc_eff_real,
        fc: fc_avg,
        stress: sigma_b,
        isOverRpm: n_theo > mach.max_rpm,
        isOverVf: (effectiveFz * z * n_theo > mach.max_vf),
        isOverPower: power_kw > (mach.max_kw * 0.85),
        isOverTorque: torque_nm > mach_max_nm * 0.9,
        warnings,
        physicsInfoHtml
    };
}
