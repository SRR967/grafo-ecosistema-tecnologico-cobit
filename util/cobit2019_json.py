import pandas as pd
import json
import re
from pathlib import Path
import unicodedata

# -------------------- helpers --------------------
NA_SET = {"n/a", "na", "none", "null", "-", ""}

def norm_col(s: str) -> str:
    """Normaliza nombre de columna: sin acentos, minúsculas y espacios compactados."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower().strip()
    s = re.sub(r"\s+", " ", s)
    return s

def find_col(df, synonyms):
    cols_norm = {norm_col(c): c for c in df.columns}
    for syn in synonyms:
        key = norm_col(syn)
        if key in cols_norm:
            return cols_norm[key]
    raise ValueError(f"❌ No se encontró ninguna de las columnas: {synonyms}")

def clean_text(x):
    if x is None:
        return "-"
    s = str(x).strip()
    return "-" if s.lower() in NA_SET else s

def strip_enumeration(txt: str) -> str:
    if txt is None:
        return "-"
    s = str(txt).strip()
    s = re.sub(r"^\s*[-–—•]\s*", "", s)                 # viñetas
    s = re.sub(r"^\s*\d+(?:\.\d+)*\)?\s*[-–—:]?\s*", "", s)  # 1. / 1.1 / 01) / 1:
    return s if s else "-"

def parse_capacidad(x):
    if x is None:
        return None
    s = str(x).strip()
    if s.lower() in NA_SET:
        return None
    m = re.search(r"\d+", s)
    if m:
        v = int(m.group(0))
        if 0 <= v <= 10:
            return v
    return None

def practica_id_from(raw_id_practica: str, codigo_ogg: str, index_secuencial: int) -> str:
    base = str(raw_id_practica or "").strip()
    m = re.search(r"(\d+)(?!.*\d)", base)  # último grupo de dígitos
    if m:
        return f"{codigo_ogg}-P{int(m.group(1)):02d}"
    return f"{codigo_ogg}-P{index_secuencial:02d}"

# -------------------- conversor --------------------
def excel_cobit_a_json(ruta_excel: str, ruta_json: str):
    ruta_excel = Path(ruta_excel)
    ruta_json  = Path(ruta_json)

    df = pd.read_excel(ruta_excel, dtype=str).fillna("")
    df.columns = [c.strip() for c in df.columns]

    # Mapear columnas con sinónimos comunes (con/sin acentos)
    COL_CODIGO   = find_col(df, ["Codigo OGG", "Código OGG", "Codigo", "Código", "ID Objetivo", "OGG"])
    COL_OBJETIVO = find_col(df, ["Objetivo"])
    COL_ID_PRACT = find_col(df, ["ID Practica", "ID Práctica", "Id Practica", "Id Práctica"])
    COL_PRACTICA = find_col(df, ["Practica", "Práctica"])
    COL_ACTIVIDAD = find_col(df, ["Actividad"])
    COL_CAPACIDAD = find_col(df, ["Nivel de Capacidad", "Nivel Capacidad", "Capacidad"])
    COL_HERR = find_col(df, ["Herramienta"])
    COL_JUST = find_col(df, ["Justificación Tecnica", "Justificacion Tecnica", "Justificación Técnica", "Justificacion Técnica"])
    COL_OBS  = find_col(df, ["Observaciones", "Observacion", "Observación"])
    COL_INT  = find_col(df, ["Integracion con otra Herramienta", "Integración con otra Herramienta", "Integracion"])

    salida = []

    # Agrupar por objetivo
    for (codigo_ogg, nombre_obj), df_obj in df.groupby([COL_CODIGO, COL_OBJETIVO], sort=False, dropna=False):
        codigo_ogg = str(codigo_ogg).strip()
        obj_dict = {"id": codigo_ogg, "nombre": str(nombre_obj).strip() or "-", "practicas": []}

        # Agrupar por práctica (¡desempaquetado correcto!)
        for idx_p, ((id_pract_raw, nombre_prac), df_prac) in enumerate(
            df_obj.groupby([COL_ID_PRACT, COL_PRACTICA], sort=False, dropna=False),
            start=1
        ):
            prac_id = practica_id_from(id_pract_raw, codigo_ogg, idx_p)
            prac_dict = {
                "id": prac_id,
                "nombre": str(nombre_prac).strip() or "-",
                "actividades": []
            }

            # Recorrer actividades
            for idx_a, (_, row) in enumerate(df_prac.iterrows(), start=1):
                actividad_id   = f"{prac_id}-A{idx_a:02d}"
                descripcion    = strip_enumeration(row[COL_ACTIVIDAD])
                nivel_cap      = parse_capacidad(row[COL_CAPACIDAD])
                herramienta    = clean_text(row[COL_HERR])

                actividad = {
                    "id": actividad_id,
                    "descripcion": descripcion,
                    "nivel_capacidad": nivel_cap,            # int o None
                    "herramienta": herramienta,
                    "justificacion": clean_text(row[COL_JUST]),
                    "observaciones": clean_text(row[COL_OBS]),
                    "integracion": clean_text(row[COL_INT]),
                }
                prac_dict["actividades"].append(actividad)

            obj_dict["practicas"].append(prac_dict)

        salida.append(obj_dict)

    ruta_json.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=2)

    print(f"✅ JSON generado: {ruta_json} (objetivos: {len(salida)})")


# ---- uso ----
excel_cobit_a_json("util/cobit2019.xlsx", "data/actividades.json")
