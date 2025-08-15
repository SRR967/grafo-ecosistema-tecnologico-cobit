// ================== Referencias base ==================
const svg = d3.select("svg");
const infoPanelEl = document.getElementById("infoPanel");
const infoContentEl = document.getElementById("infoContent");
const infoOverlayEl = document.getElementById("infoOverlay");
const closeInfoBtn = document.getElementById("closeInfo");

const objetivoSelect = document.getElementById("objetivoSelect");
const selectedTagsContainer = document.getElementById("selected-tags");
const resetBtn = document.getElementById("resetBtn");

const width = window.innerWidth - 300; // 300 = ancho del panel izquierdo
const height = window.innerHeight;

// ================== Config visual (ajustable) ==================
const R_OBJ   = 18;                // radio fijo de objetivos (azules)
const TOOL_MIN = 18;               // ⬅️ mínimo más grande (antes 12)
const TOOL_MAX = 40;               // rango superior un poco mayor para más contraste
const TOOL_EXP = 1.25;             // curva potenciada (1.25 = contraste suave pero notorio)
const LINK_BASE = 120;             // distancia base de enlaces

// ================== Estado global ==================
let currentFocusId = null;
let nodeSel = null;
let linkSel = null;
let labelSel = null;  // 👈 NUEVO: referencia global a labels

// Click vs doble click
let clickTimer = null;
const CLICK_DELAY = 260; // ms

// ================== Drawer helpers ==================
function openInfoPanel() {
  infoPanelEl.classList.remove("closing");
  infoPanelEl.classList.add("open");
  infoOverlayEl.classList.add("visible");
}
function closeInfoPanel() {
  infoPanelEl.classList.add("closing");
  infoOverlayEl.classList.remove("visible");
  const onEnd = (e) => {
    if (e.propertyName !== "transform" && e.propertyName !== "opacity") return;
    infoPanelEl.classList.remove("open", "closing");
    infoPanelEl.removeEventListener("transitionend", onEnd);
  };
  infoPanelEl.addEventListener("transitionend", onEnd);
}

// Cerrar drawer: overlay, botón ✕, tecla Esc
infoOverlayEl?.addEventListener("click", closeInfoPanel);
closeInfoBtn?.addEventListener("click", closeInfoPanel);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeInfoPanel(); });

// ================== Zoom & contenedor ==================
const container = svg.append("g");
svg.on("dblclick.zoom", null); // desactiva dblclick de zoom
svg.call(
  d3.zoom().scaleExtent([0.1, 3]).on("zoom", (event) => container.attr("transform", event.transform))
);

// 👇 NUEVO: filtro de blur para labels fuera de foco
const defs = svg.append("defs");
defs.append("filter")
  .attr("id", "softBlur")
  .append("feGaussianBlur")
  .attr("stdDeviation", 1.6);

// Clic en fondo del SVG: cerrar panel y quitar resaltado
svg.on("click", (event) => {
  if (event.target.tagName?.toLowerCase() === "svg") {
    closeInfoPanel();
    clearHighlight();
  }
});

// ================== Util: limpiar resaltado ==================
function clearHighlight() {
  if (!nodeSel || !linkSel) return;
  currentFocusId = null;
  nodeSel.attr("opacity", 1);
  linkSel.attr("opacity", 1).attr("stroke", "#aaa").attr("stroke-width", 2);
  // 👇 NUEVO: resetear labels
  if (labelSel) labelSel.attr("opacity", 1).attr("filter", null);
}

