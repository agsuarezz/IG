# Formato de datos CSV y fuentes reales (NOAA / Copernicus / MarineCadastre)

La aplicación lee automáticamente los archivos `src/corrientes.csv` y `src/rutas_maritimas.csv` mediante `fetch` (separador `;` o `,`).

---

## 1. `src/corrientes.csv` (Capa 1: Corrientes Oceánicas)

Formato esperado (una fila por celda geográfica):

```csv
lat;lon;u;v
35;-75;0.82;0.45
40;-70;-0.30;0.05
```

- **`lat`**: Latitud en grados decimales (`[-90, 90]`).
- **`lon`**: Longitud en grados decimales (`[-180, 180]`).
- **`u`**: Componente zonal de la corriente (Oeste -> Este, en m/s). Valores positivos mueven partículas hacia el Este.
- **`v`**: Componente meridional de la corriente (Sur -> Norte, en m/s). Valores positivos mueven partículas hacia el Norte.

### Sustitución con datos reales
- **Open-Meteo Marine API (automático)**:
  - Desde la interfaz web pulsa **↻ Retrieve API en vivo** para descargar corrientes reales actualizadas y exportables con **⬇ Exportar CSV**.
  - O ejecuta en terminal:
    ```bash
    python scripts/fetch_ocean_data.py
    ```
- **NOAA OSCAR / Copernicus Marine Service (CMEMS)**:
  - Si descargas un NetCDF (`.nc`) con variables `uo` (zonal) y `vo` (meridional), puedes convertirlo a `src/corrientes.csv` con Python (`xarray` + `pandas`):
    ```python
    import xarray as xr
    ds = xr.open_dataset("corrientes_cmems.nc").isel(time=0, depth=0)
    df = ds[["uo", "vo"]].to_dataframe().dropna().reset_index()
    df = df.rename(columns={"latitude": "lat", "longitude": "lon", "uo": "u", "vo": "v"})
    df[["lat", "lon", "u", "v"]].to_csv("src/corrientes.csv", sep=";", index=False)
    ```

---

## 2. `src/rutas_maritimas.csv` (Capa 2: Tráfico Marítimo)

El parser de `main.js` soporta **dos formatos**:

### Formato A: Secuencia de puntos (recomendado para corredores o trazas AIS)
```csv
id_barco;nombre_ruta;timestamp;lat;lon
ATL_N_01;Atlántico Norte;0.0;51.9;4.1
ATL_N_01;Atlántico Norte;20.0;50.5;-1.0
ATL_N_01;Atlántico Norte;40.0;47.5;-20.0
```
- **`id_barco`**: Identificador único de la embarcación o ruta.
- **`timestamp`**: Marca temporal numérica (horas o minutos ordenables).
- **`lat` / `lon`**: Coordenadas de cada *waypoint*.

### Formato B: Origen - Destino directo
```csv
id_ruta;lat_origen;lon_origen;lat_destino;lon_destino
R1;51.9;4.1;40.6;-74.0
```

### Sustitución con datos reales (MarineCadastre / Shipping-Lanes / Digitraffic AIS)
- **Corredores globales (`src/rutas_maritimas.csv`)**: El script [scripts/fetch_ocean_data.py](scripts/fetch_ocean_data.py) descarga las **239 rutas globales reales** (`Major`, `Middle`, `Minor`) de `newzealandpaul/Shipping-Lanes` (`Shipping_Lanes_v1.geojson`). La columna opcional `tipo` ajusta la densidad de buques en cada corredor.
- **Buques AIS en tiempo real (`src/ais_live.csv`)**: Formato `mmsi;lat;lon;sog;cog`, descargado automáticamente desde **Digitraffic Marine AIS** (o en directo desde el navegador con el botón **↻ Retrieve API en vivo**).
- **NOAA MarineCadastre (AIS)**: Los CSVs de MarineCadastre.gov incluyen columnas `MMSI`, `BaseDateTime`, `LAT`, `LON`. Basta con mapear `MMSI -> id_barco`, `BaseDateTime -> timestamp`, `LAT -> lat`, `LON -> lon` y guardar en `src/rutas_maritimas.csv`.
