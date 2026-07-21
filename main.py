from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
import math

app = FastAPI(title="CNC Open Tool Guide - Admin & Math Engine", version="2.0.0")

# --- DATENBANK-MODELLE (Im Arbeitsspeicher für den Prototypen) ---

# Materialien mit werkstoffspezifischen Grund-Schnittgeschwindigkeiten (vc)
materials_db: Dict[str, dict] = {
    "stahl_c45": {"name": "Stahl (z.B. C45)", "base_vc": 220, "kc11": 1800},
    "alu_wrought": {"name": "Aluminium (knetlegiert)", "base_vc": 600, "kc11": 700},
    "rostfrei": {"name": "Rostfreier Stahl (Inox)", "base_vc": 140, "kc11": 2400},
    "titan": {"name": "Titanlegierung", "base_vc": 60, "kc11": 2800}
}

# Bearbeitungsprofile mit Faktoren, die sich auf Schnittdaten auswirken
milling_profiles: Dict[str, dict] = {
    "schruppen": {
        "name": "Schruppen (Roughing)",
        "vc_factor": 0.85,  # Etwas langsamer wegen hoher Belastung
        "fz_factor": 1.20,  # Höherer Vorschub pro Zahn
        "ap_factor": 1.0,   # Volle Tiefe
        "ae_factor": 0.7    # Hoher Eingriff
    },
    "schlichten": {
        "name": "Schlichten (Finishing)",
        "vc_factor": 1.20,  # Höhere Schnittgeschwindigkeit für gute Oberfläche
        "fz_factor": 0.50,  # Feiner Vorschub für glatte Oberflächen
        "ap_factor": 0.2,   # Flache Zustellung
        "ae_factor": 0.1    # Geringe Schnittbreite
    },
    "planfraesen": {
        "name": "Planfräsen (Face Milling)",
        "vc_factor": 1.0,
        "fz_factor": 1.0,
        "ap_factor": 0.5,
        "ae_factor": 0.8
    },
    "besaeumen": {
        "name": "Besäumen / Kantenfräsen",
        "vc_factor": 0.95,
        "fz_factor": 0.9,
        "ap_factor": 0.8,
        "ae_factor": 0.3
    }
}

# Vordefinierte Werkzeuge
tools_db: List[dict] = [
    {"id": "tool_1", "name": "Vollhartmetall Schaftfräser D12", "diameter": 12, "z": 4},
    {"id": "tool_2", "name": "Schruppfräser Schrupp-Pro D16", "diameter": 16, "z": 3},
    {"id": "tool_3", "name": "Mini-Fräser D6", "diameter": 6, "z": 2}
]

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

# --- ROUTEN & BERECHNUNGSKERN ---

@app.get("/api/data")
def get_initial_data():
    """Gibt alle Materialien, Werkzeuge und Profile für das Frontend/Admin zurück"""
    return {
        "materials": materials_db,
        "profiles": milling_profiles,
        "tools": tools_db
    }

@app.post("/api/calculate")
def calculate_advanced_milling(data: CalculationRequest):
    # 1. Werkzeug finden
    tool = next((t for t in tools_db if t["id"] == data.tool_id), None)
    if not tool:
        raise HTTPException(status_code=404, detail="Werkzeug nicht gefunden")
    
    # 2. Material finden
    mat = materials_db.get(data.material_id)
    if not mat:
        raise HTTPException(status_code=404, detail="Material nicht gefunden")
    
    # 3. Profil finden
    profile = milling_profiles.get(data.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Bearbeitungsprofil nicht gefunden")

    # --- MATHEMATISCHE BERECHNUNG MIT FAKTOREN ---
    # Effektive Schnittgeschwindigkeit durch Profilfaktor angepasst
    effective_vc = mat["base_vc"] * profile["vc_factor"]
    
    # Standard-Vorschub pro Zahn (abhängig vom Werkzeugdurchmesser geschätzt, falls nicht fix)
    base_fz = tool["diameter"] * 0.007 
    effective_fz = base_fz * profile["fz_factor"]

    D = tool["diameter"]
    z = tool["z"]
    
    # Zustellungen basierend auf Profil oder Benutzeroverride
    ap = data.custom_ap if data.custom_ap is not None else (D * profile["ap_factor"])
    ae = data.custom_ae if data.custom_ae is not None else (D * profile["ae_factor"])

    # Physikalische Formeln
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
    """Admin-Funktion: Neues Material hinzufügen"""
    materials_db[mat.material_id] = {
        "name": mat.name,
        "base_vc": mat.base_vc,
        "kc11": mat.kc11
    }
    return {"message": f"Material {mat.name} erfolgreich hinzugefügt!", "materials": materials_db}
