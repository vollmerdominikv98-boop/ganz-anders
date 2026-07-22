from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
import math

app = FastAPI(title="ToolPilot - CNC Cut Optimizer Backend", version="8.0.0")

# --- SERVER-SEITIGE DATENBANKEN ---

machines_db: Dict[str, dict] = {
    "std_cnc": {"name": "Standard CNC Fräse", "max_rpm": 12000, "max_vf": 12000, "max_kw": 20},
    "heavy_cnc": {"name": "Schweres Bearbeitungszentrum", "max_rpm": 8000, "max_vf": 15000, "max_kw": 45},
    "hsc_micro": {"name": "HSC Micro-Fräse", "max_rpm": 30000, "max_vf": 20000, "max_kw": 12}
}

materials_db: Dict[str, dict] = {
    "stahl_c45": {"name": "Stahl (z.B. C45)", "kc11": 1800},
    "alu_wrought": {"name": "Aluminium (knetlegiert)", "kc11": 700},
    "rostfrei": {"name": "Rostfreier Stahl (Inox)", "kc11": 2400},
    "titan": {"name": "Titanlegierung", "kc11": 2800},
    "gehaertet_55hrc": {"name": "Gehärteter Stahl (55 HRC)", "kc11": 3200}
}

rigidity_db: Dict[str, dict] = {
    "hoch": {"name": "Hoch (VHM / Kurze Auskragung)", "factor": 1.15},
    "mittel": {"name": "Mittel (Standard Setup)", "factor": 1.0},
    "gering": {"name": "Gering (Lange Auskragung / Vibrationsgefahr)", "factor": 0.70}
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
    "hsc_trochoidal": {
        "name": "HSC / Trochoidal (kleines ae)",
        "vc_factor": 1.40,
        "fz_factor": 1.0,
        "ap_factor": 0.8,
        "ae_factor": 0.08,
        "description": "Geringe radiale Eintauchtiefe, ideal für RCT"
    },
    "planfraesen": {
        "name": "Planfräsen (Face Milling)",
        "vc_factor": 1.0,
        "fz_factor": 1.0,
        "ap_factor": 0.5,
        "ae_factor": 0.8,
        "description": "Standard-Flächenbearbeitung"
    }
}

tools_db: Dict[str, dict] = {
    "tool_vhm_12": {
        "name": "GARANT VHM Schaftfräser D12",
        "brand": "GARANT",
        "line": "MasterSteel",
        "type": "Schaftfräser",
        "geo_type": "shaft",
        "radius": 0.0,
        "material_schneidstoff": "VHM",
        "diameter": 12.0,
        "z": 4,
        "max_overhang": 36.0,
        "vc_per_material": {
            "stahl_c45": 220,
            "alu_wrought": 600,
            "rostfrei": 140,
            "titan": 60
        },
        "suitable_materials": ["stahl_c45", "alu_wrought", "rostfrei", "titan"],
        "suitable_profiles": ["schruppen", "schlichten", "hsc_trochoidal", "planfraesen"]
    },
    "tool_kugel_10": {
        "name": "HOFFMANN VHM Kugelfräser D10",
        "brand": "HOFFMANN",
        "line": "HPC Universal",
        "type": "Kugelfräser",
        "geo_type": "ball",
        "radius": 5.0,
        "material_schneidstoff": "VHM",
        "diameter": 10.0,
        "z": 2,
        "max_overhang": 30.0,
        "vc_per_material": {
            "stahl_c45": 200,
            "alu_wrought": 550,
            "rostfrei": 120,
            "titan": 50
        },
        "suitable_materials": ["stahl_c45", "alu_wrought", "rostfrei", "titan"],
        "suitable_profiles": ["schlichten", "hsc_trochoidal"]
    }
}

favorites_db: List[dict] = []

# --- INPUT MODELLE ---

class CalculationRequest(BaseModel):
    machine_id: str = "std_cnc"
    tool_id: str
    material_id: str
    profile_id: str
    rigidity_id: str = "mittel"
    custom_ap: Optional[float] = None  # in mm
    custom_ae: Optional[float] = None  # in mm
    physics_active: bool = True