// ================== Carga de datos y render ==================
d3.json("data/grafo.json").then((data) => {
  const allNodes = data.nodes;
  const allLinks = data.links; // {source: objetivoId, target: herramientaId}

  // --------- Grados globales de herramientas ---------
  const toolDegree = {};
  allLinks.forEach((l) => { toolDegree[l.target] = (toolDegree[l.target] || 0) + 1; });
  const toolMax = d3.max(Object.values(toolDegree)) || 1;
  const toolScale = d3.scalePow().exponent(TOOL_EXP).domain([1, toolMax]).range([TOOL_MIN, TOOL_MAX]);

  function getRadius(d) {
    return d.tipo === "herramienta" ? toolScale(toolDegree[d.id] || 1) : R_OBJ;
  }
  function getStrokeWidth(d) {
    if (d.tipo !== "herramienta") return 1.5;
    const r = getRadius(d);
    return 1 + ((r - TOOL_MIN) / (TOOL_MAX - TOOL_MIN)) * 2; // 1 → 3
  }

  // Poblar selector de objetivos
  allNodes.filter(d => d.tipo === "objetivo").forEach((obj) => {
    const option = document.createElement("option");
    option.value = obj.id;
    option.textContent = `${obj.id} - ${obj.nombre}`;
    objetivoSelect.appendChild(option);
  });

  function renderGraph(filteredObjetivos = []) {
    container.selectAll("*").remove();
    currentFocusId = null;

    let nodesToShow = [];
    let linksToShow = [];

    if (filteredObjetivos.length > 0) {
      const set = new Set(filteredObjetivos);
      nodesToShow.push(...allNodes.filter(n => n.tipo === "objetivo" && set.has(n.id)));
      allLinks.forEach((l) => {
        if (set.has(l.source)) {
          const o = allNodes.find(n => n.id === l.source);
          const h = allNodes.find(n => n.id === l.target);
          if (o && h) {
            nodesToShow.push(h);
            linksToShow.push({ source: o, target: h });
          }
        }
      });
    } else {
      nodesToShow = [...allNodes];
      linksToShow = allLinks.map(l => ({
        source: allNodes.find(n => n.id === l.source),
        target: allNodes.find(n => n.id === l.target),
      }));
    }
    nodesToShow = Array.from(new Map(nodesToShow.map(n => [n.id, n])).values());

    const simulation = d3
      .forceSimulation(nodesToShow)
      .force("link", d3.forceLink(linksToShow).distance(d => LINK_BASE + (getRadius(d.source) + getRadius(d.target)) * 0.6))
      .force("charge", d3.forceManyBody().strength(-320))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(d => getRadius(d) + 8));

    // Enlaces
    linkSel = container
      .append("g")
      .attr("stroke", "#aaa")
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
      .attr("r", d => getRadius(d))
      .attr("fill", d => (d.tipo === "objetivo" ? "#043c7c" : "#00c853")) // azul objetivos, verde herramientas
      .attr("stroke", "#e9e9e9")
      .attr("stroke-width", d => getStrokeWidth(d))
      .call(drag(simulation))
      .on("click", (event, d) => {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          mostrarInfo(d);
          toggleHighlight(d);
          clickTimer = null;
        }, CLICK_DELAY);
        event.stopPropagation();
      })
      .on("dblclick", (event, d) => {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        closeInfoPanel();
        if (d.tipo === "objetivo") {
          localStorage.setItem("filtroObjetivos", JSON.stringify([d.id]));
          window.location.href = "tabla.html";
        }
        event.stopPropagation();
        event.preventDefault();
      });

    // Labels (posición + tamaño según radio)  👇 GUARDAMOS EN labelSel
    labelSel = container
      .append("g")
      .selectAll("text")
      .data(nodesToShow)
      .enter()
      .append("text")
      .text(d => d.id)
      .attr("text-anchor", "middle")
      .attr("dy", d => -(getRadius(d) + 10))
      .style("font-size", d => `${Math.max(10, Math.min(16, Math.round(getRadius(d) * 0.55)))}px`)
      .style("pointer-events", "none");

    simulation.on("tick", () => {
      linkSel
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      nodeSel.attr("cx", d => d.x).attr("cy", d => d.y);
      labelSel.attr("x", d => d.x).attr("y", d => d.y);
    });
  }

  renderGraph();

  // ===== Persistencia desde tabla -> grafo =====
  const filtroDesdeTabla = localStorage.getItem("filtroDesdeTabla");
  if (filtroDesdeTabla) {
    const ids = JSON.parse(filtroDesdeTabla);
    [...objetivoSelect.options].forEach(opt => { if (ids.includes(opt.value)) opt.selected = true; });
    updateSelectedTags();
    localStorage.removeItem("filtroDesdeTabla");
  }

  // ===== Selector múltiple con chips =====
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
      [...objetivoSelect.options].forEach((opt) => { if (opt.value === value) opt.selected = false; });
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

  // ===== Drag helper =====
  function drag(simulation) {
    return d3.drag()
      .on("start", (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag",  (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on("end",   (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; });
  }

  // ===== Drawer info =====
  function mostrarInfo(d) {
    if (d.tipo === "objetivo") {
      infoContentEl.innerHTML = `
        <h2>${d.id} - ${d.nombre}</h2>
        <p><strong>Descripción:</strong> ${d.descripcion || "-"}</p>
        <p><strong>Propósito:</strong> ${d.proposito || "-"}</p>
        <h3>Herramientas asociadas:</h3>
        <ul>${d.herramientas ? d.herramientas.map((h) => `<li>${h}</li>`).join("") : "<li>-</li>"}</ul>
      `;
    } else {
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

  // ===== Resaltado (con blur en labels fuera de foco) =====
  function setHighlight(focusId) {
    if (!nodeSel || !linkSel) return;
    const connected = new Set([focusId]);
    allLinks.forEach((l) => {
      if (l.source === focusId) connected.add(l.target);
      if (l.target === focusId) connected.add(l.source);
    });

    nodeSel.attr("opacity", n => (connected.has(n.id) ? 1 : 0.15));

    linkSel
      .attr("opacity", l => (l.source.id === focusId || l.target.id === focusId ? 1 : 0.15))
      .attr("stroke", l => (l.source.id === focusId || l.target.id === focusId ? "#aaa" : "#aaa"))
      .attr("stroke-width", l => (l.source.id === focusId || l.target.id === focusId ? 3 : 2));

    // 👇 NUEVO: labels con opacidad y blur
    if (labelSel) {
      labelSel
        .attr("opacity", n => (connected.has(n.id) ? 1 : 0.25))
        .attr("filter", n => (connected.has(n.id) ? null : "url(#softBlur)"));
    }
  }

  function toggleHighlight(d) {
    if (currentFocusId === d.id) clearHighlight();
    else { currentFocusId = d.id; setHighlight(currentFocusId); }
  }
});

// ============ Botón "Ver tabla" ============
document.getElementById("verTablaBtn").addEventListener("click", () => {
  const selectedValues = Array.from(document.getElementById("objetivoSelect").selectedOptions).map((opt) => opt.value);
  if (selectedValues.length === 0) window.location.href = "tabla.html";
  else {
    localStorage.setItem("filtroObjetivos", JSON.stringify(selectedValues));
    window.location.href = "tabla.html";
  }
});
