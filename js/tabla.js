fetch("data/actividades.json")
  .then(response => response.json())
  .then(data => {
    const tbody = document.querySelector("#tabla-cobit tbody");

    data.forEach(objetivo => {
      // Contar cuántas actividades hay en total para este objetivo
      let totalActividadesObjetivo = 0;
      objetivo.practicas.forEach(practica => {
        totalActividadesObjetivo += practica.actividades.length;
      });

      let objetivoRowAdded = false; // Para añadir solo una vez el objetivo

      objetivo.practicas.forEach(practica => {
        // Contar cuántas actividades hay en esta práctica
        const totalActividadesPractica = practica.actividades.length;
        let practicaRowAdded = false;

        practica.actividades.forEach((actividad) => {
          const row = document.createElement("tr");

          // Celda de Objetivo (solo en la primera fila correspondiente)
          if (!objetivoRowAdded) {
            const tdObjetivo = document.createElement("td");
            tdObjetivo.rowSpan = totalActividadesObjetivo; // Combinar celdas
            tdObjetivo.textContent = `${objetivo.objetivo} - ${objetivo.nombre}`;
            row.appendChild(tdObjetivo);
            objetivoRowAdded = true;
          }

          // Celda de Práctica (solo en la primera fila correspondiente)
          if (!practicaRowAdded) {
            const tdPractica = document.createElement("td");
            tdPractica.rowSpan = totalActividadesPractica; // Combinar celdas
            tdPractica.textContent = `${practica.id} - ${practica.nombre}`;
            row.appendChild(tdPractica);
            practicaRowAdded = true;
          }

          // Celda de Actividad
          const tdActividad = document.createElement("td");
          tdActividad.textContent = `${actividad.id} - ${actividad.descripcion}`;
          row.appendChild(tdActividad);

          // Celda de Herramienta
          const tdHerramienta = document.createElement("td");
          tdHerramienta.textContent = actividad.herramienta;
          row.appendChild(tdHerramienta);

          tbody.appendChild(row);
        });
      });
    });
  });
