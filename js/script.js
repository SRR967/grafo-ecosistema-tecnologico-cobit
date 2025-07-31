const svg = d3.select("svg");
const infoPanel = document.getElementById("infoPanel");
const width = window.innerWidth - 300;
const height = window.innerHeight;

// Crear un grupo contenedor para aplicar zoom/pan
const container = svg.append("g");

// Habilitar zoom y pan
svg.call(d3.zoom()
  .scaleExtent([0.1, 3]) // Nivel de zoom permitido (mínimo, máximo)
  .on("zoom", (event) => {
    container.attr("transform", event.transform); // Aplicar zoom y pan al contenedor
  })
);

d3.json("data/grafo.json").then(data => {
  const nodes = data.nodes;
  const links = data.links;

  // Crear simulación de D3
  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(150))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2));

  // Dibujar enlaces dentro del contenedor
  const link = container.append("g")
    .attr("stroke", "#aaa")
    .selectAll("line")
    .data(links)
    .enter().append("line")
    .attr("stroke-width", 2);

  // Dibujar nodos dentro del contenedor
  const node = container.append("g")
    .selectAll("circle")
    .data(nodes)
    .enter().append("circle")
    .attr("r", 15)
    .attr("fill", d => d.tipo === "objetivo" ? "#4da6ff" : "#00c853")
    .call(drag(simulation))
    .on("click", (event, d) => mostrarInfo(d));

  // Etiquetas de nodos dentro del contenedor
  const label = container.append("g")
    .selectAll("text")
    .data(nodes)
    .enter().append("text")
    .text(d => d.id)
    .attr("text-anchor", "middle")
    .attr("dy", -25);

  // Actualizar posiciones en cada tick
  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    label
      .attr("x", d => d.x)
      .attr("y", d => d.y);
  });

  // Función para arrastrar nodos
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

  // Mostrar información en el panel lateral
  function mostrarInfo(d) {
    if (d.tipo === "objetivo") {
      infoPanel.innerHTML = `
        <h2>${d.id} - ${d.nombre}</h2>
        <p><strong>Descripción:</strong> ${d.descripcion}</p>
        <p><strong>Propósito:</strong> ${d.proposito || "No especificado"}</p>
        <h3>Herramientas asociadas:</h3>
        <ul>
          ${d.herramientas ? d.herramientas.map(h => `<li>${h}</li>`).join("") : "<li>No definidas</li>"}
        </ul>
      `;
    } else if (d.tipo === "herramienta") {
      infoPanel.innerHTML = `
        <h2>${d.id}</h2>
        ${d.img ? `<img src="${d.img}" alt="${d.id}">` : ""}
        <p><strong>Categoría:</strong> ${d.categoria}</p>
        <p>${d.descripcion}</p>
        <h3>Casos de uso:</h3>
        <ul>
          ${d.casos_uso ? d.casos_uso.map(c => `<li>${c}</li>`).join("") : "<li>No especificados</li>"}
        </ul>
        ${d.enlace ? `<p><a href="${d.enlace}" target="_blank">🔗 Sitio oficial</a></p>` : ""}
      `;
    }
  }
});
