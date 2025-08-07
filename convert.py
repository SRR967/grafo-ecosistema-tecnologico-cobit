import pandas as pd
import json
import re

# Convierte el excel de objetivos, prácticas y actividades a JSON
def excel_a_json(ruta_excel, ruta_json):
    def normalizar_campo(valor):
        # Reemplaza "N/A", "n/a", "", o valores con solo espacios por "-"
        if not valor or str(valor).strip().lower() in ["n/a", "na", ""]:
            return "-"
        return str(valor).strip()

    # Leer Excel como texto
    df = pd.read_excel(ruta_excel, dtype=str)
    df = df.fillna("")  # Reemplazar NaN por vacío

    # Limpiar nombres de columnas
    df.columns = [col.strip() for col in df.columns]

    # Columnas requeridas
    columnas_requeridas = [
        "ID Objetivo", "Objetivo", "ID Practica", "Practica",
        "Actividad", "Herramienta", "Justificación Tecnica",
        "Observaciones", "Integracion con otra Herramienta"
    ]
    for col in columnas_requeridas:
        if col not in df.columns:
            raise ValueError(f"❌ Falta la columna requerida en el Excel: '{col}'")

    data_json = []

    # Agrupar por Objetivo
    for (id_objetivo, objetivo), df_objetivo in df.groupby(["ID Objetivo", "Objetivo"]):
        objetivo_info = {
            "id": id_objetivo.strip(),
            "nombre": objetivo.strip(),
            "practicas": []
        }

        # Agrupar por práctica
        for id_practica, df_practica in df_objetivo.groupby("ID Practica"):
            num_practica = id_practica.split(".")[-1].zfill(2)
            practica_id = f"{id_objetivo}-P{num_practica}"

            practica_info = {
                "id": practica_id,
                "nombre": df_practica["Practica"].iloc[0].strip(),
                "actividades": []
            }

            for idx, fila in df_practica.iterrows():
                descripcion = re.sub(r"^\s*\d+\.\s*", "", fila["Actividad"].strip())
                actividad_id = f"{practica_id}-A{str(len(practica_info['actividades'])+1).zfill(2)}"

                actividad_info = {
                    "id": actividad_id,
                    "descripcion": normalizar_campo(descripcion),
                    "herramienta": normalizar_campo(fila["Herramienta"]),
                    "justificacion": normalizar_campo(fila["Justificación Tecnica"]),
                    "observaciones": normalizar_campo(fila["Observaciones"]),
                    "integracion": normalizar_campo(fila["Integracion con otra Herramienta"])
                }

                practica_info["actividades"].append(actividad_info)

            objetivo_info["practicas"].append(practica_info)

        data_json.append(objetivo_info)

    # Guardar archivo JSON
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(data_json, f, indent=2, ensure_ascii=False)

    print(f" JSON generado correctamente en: {ruta_json}")

# Uso
excel_a_json("cobit2019.xlsx", "data/actividades.json")
