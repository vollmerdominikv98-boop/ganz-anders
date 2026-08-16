export const DEFAULT_SUPABASE_URL = "https://zmyxigtqkqkwwxssritg.supabase.co";
export const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtcXdpZ3RxaXFsbnZhc3V6cmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5Mjg5MTgsImV4cCI6MjA4NzUwNDkxOH0.1_HqL3uYf_Z1sB3M6nE0Q0v2s3R1_4v5X6Z7s8Q9a0";
export const ADMIN_PASSWORD = "cnc2026";

export const defaultDb = {
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
        "schruppen": { "name": "Schruppen (Roughing)", "ap_factor": 1.0, "ae_factor": 0.7, "fz_ratio": 1.0, "rct_active": true, "description": "Maximale Zerspanungsleistung, RCT an" },
        "schlichten": { "name": "Schlichten Standard (Weiche Werkstoffe)", "ap_factor": 0.1, "ae_factor": 0.1, "fz_ratio": 0.6, "rct_active": false, "description": "Gute Oberflächengüte, kleines fz, RCT aus" },
        "schlichten_gehaertet": { "name": "Feinschlichten Gehärtet (50-65 HRC)", "ap_factor": 0.03, "ae_factor": 0.02, "fz_ratio": 0.35, "rct_active": false, "description": "Feinstschlichten, Schnittdruckkontrolle, RCT aus" },
        "hsc_trochoidal": { "name": "HSC / Trochoidal (HPC)", "ap_factor": 1.5, "ae_factor": 0.08, "fz_ratio": 1.0, "rct_active": true, "description": "Max ap, kleines ae, RCT aktiv" },
        "planfraesen": { "name": "Planfräsen (Face Milling)", "ap_factor": 0.5, "ae_factor": 0.8, "fz_ratio": 1.0, "rct_active": false, "description": "Konstanter Eingriff" }
    },
    tools: {
        "yg1_x5070_d10_r10": { "name": "Torusfräser D10 R1.0 Z4", "brand": "YG-1", "line": "X5070", "type": "Torusfräser", "geo_type": "torus", "radius": 1, "material_schneidstoff": "VHM", "diameter": 10, "z": 4, "max_overhang": 30, "fz_nom": 0.065, "vc_per_material": { "stahl_c45": 160, "stahl_1200": 130, "gehaertet_55hrc": 110, "gehaertet_60hrc": 85, "gehaertet_65hrc": 60 }, "suitable_materials": ["stahl_c45", "stahl_1200", "gehaertet_55hrc", "gehaertet_60hrc", "gehaertet_65hrc"], "suitable_profiles": ["schruppen", "schlichten", "schlichten_gehaertet", "hsc_trochoidal"] }
    },
    favorites: [],
    history: [],
    swarm_data: []
};
