const svg = d3.select("svg");
const infoPanel = document.getElementById("infoPanel");
const width = window.innerWidth - 300;
const height = window.innerHeight;

// 🔥 Cargar datos desde el JSON externo
d3.json("data/grafo.json").then(data => {
  const nodes = data.nodes;
  const links = data.links;

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(150))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2));

  // Dibujar enlaces
  const link = svg.append("g")
    .attr("stroke", "#aaa")
    .selectAll("line")
    .data(links)
    .enter().append("line")
    .attr("stroke-width", 2);

  // Dibujar nodos
  const node = svg.append("g")
    .selectAll("circle")
    .data(nodes)
    .enter().append("circle")
    .attr("r", 15)
    .attr("fill", "steelblue")
    .call(drag(simulation))
    .on("click", (event, d) => mostrarInfo(d));

  // Etiquetas de nodos
  const label = svg.append("g")
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
    infoPanel.innerHTML = `
      <h2>${d.id}</h2>
      <img src="${d.img}" alt="${d.id}">
      <p>${d.info}</p>
    `;
  }
});
