const svg = d3.select("svg");
const infoPanel = document.getElementById("infoPanel");
const objetivoSelect = document.getElementById("objetivoSelect");
const resetBtn = document.getElementById("resetBtn");
const width = window.innerWidth - 300;
const height = window.innerHeight;

// Contenedor para zoom y pan
const container = svg.append("g");

// Habilitar zoom y pan
svg.call(d3.zoom()
  .scaleExtent([0.1, 3])
  .on("zoom", (event) => container.attr("transform", event.transform))
);

d3.json("data/grafo.json").then(data => {
  const allNodes = data.nodes;
  const allLinks = data.links;

  // Llenar el select con objetivos
  const objetivos = allNodes.filter(d => d.tipo === "objetivo");
  objetivos.forEach(obj => {
    const option = document.createElement("option");
    option.value = obj.id;
    option.textContent = `${obj.id} - ${obj.nombre}`;
    objetivoSelect.appendChild(option);
  });

  // Función para renderizar el grafo filtrado
  function renderGraph(filteredObjetivos = []) {
  container.selectAll("*").remove(); // Limpiar el grafo

  let nodesToShow = [];
  let linksToShow = [];

  if (filteredObjetivos.length > 0) {
    const selectedSet = new Set(filteredObjetivos);

    // 1️⃣ Agregar objetivos seleccionados
    const objetivosSeleccionados = allNodes.filter(n => n.tipo === "objetivo" && selectedSet.has(n.id));
    nodesToShow.push(...objetivosSeleccionados);

    // 2️⃣ Agregar herramientas conectadas y reconstruir enlaces válidos
    allLinks.forEach(link => {
      if (selectedSet.has(link.source)) {
        const objetivoNode = allNodes.find(n => n.id === link.source);
        const herramientaNode = allNodes.find(n => n.id === link.target);

        if (objetivoNode && herramientaNode) {
          nodesToShow.push(herramientaNode); // incluir herramienta
          linksToShow.push({ source: objetivoNode, target: herramientaNode }); // enlace real
        }
      }
    });
  } else {
    // Mostrar todo el grafo completo
    nodesToShow = [...allNodes];
    linksToShow = allLinks.map(l => {
      const sourceNode = allNodes.find(n => n.id === l.source);
      const targetNode = allNodes.find(n => n.id === l.target);
      return { source: sourceNode, target: targetNode };
    });
  }

  // 3️⃣ Eliminar nodos duplicados
  nodesToShow = Array.from(new Map(nodesToShow.map(n => [n.id, n])).values());

  // 4️⃣ Construcción de simulación D3
  const simulation = d3.forceSimulation(nodesToShow)
    .force("link", d3.forceLink(linksToShow).distance(150))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2));

  // 5️⃣ Dibujar enlaces
  const link = container.append("g")
    .attr("stroke", "#aaa")
    .selectAll("line")
    .data(linksToShow)
    .enter().append("line")
    .attr("stroke-width", 2);

  // 6️⃣ Dibujar nodos
  const node = container.append("g")
    .selectAll("circle")
    .data(nodesToShow)
    .enter().append("circle")
    .attr("r", 15)
    .attr("fill", d => d.tipo === "objetivo" ? "#4da6ff" : "#00c853")
    .call(drag(simulation))
    .on("click", (event, d) => mostrarInfo(d));

  // 7️⃣ Dibujar etiquetas
  const label = container.append("g")
    .selectAll("text")
    .data(nodesToShow)
    .enter().append("text")
    .text(d => d.id)
    .attr("text-anchor", "middle")
    .attr("dy", -25);

  // 8️⃣ Tick para actualizar posiciones
  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node.attr("cx", d => d.x).attr("cy", d => d.y);
    label.attr("x", d => d.x).attr("y", d => d.y);
  });
}




  // Render inicial: todo
  renderGraph();

  // Evento: actualizar grafo al cambiar selección
  objetivoSelect.addEventListener("change", () => {
    const selected = Array.from(objetivoSelect.selectedOptions).map(opt => opt.value);
    renderGraph(selected);
  });

  // Botón Reset: mostrar todo
  resetBtn.addEventListener("click", () => {
    objetivoSelect.value = null;
    renderGraph();
  });

  // Función drag
  function drag(simulation) {
    return d3.drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  // Mostrar información
  function mostrarInfo(d) {
    if (d.tipo === "objetivo") {
      infoPanel.innerHTML = `
        <h2>${d.id} - ${d.nombre}</h2>
        <p><strong>Descripción:</strong> ${d.descripcion}</p>
        <p><strong>Propósito:</strong> ${d.proposito || "No especificado"}</p>
        <h3>Herramientas asociadas:</h3>
        <ul>${d.herramientas ? d.herramientas.map(h => `<li>${h}</li>`).join("") : "<li>No definidas</li>"}</ul>`;
    } else if (d.tipo === "herramienta") {
      infoPanel.innerHTML = `
        <h2>${d.id}</h2>
        <p><strong>Categoría:</strong> ${d.categoria}</p>
        <p>${d.descripcion}</p>
        <h3>Casos de uso:</h3>
        <ul>${d.casos_uso ? d.casos_uso.map(c => `<li>${c}</li>`).join("") : "<li>No especificados</li>"}</ul>`;
    }
  }
});
