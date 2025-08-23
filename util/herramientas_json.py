import pandas as pd
import json
import re
from pathlib import Path

def clean_text(x: str) -> str:
    """Normaliza vacíos/N/A a '-' y recorta espacios."""
    if x is None:
        return "-"
    s = str(x).strip()
    return "-" if s == "" or s.lower() in {"n/a", "na", "none"} else s

def split_casos_uso(val: str):
    """
    Convierte el campo 'Casos de uso' a lista.
    Separa por nueva línea, ';' o ',' y limpia viñetas comunes.
    """
    s = str(val or "").strip()
    if s == "" or s.lower() in {"n/a", "na", "none", "-"}:
        return []
    # Quita viñetas comunes al inicio de cada ítem
    s = re.sub(r"^\s*[-••]\s*", "", s, flags=re.MULTILINE)
    # Divide por saltos de línea, punto y coma o coma
    parts = re.split(r"[\n;,\u2022]+", s)
    items = [p.strip(" -–—\t ") for p in parts if p and p.strip(" -–—\t ")]
    return items

def excel_herramientas_a_json(ruta_excel: str, ruta_json: str):
    """
    Convierte un Excel de herramientas a JSON.

    Columnas requeridas:
    - ID (Nombre)
    - Tipo de herramienta
    - Categoría
    - Descripción
    - Casos de uso
    """
    ruta_excel = Path(ruta_excel)
    ruta_json = Path(ruta_json)

    # Leer Excel como texto y normalizar columnas
    df = pd.read_excel(ruta_excel, dtype=str).fillna("")
    df.columns = [c.strip() for c in df.columns]

    requeridas = [
        "ID (Nombre)",
        "Tipo de herramienta",
        "Categoría",
        "Descripción",
        "Casos de uso",
    ]
    faltantes = [c for c in requeridas if c not in df.columns]
    if faltantes:
        raise ValueError(f"Faltan columnas requeridas en el Excel: {faltantes}")

    herramientas = []
    for _, row in df.iterrows():
        _id          = str(row["ID (Nombre)"]).strip()
        tipo         = clean_text(row["Tipo de herramienta"])
        categoria    = clean_text(row["Categoría"])
        descripcion  = clean_text(row["Descripción"])
        casos_uso    = split_casos_uso(row["Casos de uso"])

        if _id == "":
            # Salta filas sin ID
            continue

        herramientas.append({
            "id": _id,                  # Debe coincidir con el id del nodo en el grafo
            "tipo": "herramienta",      # Útil para el grafo/script
            "categoria": categoria,
            "descripcion": descripcion,
            "casos_uso": casos_uso,     # Lista de strings
            "tipo_herramienta": tipo,   # Conservamos el campo original por si lo usas
        })

    # (Opcional) Ordena por id para estabilidad
    herramientas.sort(key=lambda x: x["id"].lower())

    ruta_json.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(herramientas, f, ensure_ascii=False, indent=2)

    print(f"✅ JSON de herramientas generado en: {ruta_json} ({len(herramientas)} items)")

# Uso:
excel_herramientas_a_json("util/descripcionHerramientas.xlsx", "data/herramientas.json")
