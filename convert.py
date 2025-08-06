import pandas as pd
import json
import re

def excel_a_json(ruta_excel, ruta_json):
    # Leer Excel como texto para evitar NaN automáticos
    df = pd.read_excel(ruta_excel, dtype=str)
    df = df.fillna("")  # Reemplazar NaN por vacío

    # Asegurar nombres exactos de columnas quitando espacios extra
    df.columns = [col.strip() for col in df.columns]

    # Validar columnas requeridas
    columnas_requeridas = [
        "ID Objetivo", "Objetivo", "ID Practica", "Practica",
        "Actividad", "Herramienta", "Justificación Tecnica",
        "Observaciones", "Integracion con otra Herramienta"
    ]
    for col in columnas_requeridas:
        if col not in df.columns:
            raise ValueError(f"❌ Falta la columna requerida en el Excel: '{col}'")

    # Estructura final JSON
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

            # Recorrer actividades fila por fila
            for idx, fila in df_practica.iterrows():
                descripcion = re.sub(r"^\s*\d+\.\s*", "", fila["Actividad"].strip())
                actividad_id = f"{practica_id}-A{str(len(practica_info['actividades'])+1).zfill(2)}"

                actividad_info = {
                    "id": actividad_id,
                    "descripcion": descripcion,
                    "herramienta": fila["Herramienta"].strip(),
                    "justificacion": fila["Justificación Tecnica"].strip(),
                    "observaciones": fila["Observaciones"].strip(),
                    "integracion": fila["Integracion con otra Herramienta"].strip()
                }

                practica_info["actividades"].append(actividad_info)

            objetivo_info["practicas"].append(practica_info)

        data_json.append(objetivo_info)

    # Guardar JSON
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(data_json, f, indent=2, ensure_ascii=False)

    print(f"✅ JSON generado correctamente en: {ruta_json}")

# Uso:
excel_a_json("cobit2019.xlsx", "cobit_final.json")
