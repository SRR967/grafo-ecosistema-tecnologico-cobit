// ================== Referencias base ==================
const svg = d3.select("svg");
const infoPanelEl = document.getElementById("infoPanel");
const infoContentEl = document.getElementById("infoContent");
const infoOverlayEl = document.getElementById("infoOverlay");
const closeInfoBtn = document.getElementById("closeInfo");

const infoPanel = document.getElementById("infoPanel"); // legacy alias (no usado directamente)
const objetivoSelect = document.getElementById("objetivoSelect");
const selectedTagsContainer = document.getElementById("selected-tags");
const resetBtn = document.getElementById("resetBtn");

const width = window.innerWidth - 300; // 300 = ancho del panel izquierdo
const height = window.innerHeight;

// ================== Drawer helpers ==================
function openInfoPanel() {
  infoPanelEl.classList.remove("closing");  // por si quedó en cierre
  infoPanelEl.classList.add("open");
  infoOverlayEl.classList.add("visible");
}

function closeInfoPanel() {
  // iniciar animación de salida
  infoPanelEl.classList.add("closing");
  infoOverlayEl.classList.remove("visible");

  // esperar fin de la transición para limpiar clases
  const onEnd = (e) => {
    // nos interesa cuando termina transform u opacity
    if (e.propertyName !== "transform" && e.propertyName !== "opacity") return;
    infoPanelEl.classList.remove("open", "closing");
    infoPanelEl.removeEventListener("transitionend", onEnd);
  };
  infoPanelEl.addEventListener("transitionend", onEnd);
}

// Cerrar drawer: overlay, botón ✕, tecla Esc
infoOverlayEl.addEventListener("click", closeInfoPanel);
closeInfoBtn.addEventListener("click", closeInfoPanel);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeInfoPanel();
});

// ================== Zoom & contenedor ==================
const container = svg.append("g");

// Desactivar el zoom por doble clic (para usar dblclick propio)
svg.on("dblclick.zoom", null);

// Zoom con rueda/arrastre
svg.call(
  d3.zoom()
    .scaleExtent([0.1, 3])
    .on("zoom", (event) => container.attr("transform", event.transform))
);



