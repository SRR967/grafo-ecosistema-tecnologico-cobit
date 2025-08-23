import pandas as pd
import json
import re
from pathlib import Path

# ---------- Helpers ----------
def clean_text(x: str) -> str:
    """Convierte None/''/N/A a '-' y recorta espacios."""
    if x is None:
        return "-"
    s = str(x).strip()
    return "-" if s == "" or s.lower() in {"n/a", "na", "none"} else s

def split_herramientas(val: str):
    """
    Convierte 'Herramientas' en lista de strings.
    Separa por nueva línea, ';' o ',' y limpia viñetas comunes.
    Devuelve [] si está vacío o es N/A.
    """
    if val is None:
        return []
    s = str(val).strip()
    if s == "" or s.lower() in {"n/a", "na", "none", "-"}:
        return []
    # Quitar viñetas al inicio de cada línea (•, -, etc.)
    s = re.sub(r"^\s*[-•·]\s*", "", s, flags=re.MULTILINE)
    # Separar por saltos de línea, punto y coma, o coma
    parts = re.split(r"[\n;,]+", s)
    items = [p.strip(" \t-–—") for p in parts if p and p.strip(" \t-–—")]
    # Quitar duplicados preservando orden
    seen, out = set(), []
    for it in items:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out

# ---------- Conversor principal ----------
def excel_objetivos_a_json(ruta_excel: str, ruta_json: str, ruta_por_id: str | None = None):
    """
    Convierte el Excel de objetivos a JSON (lista de dicts).
    
    Columnas requeridas:
      - 'ID objetivo'
      - 'Objetivo'
      - 'Descripción del objetivo'
      - 'Declaración de propósito objetivo'
      - 'Herramientas'
      
    Salida (cada item):
    {
      "id": "<ID objetivo>",
      "tipo": "objetivo",
      "nombre": "<Objetivo>",
      "descripcion": "<Descripción del objetivo | ->",
      "proposito": "<Declaración de propósito objetivo | ->",
      "herramientas": ["GLPI", "Zabbix", ...]   # lista
    }
    
    Si pasas ruta_por_id, también genera un JSON dict {id: objeto}.
    """
    ruta_excel = Path(ruta_excel)
    ruta_json  = Path(ruta_json)

    # Leer como texto y normalizar columnas
    df = pd.read_excel(ruta_excel, dtype=str).fillna("")
    df.columns = [c.strip() for c in df.columns]

    requeridas = [
        "ID objetivo",
        "Objetivo",
        "Descripción del objetivo",
        "Declaración de propósito objetivo",
        "Herramientas",
    ]
    faltantes = [c for c in requeridas if c not in df.columns]
    if faltantes:
        raise ValueError(f"Faltan columnas requeridas en el Excel: {faltantes}")

    objetivos = []
    for _, row in df.iterrows():
        _id          = str(row["ID objetivo"]).strip()
        if _id == "":
            # saltar filas sin ID
            continue
        nombre       = str(row["Objetivo"]).strip()
        descripcion  = clean_text(row["Descripción del objetivo"])
        proposito    = clean_text(row["Declaración de propósito objetivo"])
        herramientas = split_herramientas(row["Herramientas"])

        objetivos.append({
            "id": _id,
            "tipo": "objetivo",
            "nombre": nombre if nombre else "-",
            "descripcion": descripcion,
            "proposito": proposito,
            "herramientas": herramientas,
        })

    # Orden estable
    objetivos.sort(key=lambda x: x["id"].lower())

    # Asegurar carpeta y escribir lista
    ruta_json.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(objetivos, f, ensure_ascii=False, indent=2)

    print(f"✅ JSON de objetivos generado en: {ruta_json} ({len(objetivos)} items)")

    # (opcional) índice por id
    if ruta_por_id:
        ruta_por_id = Path(ruta_por_id)
        by_id = {obj["id"]: obj for obj in objetivos}
        ruta_por_id.parent.mkdir(parents=True, exist_ok=True)
        with open(ruta_por_id, "w", encoding="utf-8") as f:
            json.dump(by_id, f, ensure_ascii=False, indent=2)
        print(f"✅ JSON por id generado en: {ruta_por_id}")

# ---- Uso:
excel_objetivos_a_json("util/descripcionObjetivos.xlsx", "data/objetivos.json")
