from fastapi import FastAPI
from pydantic import BaseModel
import math

app = FastAPI(title="CNC Math Engine", version="1.0.0")

class MillingInput(BaseModel):
    vc: float          # Schnittgeschwindigkeit in m/min
    diameter: float    # Fräserdurchmesser D in mm
    fz: float          # Vorschub pro Zahn in mm
    z: int             # Anzahl der Zähne
    ap: float          # Schnitttiefe in mm
    ae: float          # Schnittbreite in mm
    kc11: float = 2000 # Spezifische Schnittkraft N/mm²

@app.post("/calculate/milling")
def calculate_milling(data: MillingInput):
    n = (data.vc * 1000) / (math.pi * data.diameter)
    vf = data.fz * data.z * n
    Q = (data.ap * data.ae * vf) / 1000
    power_kw = (Q * data.kc11) / (60 * 1000)

    return {
        "rpm": round(n, 2),
        "feed_rate_vf": round(vf, 2),
        "metal_removal_rate_q": round(Q, 2),
        "power_required_kw": round(power_kw, 2)
    }