// ================== Carga de datos y render ==================
d3.json("data/grafo.json").then((data) => {
  const allNodes = data.nodes;
  const allLinks = data.links; // {source: objetivoId, target: herramientaId}

  // Poblar selector de objetivos
  const objetivos = allNodes.filter((d) => d.tipo === "objetivo");
  objetivos.forEach((obj) => {
    const option = document.createElement("option");
    option.value = obj.id;
    option.textContent = `${obj.id} - ${obj.nombre}`;
    objetivoSelect.appendChild(option);
  });

  // Estado para resaltado
  let currentFocusId = null;
  let nodeSel = null;
  let linkSel = null;

  // Render principal (opcionalmente filtrado por objetivos seleccionados)
  function renderGraph(filteredObjetivos = []) {
    container.selectAll("*").remove();
    currentFocusId = null; // limpiar resaltado al re-render

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

    // Quitar duplicados
    nodesToShow = Array.from(new Map(nodesToShow.map((n) => [n.id, n])).values());

    const simulation = d3
      .forceSimulation(nodesToShow)
      .force("link", d3.forceLink(linksToShow).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    // Enlaces
    linkSel = container
      .append("g")
      .attr("stroke", "#e0d7d7ff")
      .selectAll("line")
      .data(linksToShow)
      .enter()
      .append("line")
      .attr("stroke-width", 2);

    // Nodos
    nodeSel = container
      .append("g")
      .selectAll("circle")
      .data(nodesToShow)
      .enter()
      .append("circle")
      .attr("r", 15)
      .attr("fill", (d) => (d.tipo === "objetivo" ? "#043c7c" : "#00c853")) // azul objetivos, verde herramientas
      .call(drag(simulation))
      .on("click", (event, d) => {
        mostrarInfo(d);        // abrir drawer con información
        toggleHighlight(d);    // resaltar conexiones
        event.stopPropagation();
      })
      .on("dblclick", (event, d) => {
        // Abrir tabla con filtro al hacer doble clic en objetivos
        if (d.tipo === "objetivo") {
          localStorage.setItem("filtroObjetivos", JSON.stringify([d.id]));
          window.location.href = "tabla.html";
        }
        event.stopPropagation();
      });

    // Labels
    const label = container
      .append("g")
      .selectAll("text")
      .data(nodesToShow)
      .enter()
      .append("text")
      .text((d) => d.id)
      .attr("text-anchor", "middle")
      .attr("dy", -25)
      .style("pointer-events", "none");

    // Simulación
    simulation.on("tick", () => {
      linkSel
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      nodeSel.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      label.attr("x", (d) => d.x).attr("y", (d) => d.y);
    });
  }

  renderGraph();

  // ============ Persistencia desde tabla -> grafo ============
  const filtroDesdeTabla = localStorage.getItem("filtroDesdeTabla");
  if (filtroDesdeTabla) {
    const ids = JSON.parse(filtroDesdeTabla);
    [...objetivoSelect.options].forEach((opt) => {
      if (ids.includes(opt.value)) opt.selected = true;
    });
    updateSelectedTags(); // aplica al grafo y chips
    localStorage.removeItem("filtroDesdeTabla");
  }

  // ============ Selector múltiple con chips ============
  objetivoSelect.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const option = e.target;
    if (!option || option.tagName !== "OPTION") return;
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
    renderGraph(selectedValues);
  }

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

  resetBtn.addEventListener("click", () => {
    [...objetivoSelect.options].forEach((opt) => (opt.selected = false));
    selectedTagsContainer.innerHTML = "";
    renderGraph();
    clearHighlight();
    closeInfoPanel();
  });

  // ============ Drag helper ============
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

  // ============ Mostrar info en drawer ============
  function mostrarInfo(d) {
    if (d.tipo === "objetivo") {
      infoContentEl.innerHTML = `
        <h2>${d.id} - ${d.nombre}</h2>
        <p><strong>Descripción:</strong> ${d.descripcion || "-"}</p>
        <p><strong>Propósito:</strong> ${d.proposito || "-"}</p>
        <h3>Herramientas asociadas:</h3>
        <ul>${d.herramientas ? d.herramientas.map((h) => `<li>${h}</li>`).join("") : "<li>-</li>"}</ul>
      `;
    } else if (d.tipo === "herramienta") {
      infoContentEl.innerHTML = `
        <h2>${d.id}</h2>
        <p><strong>Categoría:</strong> ${d.categoria || "-"}</p>
        <p>${d.descripcion || "-"}</p>
        <h3>Casos de uso:</h3>
        <ul>${d.casos_uso ? d.casos_uso.map((c) => `<li>${c}</li>`).join("") : "<li>-</li>"}</ul>
      `;
    }
    openInfoPanel();
  }

  // ============ Resaltado de foco ============
  function clearHighlight() {
    if (!nodeSel || !linkSel) return;
    currentFocusId = null;
    nodeSel.attr("opacity", 1);
    linkSel.attr("opacity", 1).attr("stroke", "#aaa").attr("stroke-width", 2);
  }

  function setHighlight(focusId) {
    if (!nodeSel || !linkSel) return;

    // Construir conjunto de conectados (ambos sentidos)
    const connected = new Set([focusId]);
    allLinks.forEach((l) => {
      if (l.source === focusId) connected.add(l.target);
      if (l.target === focusId) connected.add(l.source);
    });

    nodeSel.attr("opacity", (n) => (connected.has(n.id) ? 1 : 0.15));

    linkSel
      .attr("opacity", (l) =>
        l.source.id === focusId || l.target.id === focusId ? 1 : 0.15
      )
      .attr("stroke", (l) =>
        l.source.id === focusId || l.target.id === focusId ? "#aaa" : "#aaa"
      )
      .attr("stroke-width", (l) =>
        l.source.id === focusId || l.target.id === focusId ? 3 : 2
      );
  }

  function toggleHighlight(d) {
    if (currentFocusId === d.id) {
      clearHighlight();
    } else {
      currentFocusId = d.id;
      setHighlight(currentFocusId);
    }
  }
    // Click en fondo del SVG: cerrar panel y quitar resaltado
    svg.on("click", (event) => {
    if (event.target.tagName.toLowerCase() === "svg") {
      closeInfoPanel();
      clearHighlight();
    }
});


});

// ============ Botón "Ver tabla" (llevar filtros seleccionados) ============
document.getElementById("verTablaBtn").addEventListener("click", () => {
  const selectedValues = Array.from(document.getElementById("objetivoSelect").selectedOptions).map(
    (opt) => opt.value
  );
  if (selectedValues.length === 0) {
    window.location.href = "tabla.html";
  } else {
    localStorage.setItem("filtroObjetivos", JSON.stringify(selectedValues));
    window.location.href = "tabla.html";
  }
});