class FavoriteSaveRequest(BaseModel):
    title: str
    tool_id: str
    material_id: str
    profile_id: str
    rigidity_id: str
    rating: int
    feedback: str
    rpm: float
    feed_rate_vf: float
    ap_mm: float
    ae_mm: float

class AdminMachineAdd(BaseModel):
    machine_id: str
    name: str
    max_rpm: float
    max_vf: float
    max_kw: float

class AdminMaterialAdd(BaseModel):
    material_id: str
    name: str
    kc11: float

class AdminRigidityAdd(BaseModel):
    rigidity_id: str
    name: str
    factor: float

class AdminToolAdd(BaseModel):
    tool_id: str
    name: str
    brand: Optional[str] = ""
    line: Optional[str] = ""
    type: str
    geo_type: str = "shaft"  # "shaft", "ball", "torus"
    radius: float = 0.0
    material_schneidstoff: str = "VHM"
    diameter: float
    z: int
    max_overhang: float
    vc_per_material: Dict[str, float]
    suitable_materials: List[str]
    suitable_profiles: List[str]

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
        "machines": machines_db,
        "materials": materials_db,
        "rigidity": rigidity_db,
        "profiles": milling_profiles,
        "tools": tools_db,
        "favorites": favorites_db
    }

@app.post("/api/calculate")
def calculate_advanced_milling(data: CalculationRequest):
    mach = machines_db.get(data.machine_id)
    tool = tools_db.get(data.tool_id)
    mat = materials_db.get(data.material_id)
    profile = milling_profiles.get(data.profile_id)
    rigidity = rigidity_db.get(data.rigidity_id, {"factor": 1.0})
    
    if not mach or not tool or not mat or not profile:
        raise HTTPException(status_code=404, detail="Ungültige Konfigurationsparameter übergeben")

    D = tool["diameter"]
    z = tool["z"]
    
    # Zustellungen in mm ermitteln
    ap = data.custom_ap if data.custom_ap is not None else (D * profile["ap_factor"])
    ae = data.custom_ae if data.custom_ae is not None else (D * profile["ae_factor"])

    ap_factor = ap / D
    ae_factor = ae / D

    # 1. Effective Diameter (Deff) Berechnung
    geo_type = tool.get("geo_type", "shaft")
    r = tool.get("radius", 0.0)
    Deff = D

    if geo_type == "ball":
        eff_ap = min(ap, D / 2.0)
        Deff = 2.0 * math.sqrt(eff_ap * (D - eff_ap)) if eff_ap > 0 else 0.1
    elif geo_type == "torus":
        if ap <= r:
            Deff = 2.0 * math.sqrt(ap * (2.0 * r - ap)) if ap > 0 else 0.1
        else:
            term = r * r - math.pow(r - (ap - r), 2)
            Deff = D - (2.0 * r) + (2.0 * math.sqrt(max(0, term)))

    Deff = max(Deff, 0.1)

    # 2. Schnittwerte & Physik-Korrekturen
    base_vc = tool.get("vc_per_material", {}).get(data.material_id, 200)
    effective_vc = base_vc * profile["vc_factor"] * rigidity["factor"]
    
    base_fz = D * 0.007
    effective_fz = base_fz * profile["fz_factor"] * rigidity["factor"]

    if data.physics_active:
        # Kühlungseffekt bei kleinem ae
        if ae_factor < 0.5:
            kv_ae = min(math.pow(0.5 / ae_factor, 0.3), 2.5)
            effective_vc *= kv_ae

        # Schnittdruck bei großem ap
        if ap_factor > 1.0 and geo_type == "shaft":
            k_ap = max(math.pow(1.0 / ap_factor, 0.25), 0.4)
            effective_vc *= k_ap
            effective_fz *= k_ap

        # RCT (Radial Chip Thinning) Spanmittendicke
        if ae_factor < 0.5:
            rct_factor = min(1.0 / math.sqrt(ae_factor * (2.0 - ae_factor)), 3.0)
            effective_fz *= rct_factor

    # 3. Mathematische Formeln
    n = (effective_vc * 1000.0) / (math.pi * Deff)
    vf = effective_fz * z * n
    Q = (ap * ae * vf) / 1000.0
    power_kw = (Q * mat["kc11"]) / (60.0 * 1000.0)

    return {
        "tool_name": tool["name"],
        "material_name": mat["name"],
        "profile_name": profile["name"],
        "effective_deff": round(Deff, 2),
        "effective_vc": round(effective_vc, 2),
        "effective_fz": round(effective_fz, 4),
        "rpm": round(n, 2),
        "feed_rate_vf": round(vf, 2),
        "ap_mm": round(ap, 2),
        "ae_mm": round(ae, 2),
        "metal_removal_rate_q": round(Q, 2),
        "power_required_kw": round(power_kw, 2),
        "exceeds_max_rpm": n > mach["max_rpm"],
        "exceeds_max_vf": vf > mach["max_vf"],
        "exceeds_max_kw": power_kw > mach["max_kw"]
    }

