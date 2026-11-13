"""
Script de descarga y generación de datos CSV reales para la visualización 3D:
1. Corrientes oceánicas reales desde Open-Meteo Marine API -> `src/corrientes.csv`
2. Red global completa de 239 corredores marítimos reales (Major, Middle, Minor)
   desde `newzealandpaul/Shipping-Lanes` -> `src/rutas_maritimas.csv`
3. Posiciones AIS en tiempo real (Mar Báltico / Norte de Europa) desde Digitraffic
   Marine API -> `src/ais_live.csv` (opcional para superposición real en directo)

Uso:
    python scripts/fetch_ocean_data.py
"""

import csv
import gzip
import json
import math
import os
import urllib.error
import urllib.request

SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
SHIPPING_LANES_URL = (
    "https://raw.githubusercontent.com/newzealandpaul/Shipping-Lanes/main/data/Shipping_Lanes_v1.geojson"
)
DIGITRAFFIC_AIS_URL = "https://meri.digitraffic.fi/api/ais/v1/locations"


def fetch_open_meteo_currents(lat_step=10, lon_step=10):
    """Consulta Open-Meteo Marine API en lotes y devuelve filas (lat, lon, u, v)."""
    coords = []
    for lat in range(-65, 70, lat_step):
        for lon in range(-175, 180, lon_step):
            coords.append((lat, lon))

    filas = []
    batch_size = 80
    print(f"Consultando Open-Meteo Marine API para {len(coords)} puntos globales...")

    for i in range(0, len(coords), batch_size):
        batch = coords[i : i + batch_size]
        lats = ",".join(str(c[0]) for c in batch)
        lons = ",".join(str(c[1]) for c in batch)
        url = (
            f"https://marine-api.open-meteo.com/v1/marine"
            f"?latitude={lats}&longitude={lons}"
            f"&current=ocean_current_velocity,ocean_current_direction"
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "IG-S8-OceanViz/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, dict):
                    data = [data]
                for idx, item in enumerate(data):
                    cur = item.get("current", {})
                    vel = cur.get("ocean_current_velocity")
                    direc = cur.get("ocean_current_direction")
                    if vel is not None and direc is not None:
                        rad = math.radians(direc)
                        speed_ms = float(vel) / 3.6
                        u = round(speed_ms * math.sin(rad), 4)
                        v = round(speed_ms * math.cos(rad), 4)
                        lat_orig, lon_orig = batch[idx]
                        filas.append((lat_orig, lon_orig, u, v))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
            print(f"Aviso en lote {i // batch_size + 1}: {err}")

    return filas


def save_currents_csv(filas, filepath):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["lat", "lon", "u", "v"])
        writer.writerows(filas)
    print(f"Guardado {filepath} con {len(filas)} celdas oceánicas.")


def simplify_line(coords, min_dist_deg=0.75):
    """Mantiene los vértices clave separando puntos muy juntos para optimizar el CSV."""
    if len(coords) <= 2:
        return coords
    kept = [coords[0]]
    for pt in coords[1:-1]:
        lon_prev, lat_prev = kept[-1]
        lon_cur, lat_cur = pt
        # Preservar siempre saltos de antimeridiano o distancias significativas
        if abs(lon_cur - lon_prev) > 180 or math.hypot(lon_cur - lon_prev, lat_cur - lat_prev) >= min_dist_deg:
            kept.append(pt)
    kept.append(coords[-1])
    return kept


def fetch_global_shipping_lanes(filepath):
    """Descarga las 239 rutas globales de Shipping_Lanes_v1.geojson y genera rutas_maritimas.csv."""
    print("Descargando red global de corredores marítimos (Shipping_Lanes_v1.geojson)...")
    req = urllib.request.Request(SHIPPING_LANES_URL, headers={"User-Agent": "IG-S8-OceanViz/1.0"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        geojson = json.loads(resp.read().decode("utf-8"))

    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    total_routes = 0
    total_points = 0

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["id_barco", "tipo", "timestamp", "lat", "lon"])

        for feat in geojson.get("features", []):
            tipo = feat.get("properties", {}).get("Type", "Major")
            lines = feat.get("geometry", {}).get("coordinates", [])
            for line_idx, raw_coords in enumerate(lines):
                if len(raw_coords) < 2:
                    continue
                coords = simplify_line(raw_coords, min_dist_deg=0.65)
                route_id = f"{tipo.upper()}_{line_idx + 1:03d}"
                n_pts = len(coords)
                for p_idx, (lon, lat) in enumerate(coords):
                    ts = round((p_idx / max(1, n_pts - 1)) * 120.0, 2)
                    writer.writerow([route_id, tipo, ts, round(lat, 4), round(lon, 4)])
                    total_points += 1
                total_routes += 1

    print(f"Guardado {filepath}: {total_routes} rutas globales ({total_points} waypoints).")


def fetch_digitraffic_ais(filepath):
    """Descarga posiciones AIS reales en tiempo real (Mar Báltico) desde Digitraffic."""
    print("Consultando Digitraffic Marine AIS API (barcos reales en vivo)...")
    req = urllib.request.Request(
        DIGITRAFFIC_AIS_URL,
        headers={
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "User-Agent": "IG-S8-OceanViz/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        data = json.loads(raw.decode("utf-8"))

    features = data.get("features", [])
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    count = 0
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["mmsi", "lat", "lon", "sog", "cog"])
        for feat in features:
            coords = feat.get("geometry", {}).get("coordinates", [])
            props = feat.get("properties", {})
            if len(coords) >= 2:
                lon, lat = coords[0], coords[1]
                writer.writerow([
                    feat.get("mmsi", ""),
                    round(lat, 5),
                    round(lon, 5),
                    props.get("sog", 0),
                    props.get("cog", 0),
                ])
                count += 1
    print(f"Guardado {filepath}: {count} buques AIS reales.")


if __name__ == "__main__":
    filas_corrientes = fetch_open_meteo_currents(lat_step=10, lon_step=10)
    if filas_corrientes:
        save_currents_csv(filas_corrientes, os.path.join(SRC_DIR, "corrientes.csv"))

    fetch_global_shipping_lanes(os.path.join(SRC_DIR, "rutas_maritimas.csv"))
    try:
        fetch_digitraffic_ais(os.path.join(SRC_DIR, "ais_live.csv"))
    except Exception as err:
        print(f"Aviso descargando AIS Digitraffic: {err}")
