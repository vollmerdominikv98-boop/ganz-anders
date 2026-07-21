from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
import math

app = FastAPI(title="CNC Open Tool Guide - Werkzeug-Material-Filter", version="6.0.0")

# --- DATENBANKEN ---

materials_db: Dict[str, dict] = {
    "stahl_c45": {"name": "Stahl (z.B. C45)", "kc11": 1800},
    "alu_wrought": {"name": "Aluminium (knetlegiert)", "kc11": 700},
    "rostfrei": {"name": "Rostfreier Stahl (Inox)", "kc11": 2400},
    "titan": {"name": "Titanlegierung", "kc11": 2800},
    "gehaertet_55hrc": {"name": "Gehärteter Stahl (55 HRC)", "kc11": 3200} # Neu als Beispiel für gehärtetes Material
}

milling_profiles: Dict[str, dict] = {
    "schruppen": {
        "name": "Schruppen (Roughing)",
        "vc_factor": 0.85,
        "fz_factor": 1.20,
        "ap_factor": 1.0,
        "ae_factor": 0.7,
        "description": "Hohes Spanvolumen, reduziertes vc, hoher Vorschub"
    },
    "schlichten": {
        "name": "Schlichten (Finishing)",
        "vc_factor": 1.20,
        "fz_factor": 0.50,
        "ap_factor": 0.2,
        "ae_factor": 0.1,
        "description": "Hohe Oberflächengüte, hohes vc, feiner Vorschub"
    },
    "planfraesen": {
        "name": "Planfräsen (Face Milling)",
        "vc_factor": 1.0,
        "fz_factor": 1.0,
        "ap_factor": 0.5,
        "ae_factor": 0.8,
        "description": "Standard-Flächenbearbeitung"
    },
    "besaeumen": {
        "name": "Besäumen / Kantenfräsen",
        "vc_factor": 0.95,
        "fz_factor": 0.9,
        "ap_factor": 0.8,
        "ae_factor": 0.3,
        "description": "Kanten- und Konturbearbeitung"
    }
}

# Werkzeuge enthalten nun zusätzlich 'suitable_materials' (Liste der erlaubten Material-IDs)
tools_db: Dict[str, dict] = {
    "tool_vhm_12": {
        "name": "VHM Schaftfräser D12 (Standard)",
        "type": "Schaftfräser",
        "material_schneidstoff": "VHM",
        "diameter": 12.0,
        "z": 4,
        "max_overhang": 36.0,
        "helix_angle": 30.0,
        "vc_per_material": {
            "stahl_c45": 220,
            "alu_wrought": 600,
            "rostfrei": 140,
            "titan": 60
        },
        "suitable_materials": ["stahl_c45", "alu_wrought", "rostfrei", "titan"] # EXKLUDIERT gehaertet_55hrc bewusst!
    },
    "tool_schrupp_16": {
        "name": "Schruppfräser Schrupp-Pro D16",
        "type": "Schruppfräser",
        "material_schneidstoff": "VHM",
        "diameter": 16.0,
        "z": 3,
        "max_overhang": 48.0,
        "helix_angle": 45.0,
        "vc_per_material": {
            "stahl_c45": 180,
            "alu_wrought": 500,
            "rostfrei": 110,
            "titan": 45
        },
        "suitable_materials": ["stahl_c45", "rostfrei"]
    }
}

# --- INPUT MODELLE ---

class CalculationRequest(BaseModel):
    tool_id: str
    material_id: str
    profile_id: str
    custom_ap: Optional[float] = None
    custom_ae: Optional[float] = None

class AdminMaterialAdd(BaseModel):
    material_id: str
    name: str
    kc11: float

class AdminToolAdd(BaseModel):
    tool_id: str
    name: str
    type: str
    material_schneidstoff: str
    diameter: float
    z: int
    max_overhang: float
    helix_angle: float
    vc_per_material: Dict[str, float]
    suitable_materials: List[str]

class AdminProfileAdd(BaseModel):
    profile_id: str
    name: str
    vc_factor: float
    fz_factor: float
    ap_factor: float
    ae_factor: float
    description: str

# --- ROUTEN ---

@app.get("/api/data")
def get_initial_data():
    return {
        "materials": materials_db,
        "profiles": milling_profiles,
        "tools": tools_db
    }

@app.post("/api/calculate")
def calculate_advanced_milling(data: CalculationRequest):
    tool = tools_db.get(data.tool_id)
    mat = materials_db.get(data.material_id)
    profile = milling_profiles.get(data.profile_id)
    
    if not tool or not mat or not profile:
        raise HTTPException(status_code=404, detail="Ungültige Parameter übergeben")

    # Sicherheitsprüfung: Ist das Werkzeug für dieses Material freigegeben?
    suitable_list = tool.get("suitable_materials", [])
    if suitable_list and data.material_id not in suitable_list:
        raise HTTPException(status_code=400, detail=f"Das Werkzeug '{tool['name']}' ist für das Material '{mat['name']}' nicht zugelassen!")

    base_vc = tool.get("vc_per_material", {}).get(data.material_id, 200)
    effective_vc = base_vc * profile["vc_factor"]
    
    base_fz = tool["diameter"] * 0.007
    effective_fz = base_fz * profile["fz_factor"]

    D = tool["diameter"]
    z = tool["z"]
    
    ap = data.custom_ap if data.custom_ap is not None else (D * profile["ap_factor"])
    ae = data.custom_ae if data.custom_ae is not None else (D * profile["ae_factor"])

    n = (effective_vc * 1000) / (math.pi * D)
    vf = effective_fz * z * n
    Q = (ap * ae * vf) / 1000
    power_kw = (Q * mat["kc11"]) / (60 * 1000)

    return {
        "tool_name": tool["name"],
        "material_name": mat["name"],
        "profile_name": profile["name"],
        "effective_vc": round(effective_vc, 2),
        "rpm": round(n, 2),
        "feed_rate_vf": round(vf, 2),
        "ap": round(ap, 2),
        "ae": round(ae, 2),
        "metal_removal_rate_q": round(Q, 2),
        "power_required_kw": round(power_kw, 2)
    }

@app.post("/api/admin/material")
def add_material(mat: AdminMaterialAdd):
    materials_db[mat.material_id] = {"name": mat.name, "kc11": mat.kc11}
    return {"message": "Material hinzugefügt"}

@app.delete("/api/admin/material/{material_id}")
def delete_material(material_id: str):
    if material_id in materials_db:
        del materials_db[material_id]
        # Auch aus Eignungslisten der Werkzeuge entfernen
        for t in tools_db.values():
            if material_id in t.get("suitable_materials", []):
                t["suitable_materials"].remove(material_id)
    return {"message": "Gelöscht"}

@app.post("/api/admin/tool")
def add_tool(tool: AdminToolAdd):
    tools_db[tool.tool_id] = tool.dict()
    return {"message": "Werkzeug hinzugefügt"}

@app.delete("/api/admin/tool/{tool_id}")
def delete_tool(tool_id: str):
    if tool_id in tools_db:
        del tools_db[tool_id]
    return {"message": "Gelöscht"}

@app.post("/api/admin/profile")
def add_profile(profile: AdminProfileAdd):
    milling_profiles[profile.profile_id] = profile.dict()
    return {"message": "Profil hinzugefügt"}

@app.delete("/api/admin/profile/{profile_id}")
def delete_profile(profile_id: str):
    if profile_id in milling_profiles:
        del milling_profiles[profile_id]
    return {"message": "Gelöscht"}