@app.post("/api/favorites")
def save_favorite(fav: FavoriteSaveRequest):
    new_fav = fav.dict()
    new_fav["id"] = f"fav_{len(favorites_db) + 1}"
    favorites_db.append(new_fav)
    return {"message": "Erfolgreich in den Praxis-Favoriten gespeichert!", "favorite": new_fav}

@app.delete("/api/favorites/{fav_id}")
def delete_favorite(fav_id: str):
    global favorites_db
    favorites_db = [f for f in favorites_db if f["id"] != fav_id]
    return {"message": "Favorit gelöscht"}

# --- ADMIN ROUTEN ---

@app.post("/api/admin/machine")
def add_machine(mach: AdminMachineAdd):
    machines_db[mach.machine_id] = mach.dict()
    return {"message": "Maschine hinzugefügt"}

@app.delete("/api/admin/machine/{machine_id}")
def delete_machine(machine_id: str):
    if machine_id in machines_db:
        del machines_db[machine_id]
    return {"message": "Maschine gelöscht"}

@app.post("/api/admin/material")
def add_material(mat: AdminMaterialAdd):
    materials_db[mat.material_id] = {"name": mat.name, "kc11": mat.kc11}
    return {"message": "Material hinzugefügt"}

@app.delete("/api/admin/material/{material_id}")
def delete_material(material_id: str):
    if material_id in materials_db:
        del materials_db[material_id]
        for t in tools_db.values():
            if material_id in t.get("suitable_materials", []):
                t["suitable_materials"].remove(material_id)
    return {"message": "Material gelöscht"}

@app.post("/api/admin/rigidity")
def add_rigidity(rig: AdminRigidityAdd):
    rigidity_db[rig.rigidity_id] = {"name": rig.name, "factor": rig.factor}
    return {"message": "Steifigkeit hinzugefügt"}

@app.delete("/api/admin/rigidity/{rigidity_id}")
def delete_rigidity(rigidity_id: str):
    if rigidity_id in rigidity_db:
        del rigidity_db[rigidity_id]
    return {"message": "Steifigkeit gelöscht"}

@app.post("/api/admin/tool")
def add_tool(tool: AdminToolAdd):
    tools_db[tool.tool_id] = tool.dict()
    return {"message": "Werkzeug hinzugefügt"}

@app.delete("/api/admin/tool/{tool_id}")
def delete_tool(tool_id: str):
    if tool_id in tools_db:
        del tools_db[tool_id]
    return {"message": "Werkzeug gelöscht"}

@app.post("/api/admin/profile")
def add_profile(profile: AdminProfileAdd):
    milling_profiles[profile.profile_id] = profile.dict()
    return {"message": "Profil hinzugefügt"}

@app.delete("/api/admin/profile/{profile_id}")
def delete_profile(profile_id: str):
    if profile_id in milling_profiles:
        del milling_profiles[profile_id]
    return {"message": "Profil gelöscht"}
