// js/script.js
const svg = d3.select("svg");

const infoPanel = document.getElementById("infoPanel");
const objetivoSelect = document.getElementById("objetivoSelect");
const selectedTagsContainer = document.getElementById("selected-tags");
const resetBtn = document.getElementById("resetBtn");
const width = window.innerWidth - 300; // restar el panel izquierdo
const height = window.innerHeight;

const container = svg.append("g");

// Zoom & pan
svg.call(
  d3.zoom()
    .scaleExtent([0.1, 3])
    .on("zoom", (event) => container.attr("transform", event.transform))
);
// Permitir usar dblclick en nodos (desactivar zoom por dblclick)
svg.on("dblclick.zoom", null);

// Variables de estado del grafo actual para resaltar
let nodeSel, linkSel, labelSel;
let currentNodes = [];
let currentLinks = [];

d3.json("data/grafo.json").then((data) => {
  const allNodes = data.nodes;
  const allLinks = data.links;

  // Llenar selector de objetivos
  const objetivos = allNodes.filter((d) => d.tipo === "objetivo");
  objetivos.forEach((obj) => {
    const option = document.createElement("option");
    option.value = obj.id;
    option.textContent = `${obj.id} - ${obj.nombre}`;
    objetivoSelect.appendChild(option);
  });

  function renderGraph(filteredObjetivos = []) {
    container.selectAll("*").remove();

    let nodesToShow = [];
    let linksToShow = [];

    if (filteredObjetivos.length > 0) {
      const selectedSet = new Set(filteredObjetivos);
      const objetivosSeleccionados = allNodes.filter(
        (n) => n.tipo === "objetivo" && selectedSet.has(n.id)
      );
      nodesToShow.push(...objetivosSeleccionados);

      allLinks.forEach((link) => {
        if (selectedSet.has(link.source)) {
          const objetivoNode = allNodes.find((n) => n.id === link.source);
          const herramientaNode = allNodes.find((n) => n.id === link.target);
          if (objetivoNode && herramientaNode) {
            nodesToShow.push(herramientaNode);
            linksToShow.push({ source: objetivoNode, target: herramientaNode });
          }
        }
      });
    } else {
      nodesToShow = [...allNodes];
      linksToShow = allLinks.map((l) => {
        const sourceNode = allNodes.find((n) => n.id === l.source);
        const targetNode = allNodes.find((n) => n.id === l.target);
        return { source: sourceNode, target: targetNode };
      });
    }

    // Eliminar nodos duplicados
    nodesToShow = Array.from(new Map(nodesToShow.map((n) => [n.id, n])).values());

    currentNodes = nodesToShow;
    currentLinks = linksToShow;

    // Simulación
    const simulation = d3
      .forceSimulation(nodesToShow)
      .force("link", d3.forceLink(linksToShow).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    // Enlaces
    linkSel = container
      .append("g")
      .attr("stroke", "#aaa")
      .selectAll("line")
      .data(linksToShow)
      .enter()
      .append("line")
      .attr("stroke-width", 2)
      .style("opacity", 1);

    // Nodos
    nodeSel = container
      .append("g")
      .selectAll("circle")
      .data(nodesToShow)
      .enter()
      .append("circle")
      .attr("r", 15)
      .attr("fill", (d) => (d.tipo === "objetivo" ? "#4da6ff" : "#00c853"))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .call(drag(simulation))
      .on("click", (event, d) => {
        mostrarInfo(d);
        if (d.tipo === "objetivo") {
          highlightNeighborhood(d);
        } else {
          clearHighlight(); // si clic en herramienta, quita el resaltado
          mostrarInfo(d);
        }
      })
      .on("dblclick", (event, d) => {
        // Doble clic: ir a tabla filtrada si es objetivo
        if (d.tipo === "objetivo") {
          localStorage.setItem("filtroObjetivos", JSON.stringify([d.id]));
          window.location.href = "tabla.html";
        }
        event.stopPropagation();
      });

    // Etiquetas
    labelSel = container
      .append("g")
      .selectAll("text")
      .data(nodesToShow)
      .enter()
      .append("text")
      .text((d) => d.id)
      .attr("text-anchor", "middle")
      .attr("dy", -25)
      .attr("fill", "white");

    // Tick
    simulation.on("tick", () => {
      linkSel
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      nodeSel.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      labelSel.attr("x", (d) => d.x).attr("y", (d) => d.y);
    });
  }

  // Resaltar objetivo y sus herramientas conectadas
  function highlightNeighborhood(objNode) {
    const neighbors = new Set([objNode.id]);
    currentLinks.forEach((l) => {
      if (l.source.id === objNode.id) neighbors.add(l.target.id);
    });

    nodeSel
      .transition().duration(150)
      .style("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.15))
      .attr("stroke-width", (d) => (d.id === objNode.id ? 3 : 1.5));

    labelSel
      .transition().duration(150)
      .style("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.15));

    linkSel
      .transition().duration(150)
      .style("opacity", (d) => (d.source.id === objNode.id ? 1 : 0.1))
      .attr("stroke", (d) => (d.source.id === objNode.id ? "#66b2ff" : "#666"))
      .attr("stroke-width", (d) => (d.source.id === objNode.id ? 3 : 1.5));
  }

  // Quitar resaltado
  function clearHighlight() {
    nodeSel
      .transition().duration(150)
      .style("opacity", 1)
      .attr("stroke-width", 1.5);

    labelSel.transition().duration(150).style("opacity", 1);

    linkSel
      .transition().duration(150)
      .style("opacity", 1)
      .attr("stroke", "#aaa")
      .attr("stroke-width", 2);
  }

  // Render inicial
  renderGraph();

  // Cargar filtro desde la tabla (si existe)
  const filtroDesdeTabla = localStorage.getItem("filtroDesdeTabla");
  if (filtroDesdeTabla) {
    const ids = JSON.parse(filtroDesdeTabla);
    [...objetivoSelect.options].forEach((opt) => {
      if (ids.includes(opt.value)) opt.selected = true;
    });
    updateSelectedTags();
    localStorage.removeItem("filtroDesdeTabla");
  }

  // Multi-selección tipo "toggle" en el select
  objetivoSelect.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const option = e.target;
    option.selected = !option.selected;
    updateSelectedTags();
  });

  function updateSelectedTags() {
    selectedTagsContainer.innerHTML = "";
    const selectedOptions = Array.from(objetivoSelect.selectedOptions);

    selectedOptions.forEach((opt) => {
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.innerHTML = `${opt.text} <span data-value="${opt.value}">&times;</span>`;
      selectedTagsContainer.appendChild(tag);
    });

    const selectedValues = selectedOptions.map((opt) => opt.value);
    // Re-render con filtro de objetivos (y quitar resaltado previo)
    clearHighlight();
    renderGraph(selectedValues);
  }

  // Eliminar chip
  selectedTagsContainer.addEventListener("click", (e) => {
    if (e.target.tagName === "SPAN") {
      const value = e.target.getAttribute("data-value");
      [...objetivoSelect.options].forEach((opt) => {
        if (opt.value === value) opt.selected = false;
      });
      e.target.parentElement.remove();
      updateSelectedTags();
    }
  });

  // Reset: mostrar todo
  resetBtn.addEventListener("click", () => {
    [...objetivoSelect.options].forEach((opt) => (opt.selected = false));
    selectedTagsContainer.innerHTML = "";
    clearHighlight();
    renderGraph();
  });

  // Drag helpers
  function drag(simulation) {
    return d3
      .drag()
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

  // Panel lateral de info
  function mostrarInfo(d) {
    if (d.tipo === "objetivo") {
      infoPanel.innerHTML = `
        <h2>${d.id} - ${d.nombre}</h2>
        <p><strong>Descripción:</strong> ${d.descripcion}</p>
        <p><strong>Propósito:</strong> ${d.proposito || "No especificado"}</p>
        <h3>Herramientas asociadas:</h3>
        <ul>${d.herramientas ? d.herramientas.map((h) => `<li>${h}</li>`).join("") : "<li>No definidas</li>"}</ul>`;
    } else if (d.tipo === "herramienta") {
      infoPanel.innerHTML = `
        <h2>${d.id}</h2>
        <p><strong>Categoría:</strong> ${d.categoria}</p>
        <p>${d.descripcion}</p>
        <h3>Casos de uso:</h3>
        <ul>${d.casos_uso ? d.casos_uso.map((c) => `<li>${c}</li>`).join("") : "<li>No especificados</li>"}</ul>`;
    }
  }
});

// Ir a tabla con los objetivos seleccionados (botón)
document.getElementById("verTablaBtn").addEventListener("click", () => {
  const selectedValues = Array.from(objetivoSelect.selectedOptions).map((opt) => opt.value);
  if (selectedValues.length === 0) {
    window.location.href = "tabla.html";
  } else {
    localStorage.setItem("filtroObjetivos", JSON.stringify(selectedValues));
    window.location.href = "tabla.html";
  }
});
