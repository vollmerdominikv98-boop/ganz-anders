export const DEFAULT_SUPABASE_URL = "";
export const DEFAULT_SUPABASE_KEY = "";
export const ADMIN_PASSWORD = "cnc2026";

export const defaultDb = {
    // HINWEIS "mfr_ap_slot" / "mfr_ap_light" (optional, pro Werkzeug in der Admin-Oberfläche pflegbar):
    // Reale, aus dem Datenblatt des Werkzeugherstellers übernommene ap-Grenzwerte -
    // "mfr_ap_slot" = max. ap bei vollem radialen Eingriff (Nutfräsen/ae=D)
    // "mfr_ap_light" = max. ap bei leichtem radialen Eingriff (ae <= 20% D, z.B. Schlichten/Trochoidal)
    // Sind beide Werte gepflegt, nutzt die App AUSSCHLIESSLICH diese (Ebene 1: Herstellerdaten).
    // Fehlen sie, greift automatisch eine konservative Faustregel (Ebene 2, siehe physics.js).
    // Ohne belegbare Quelle werden hier bewusst KEINE Werte vorbefüllt.
    machines: {
        "dmg_5achs": { "name": "DMG DMU 75 Monoblock", "max_rpm": 15000, "max_vf": 30000, "max_kw": 18, "max_nm": 130 },
        "dmg_3achs": { "name": "DMG Mori DMC 850V", "max_rpm": 15000, "max_vf": 30000, "max_kw": 15, "max_nm": 85 }
    },
    materials: {
        "stahl_c45": { "name": "Stahl < 850 N/mm² (z.B. C45, St52)", "kc11": 1800, "mc": 0.22 },
        "stahl_1200": { "name": "Werkzeugstahl ungehärtet < 1200 N/mm²", "kc11": 2200, "mc": 0.24 },
        "gehaertet_55hrc": { "name": "Gehärteter Stahl (~55 HRC)", "kc11": 3000, "mc": 0.15 },
        "gehaertet_60hrc": { "name": "Gehärteter Stahl (~60 HRC)", "kc11": 3400, "mc": 0.15 },
        "gehaertet_65hrc": { "name": "Gehärteter Stahl (~65 HRC)", "kc11": 3800, "mc": 0.15 },
        "rostfrei": { "name": "Rostfreier Stahl (Inox < 750 N/mm²)", "kc11": 2400, "mc": 0.24 },
        "alu_wrought": { "name": "Aluminium (knetlegiert)", "kc11": 700, "mc": 0.25 }
    },
    rigidity: {
        "hoch": { "name": "Hoch (Schwere Portalmaschine / VHM Setup)", "factor": 1.10 },
        "mittel": { "name": "Mittel (Standard BAZ Setup)", "factor": 1.0 },
        "gering": { "name": "Gering (Leichte C-Frame / Lange Auskragung)", "factor": 0.85 }
    },
    profiles: {
        "schruppen": { "name": "Schruppen (Roughing)", "ap_factor": 1.0, "ae_factor": 0.7, "fz_ratio": 1.0, "rct_active": true },
        "schlichten": { "name": "Schlichten (Finishing)", "ap_factor": 0.1, "ae_factor": 0.1, "fz_ratio": 0.6, "rct_active": false },
        "schlichten_gehaertet": { "name": "Feinschlichten Gehärtet (50-65 HRC)", "ap_factor": 0.05, "ae_factor": 0.05, "fz_ratio": 0.35, "rct_active": false, "max_ap_limit": 0.25, "max_ae_limit": 0.20 },
        "hsc_trochoidal": { "name": "HSC / Trochoidal (HPC)", "ap_factor": 1.5, "ae_factor": 0.08, "fz_ratio": 1.0, "rct_active": true },
        "planfraesen": { "name": "Planfräsen (Face Milling)", "ap_factor": 0.5, "ae_factor": 0.8, "fz_ratio": 1.0, "rct_active": false }
    },
    tools: {
        "yg1_x5070_d10_r10": { 
            "name": "Torusfräser D10 R1.0 Z4", "brand": "YG-1", "line": "X5070", "type": "Torusfräser", "geo_type": "torus", "radius": 1.0, "material_schneidstoff": "VHM", "diameter": 10, "z": 4, "max_overhang": 35, "flute_len": 12, "fz_nom": 0.045, 
            "vc_per_material": { "gehaertet_55hrc": 110, "gehaertet_60hrc": 85, "gehaertet_65hrc": 60 }, 
            "suitable_materials": ["gehaertet_55hrc", "gehaertet_60hrc", "gehaertet_65hrc"], 
            "suitable_profiles": ["schlichten_gehaertet", "hsc_trochoidal"] 
        },
        "yg1_x5070_d8_r05": { 
            "name": "Torusfräser D8 R0.5 Z4", "brand": "YG-1", "line": "X5070", "type": "Torusfräser", "geo_type": "torus", "radius": 0.5, "material_schneidstoff": "VHM", "diameter": 8, "z": 4, "max_overhang": 28, "flute_len": 10, "fz_nom": 0.038, 
            "vc_per_material": { "gehaertet_55hrc": 110, "gehaertet_60hrc": 85, "gehaertet_65hrc": 60 }, 
            "suitable_materials": ["gehaertet_55hrc", "gehaertet_60hrc", "gehaertet_65hrc"], 
            "suitable_profiles": ["schlichten_gehaertet", "hsc_trochoidal"] 
        },
        "yg1_x5070_d6_r05": { 
            "name": "Torusfräser D6 R0.5 Z4", "brand": "YG-1", "line": "X5070", "type": "Torusfräser", "geo_type": "torus", "radius": 0.5, "material_schneidstoff": "VHM", "diameter": 6, "z": 4, "max_overhang": 22, "flute_len": 8, "fz_nom": 0.030, 
            "vc_per_material": { "gehaertet_55hrc": 105, "gehaertet_60hrc": 80, "gehaertet_65hrc": 55 }, 
            "suitable_materials": ["gehaertet_55hrc", "gehaertet_60hrc", "gehaertet_65hrc"], 
            "suitable_profiles": ["schlichten_gehaertet", "hsc_trochoidal"] 
        },
        "yg1_x5070_d6_kugel": { 
            "name": "Kugelfräser D6 R3.0 Z2", "brand": "YG-1", "line": "X5070", "type": "Kugelfräser", "geo_type": "ball", "radius": 3.0, "material_schneidstoff": "VHM", "diameter": 6, "z": 2, "max_overhang": 25, "flute_len": 6, "fz_nom": 0.035, 
            "vc_per_material": { "gehaertet_55hrc": 120, "gehaertet_60hrc": 95, "gehaertet_65hrc": 70 }, 
            "suitable_materials": ["gehaertet_55hrc", "gehaertet_60hrc", "gehaertet_65hrc"], 
            "suitable_profiles": ["schlichten_gehaertet"] 
        },
        "garant_master_d16": { 
            "name": "Schaftfräser D16 Z4 HPC", "brand": "Garant", "line": "MasterSteel", "type": "Schaftfräser", "geo_type": "shaft", "radius": 0, "material_schneidstoff": "VHM", "diameter": 16, "z": 4, "max_overhang": 50, "flute_len": 32, "fz_nom": 0.100, 
            "vc_per_material": { "stahl_c45": 200, "stahl_1200": 160, "rostfrei": 110 }, 
            "suitable_materials": ["stahl_c45", "stahl_1200", "rostfrei"], 
            "suitable_profiles": ["schruppen", "schlichten", "hsc_trochoidal", "planfraesen"] 
        },
        "garant_master_d12": { 
            "name": "Schaftfräser D12 Z4 HPC", "brand": "Garant", "line": "MasterSteel", "type": "Schaftfräser", "geo_type": "shaft", "radius": 0, "material_schneidstoff": "VHM", "diameter": 12, "z": 4, "max_overhang": 40, "flute_len": 26, "fz_nom": 0.080, 
            "vc_per_material": { "stahl_c45": 200, "stahl_1200": 160, "rostfrei": 110 }, 
            "suitable_materials": ["stahl_c45", "stahl_1200", "rostfrei"], 
            "suitable_profiles": ["schruppen", "schlichten", "hsc_trochoidal", "planfraesen"] 
        },
        "garant_master_d10": { 
            "name": "Schaftfräser D10 Z4 HPC", "brand": "Garant", "line": "MasterSteel", "type": "Schaftfräser", "geo_type": "shaft", "radius": 0, "material_schneidstoff": "VHM", "diameter": 10, "z": 4, "max_overhang": 32, "flute_len": 22, "fz_nom": 0.068, 
            "vc_per_material": { "stahl_c45": 200, "stahl_1200": 160, "rostfrei": 110 }, 
            "suitable_materials": ["stahl_c45", "stahl_1200", "rostfrei"], 
            "suitable_profiles": ["schruppen", "schlichten", "hsc_trochoidal", "planfraesen"] 
        },
        "garant_master_d8": { 
            "name": "Schaftfräser D8 Z4 HPC", "brand": "Garant", "line": "MasterSteel", "type": "Schaftfräser", "geo_type": "shaft", "radius": 0, "material_schneidstoff": "VHM", "diameter": 8, "z": 4, "max_overhang": 26, "flute_len": 19, "fz_nom": 0.055, 
            "vc_per_material": { "stahl_c45": 190, "stahl_1200": 150, "rostfrei": 100 }, 
            "suitable_materials": ["stahl_c45", "stahl_1200", "rostfrei"], 
            "suitable_profiles": ["schruppen", "schlichten", "hsc_trochoidal"] 
        },
        "hoffmann_alu_d12": { 
            "name": "Alu-Fräser D12 Z3", "brand": "Hoffmann", "line": "AluLine", "type": "Schaftfräser", "geo_type": "shaft", "radius": 0, "material_schneidstoff": "VHM", "diameter": 12, "z": 3, "max_overhang": 45, "flute_len": 26, "fz_nom": 0.120, 
            "vc_per_material": { "alu_wrought": 650 }, 
            "suitable_materials": ["alu_wrought"], 
            "suitable_profiles": ["schruppen", "schlichten", "hsc_trochoidal", "planfraesen"] 
        },
        "hoffmann_alu_d8": { 
            "name": "Alu-Fräser D8 Z3", "brand": "Hoffmann", "line": "AluLine", "type": "Schaftfräser", "geo_type": "shaft", "radius": 0, "material_schneidstoff": "VHM", "diameter": 8, "z": 3, "max_overhang": 30, "flute_len": 19, "fz_nom": 0.085, 
            "vc_per_material": { "alu_wrought": 600 }, 
            "suitable_materials": ["alu_wrought"], 
            "suitable_profiles": ["schruppen", "schlichten", "hsc_trochoidal"] 
        }
    },
    favorites: [],
    history: [],
    swarm_data: []
};

export function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}
