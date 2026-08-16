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

    // Physische Schneidenlänge lc ermitteln
    let lc_max = tool.flute_len;
    if (!lc_max) {
        if (tool.geo_type === 'torus') lc_max = Math.max(R * 2, D * 1.0);
        else if (tool.geo_type === 'ball') lc_max = D * 0.5;
        else lc_max = D * 1.5; // Standard Schaftfräser
    }

    const warnings = [];
    let physicsInfoHtml = "";

    // 1. SCHNEIDENLÄNGEN-CHECK (Flute Length)
    if (ap > lc_max * 1.05) {
        warnings.push(`<div class="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-300 shadow-sm flex items-start gap-2"><span class="text-base leading-none">⛔</span> <div><strong>SCHAFT-KOLLISION:</strong> Schnitttiefe ap (${ap.toFixed(1)} mm) ist größer als die Schneidenlänge (${lc_max.toFixed(1)} mm)! Der Schaft reibt am Werkstück.</div></div>`);
    }

    // 2. Katalog-Grundwerte & Schwarm-KI
    let baseVc = tool.vc_per_material ? (tool.vc_per_material[matId] || 150) : 150;
    let fz_nom = tool.fz_nom || (D * 0.007); 

    const swarm = evaluateSwarmAI(db, toolId, matId, profId);
    physicsInfoHtml += swarm.infoHtml;
    if (swarm.vetoWarning) warnings.push(swarm.vetoWarning);

    baseVc *= swarm.factor;
    fz_nom *= swarm.factor;

    // 3. Effektiver Durchmesser
    let Deff = D;
    if (tool.geo_type === "ball") {
        let effectiveAp = Math.min(ap, D / 2);
        Deff = 2 * Math.sqrt(effectiveAp * (D - effectiveAp));
        if (Deff < 0.1) Deff = 0.1;
    } else if (tool.geo_type === "torus") {
        if (ap <= R) {
            Deff = D - 2*R + 2 * Math.sqrt(Math.pow(R, 2) - Math.pow(R - ap, 2));
        } else {
            Deff = D;
        }
        if (Deff > D) Deff = D;
        if (Deff < 0.1) Deff = 0.1;
    }

    const fz_ratio = profile.fz_ratio !== undefined ? profile.fz_ratio : 1.0;
    let base_fz = fz_nom * fz_ratio;

    // 4. 3D-Chip Thinning
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

    if (physicsActive && isRctActive) {
        fz_geo = base_fz / combined_thinning;
        if (fz_geo > fz_nom * 4.0) fz_geo = fz_nom * 4.0;
    } else if (physicsActive && !isRctActive) {
        let expected_hm = base_fz * combined_thinning;
        const hm_min = 0.004;
        if (expected_hm < hm_min) {
            fz_geo = hm_min / combined_thinning;
            if (fz_geo > fz_nom * 3.0) fz_geo = fz_nom * 3.0;
        }
    }

    // 5. Setup-Korrekturen
    let k_vc_overhang = 1.0;
    let k_fz_overhang = 1.0;
    const ld_ratio = Lmax / D;

    if (ld_ratio > 7.0) {
        k_vc_overhang = 0.60; k_fz_overhang = 0.70;
        warnings.push(`<div class="text-xs font-bold text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-300 shadow-sm flex items-start gap-2"><span class="text-base leading-none">⚠️</span> <div><strong>EXTREME AUSKRAGUNG (L/D > 7):</strong> Dynamik stark gedrosselt!</div></div>`);
    } else if (ld_ratio > 5.0) {
        k_vc_overhang = 0.80; k_fz_overhang = 0.85;
    } else if (ld_ratio > 3.5) {
        k_vc_overhang = 0.90; k_fz_overhang = 0.90;
    }

    let k_vc_holder = 1.0;
    if (holderType === 'schrumpf') k_vc_holder = 1.08;
    else if (holderType === 'hydro') k_vc_holder = 1.05;
    else if (holderType === 'weldon') k_vc_holder = 0.90;

    let k_fz_rigidity = rigidity.factor || 1.0;
    let k_vc_regrind = isRegrind ? 0.90 : 1.0;

    let effectiveVc = baseVc * k_vc_overhang * k_vc_holder * k_vc_regrind;
    let effectiveFz = fz_geo * k_fz_overhang * k_fz_rigidity;

    // Rautiefen-Begrenzer bei Radiuswerkzeugen
    if (profId.includes('schlichten') && R > 0) {
        const target_Rth = 0.003;
        const fz_surface_limit = Math.sqrt(target_Rth * 8 * R);
        if (effectiveFz > fz_surface_limit) {
            effectiveFz = fz_surface_limit;
            physicsInfoHtml += `<div class="text-[11px] text-cyan-700 font-semibold">✨ [Oberflächen-Wächter] fz limitiert auf ${effectiveFz.toFixed(4)} mm (Rth < 3µm).</div>`;
        }
    }

    // 6. Kinematik
    let n_theo = (effectiveVc * 1000) / (Math.PI * Deff);
    let n_eff = Math.min(n_theo, mach.max_rpm);
    let vf_eff = effectiveFz * z * n_eff;
    vf_eff = Math.min(vf_eff, mach.max_vf);
    let vc_eff_real = (Math.PI * Deff * n_eff) / 1000;

    // 7. REALISTISCHE RATTERGRENZE (Chatter Limit)
    // Berechnet die physikalisch stabile Schnitttiefe basierend auf Steifigkeit & Werkzeugtyp
    let ap_krit = 0;
    if (tool.geo_type === 'torus') {
        // Torusfräser: Maximal 1.0x D im Flankenschnitt bzw. max lc
        ap_krit = Math.min(D * 1.0, lc_max);
    } else if (tool.geo_type === 'ball') {
        // Kugelfräser: Maximal Radius R
        ap_krit = R;
    } else {
        // Schaftfräser: Abhängig von Auskragung (L/D)
        const ld_safe = Math.max(ld_ratio, 2.0);
        ap_krit = Math.min(D * (6.0 / Math.pow(ld_safe, 1.3)), lc_max);
    }

    const hasChatter = ap > ap_krit * 1.05;
    if (hasChatter) {
        warnings.push(`<div class="text-xs font-bold text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-300 shadow-sm flex items-start gap-2"><span class="text-base leading-none">🔔</span> <div><strong>RATTER-GEFAHR (Chatter):</strong> Schnitttiefe ap (${ap.toFixed(2)} mm) überschreitet das stabile Limit (${ap_krit.toFixed(2)} mm)! Reduziere ap oder nutze Mehrebenen-Zustellung.</div></div>`);
    }

    // 8. Kienzle & Dynamik
    let hm_real = phi_s_rad > 0 ? (effectiveFz * act_ratio * 2 * ae) / (Deff * phi_s_rad) : 0.0005;
    hm_real = Math.max(hm_real, 0.0005); 

    const mc = mat.mc !== undefined ? mat.mc : 0.25;
    let kc_raw = mat.kc11 / Math.pow(hm_real, mc);
    const kc_real = Math.min(kc_raw, 8000); 

    const Q_cm3 = (ap * ae * vf_eff) / 1000; 
    const Q_mm3 = ap * ae * vf_eff;
    const power_kw = (Q_cm3 * kc_real) / (60 * 1000); 
    const torque_nm = (power_kw * 9549.3) / n_eff;

    const mach_max_nm = mach.max_nm || 100; 
    if (torque_nm > mach_max_nm * 0.9) {
        warnings.push(`<div class="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 shadow-sm flex items-start gap-2"><span class="text-base leading-none">⚠️</span> <div><strong>SPINDEL ÜBERLASTET:</strong> Drehmoment (${torque_nm.toFixed(1)} Nm) überschreitet Limit!</div></div>`);
    }

    let z_in_cut = (phi_s_rad / (2 * Math.PI)) * z;
    let z_force_factor = Math.max(1.0, z_in_cut);
    const fc_avg = kc_real * ap * hm_real * z_force_factor;

    let runout_mm = holderType === 'spannzange' ? 0.012 : (holderType === 'weldon' ? 0.020 : 0.003);
    let fz_peak = effectiveFz + runout_mm;
    let hm_peak = Math.max(fz_peak * combined_thinning, 0.0005); 
    const kc_peak = Math.min(mat.kc11 / Math.pow(hm_peak, mc), 8000); 
    const fc_peak = kc_peak * ap * hm_peak; 
    const f_bend = fc_peak * 0.45; 

    let coreFactor = z <= 2 ? 0.50 : (z === 3 ? 0.55 : (z === 4 ? 0.65 : 0.70));
    const D_core = D * coreFactor;
    const W_b = (Math.PI * Math.pow(D_core, 3)) / 32;
    const Leff = Math.max(Lmax - (ap / 2), Lmax * 0.1);
    const M_b = f_bend * Leff; 
    const sigma_b = M_b / W_b; 

    if (sigma_b > 2500) {
        warnings.push(`<div class="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200 shadow-sm flex items-start gap-2"><span class="text-base leading-none">⚠️</span> <div><strong>BRUCHGEFAHR:</strong> Peak-Biegespannung (${sigma_b.toFixed(0)} MPa) zu hoch!</div></div>`);
    }

    return {
        rpm: n_eff,
        vf: vf_eff,
        ap,
        ae,
        lc_max,
        ap_krit,
        hasChatter,
        isFluteExceeded: ap > lc_max,
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
