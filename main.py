from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
import math

app = FastAPI(title="CNC Open Tool Guide - Vollversion", version="3.0.0")

# --- DATENBANKEN (Im Arbeitsspeicher) ---

materials_db: Dict[str, dict] = {
    "stahl_c45": {"name": "Stahl (z.B. C45)", "base_vc": 220, "kc11": 1800},
    "alu_wrought": {"name": "Aluminium (knetlegiert)", "base_vc": 600, "kc11": 700},
    "rostfrei": {"name": "Rostfreier Stahl (Inox)", "base_vc": 140, "kc11": 2400},
    "titan": {"name": "Titanlegierung", "base_vc": 60, "kc11": 2800}
}

milling_profiles: Dict[str, dict] = {
    "schruppen": {"name": "Schruppen (Roughing)", "vc_factor": 0.85, "fz_factor": 1.20, "ap_factor": 1.0, "ae_factor": 0.7},
    "schlichten": {"name": "Schlichten (Finishing)", "vc_factor": 1.20, "fz_factor": 0.50, "ap_factor": 0.2, "ae_factor": 0.1},
    "planfraesen": {"name": "Planfräsen (Face Milling)", "vc_factor": 1.0, "fz_factor": 1.0, "ap_factor": 0.5, "ae_factor": 0.8},
    "besaeumen": {"name": "Besäumen / Kantenfräsen", "vc_factor": 0.95, "fz_factor": 0.9, "ap_factor": 0.8, "ae_factor": 0.3}
}

# Vollwertige Werkzeugbibliothek mit allen wichtigen Kennwerten
tools_db: Dict[str, dict] = {
    "tool_vhm_12": {
        "name": "VHM Schaftfräser D12 (Standard)",
        "type": "Schaftfräser",
        "material_schneidstoff": "Vollhartmetall (TiAlN)",
        "diameter": 12.0,
        "z": 4,
        "max_overhang": 36.0,  # Max. Auskraglänge in mm
        "helix_angle": 30.0    # Drallwinkel in Grad
    },
    "tool_schrupp_16": {
        "name": "Schruppfräser Schrupp-Pro D16",
        "type": "Schruppfräser",
        "material_schneidstoff": "Vollhartmetall (AlCrN)",
        "diameter": 16.0,
        "z": 3,
        "max_overhang": 48.0,
        "helix_angle": 45.0
    },
    "tool_torus_10": {
        "name": "Torusfräser Eckenradius D10 R1.0",
        "type": "Torusfräser",
        "material_schneidstoff": "Vollhartmetall (AICoN)",
        "diameter": 10.0,
        "z": 2,
        "max_overhang": 30.0,
        "helix_angle": 25.0
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
    base_vc: float
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
    if not tool:
        raise HTTPException(status_code=404, detail="Werkzeug nicht gefunden")
    
    mat = materials_db.get(data.material_id)
    if not mat:
        raise HTTPException(status_code=404, detail="Material nicht gefunden")
    
    profile = milling_profiles.get(data.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Bearbeitungsprofil nicht gefunden")

    effective_vc = mat["base_vc"] * profile["vc_factor"]
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
    materials_db[mat.material_id] = {
        "name": mat.name,
        "base_vc": mat.base_vc,
        "kc11": mat.kc11
    }
    return {"message": "Material hinzugefügt", "materials": materials_db}

@app.delete("/api/admin/material/{material_id}")
def delete_material(material_id: str):
    if material_id not in materials_db:
        raise HTTPException(status_code=404, detail="Material nicht gefunden")
    del materials_db[material_id]
    return {"message": "Material erfolgreich gelöscht", "materials": materials_db}

@app.post("/api/admin/tool")
def add_tool(tool: AdminToolAdd):
    tools_db[tool.tool_id] = {
        "name": tool.name,
        "type": tool.type,
        "material_schneidstoff": tool.material_schneidstoff,
        "diameter": tool.diameter,
        "z": tool.z,
        "max_overhang": tool.max_overhang,
        "helix_angle": tool.helix_angle
    }
    return {"message": "Werkzeug hinzugefügt", "tools": tools_db}

@app.delete("/api/admin/tool/{tool_id}")
def delete_tool(tool_id: str):
    if tool_id not in tools_db:
        raise HTTPException(status_code=404, detail="Werkzeug nicht gefunden")
    del tools_db[tool_id]
    return {"message": "Werkzeug erfolgreich gelöscht", "tools": tools_db}
