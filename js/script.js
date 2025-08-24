// ================== Referencias base ==================
const svg = d3.select("svg");
const infoPanelEl   = document.getElementById("infoPanel");
const infoContentEl = document.getElementById("infoContent");
const infoOverlayEl = document.getElementById("infoOverlay");
const closeInfoBtn  = document.getElementById("closeInfo");

const objetivoSelect        = document.getElementById("objetivoSelect");
const selectedTagsContainer = document.getElementById("selected-tags");
const resetBtn              = document.getElementById("resetBtn");

// (Se creará dinámicamente) selector para capacidad
let capacidadSelect = null;

const width  = window.innerWidth - 300; // 300 = ancho del panel izquierdo
const height = window.innerHeight;

// ================== Config visual (ajustable) ==================
const R_OBJ    = 16;    // radio fijo de objetivos (azules)
const TOOL_MIN = 14;    // mínimo de herramientas
const TOOL_MAX = 40;    // máximo de herramientas
const TOOL_EXP = 1.25;  // curva de escala (contraste)
const LINK_BASE = 120;  // distancia base de enlaces

// ================== Estado global ==================
let currentFocusId = null;
let nodeSel = null;   // <g.node>
let linkSel = null;
let labelSel = null;  // <text>

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

// ---- defs globales: blur y clip circular para imágenes ----
const rootDefs = svg.append("defs");

// Blur suave para labels fuera de foco
rootDefs.append("filter")
  .attr("id", "softBlur")
  .append("feGaussianBlur")
  .attr("stdDeviation", 1.6);

// Clip circular relativo al bbox del elemento (sirve para TODAS las imágenes)
const circleClip = rootDefs.append("clipPath")
  .attr("id", "nodeCircleClip")
  .attr("clipPathUnits", "objectBoundingBox");
circleClip.append("circle")
  .attr("cx", 0.5)
  .attr("cy", 0.5)
  .attr("r", 0.5);

// Clic en fondo del SVG: cerrar panel y quitar resaltado
svg.on("click", (event) => {
  if (event.target.tagName?.toLowerCase() === "svg") {
    closeInfoPanel();
    clearHighlight();
  }
});

// ================== Utilidades ==================
// Slug para nombres de archivos
function slugify(name) {
  return name
    .normalize?.("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[\/\\]/g, "-")
    .replace(/[^a-z0-9._ -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Rutas candidatas para imagen de herramienta en /img
function buildIconCandidates(node) {
  const baseNames = [];
  const idRaw   = String(node.id || "").trim();
  const nameRaw = String(node.nombre || "").trim();

  [idRaw, nameRaw].forEach((base) => {
    if (!base) return;
    const uniq = new Set();
    const variants = [
      base,
      base.replace(/\s+/g, "_"),
      base.replace(/\s+/g, "-"),
      slugify(base),
    ];
    variants.forEach(v => { if (v && !uniq.has(v)) { uniq.add(v); baseNames.push(v); } });
  });

  const exts = [".png", ".svg", ".jpg", ".jpeg", ".webp"];
  const candidates = [];
  baseNames.forEach(b => exts.forEach(ext => candidates.push(`img/${b}${ext}`)));
  return Array.from(new Set(candidates));
}

// Normalizador de herramienta (para cruzar actividades ↔ nodos)
const normTool = s => (s || "").toString().trim().toLowerCase();

// Drag para <g.node>
function drag(simulation) {
  return d3.drag()
    .on("start", (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on("drag",  (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on("end",   (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; });
}

// ================== Limpiar resaltado ==================
function clearHighlight() {
  if (!nodeSel || !linkSel) return;
  currentFocusId = null;
  nodeSel.attr("opacity", 1).style("filter", null);
  linkSel.attr("opacity", 1).attr("stroke", "#aaa").attr("stroke-width", 2);
  if (labelSel) labelSel.attr("opacity", 1).attr("filter", null);
}

// ================== Carga de datos (grafo + actividades) ==================
Promise.all([
  d3.json("data/grafo.json"),        // {nodes:[...], links:[{source: objetivoId, target: herramientaId}]}
  d3.json("data/actividades.json"),  // [{id, nombre, practicas:[{id, nombre, actividades:[{nivel_capacidad, herramienta, ...}], ...}]}]
]).then(([grafoData, actData]) => {
  const allNodes = grafoData.nodes;
  const allLinks = grafoData.links;

  // ------- Índice de niveles por (objetivo -> herramienta -> minNivel) -------
  // Si una herramienta aparece con distintos niveles, guardamos el MÍNIMO
  // para que "≤ capacidad seleccionada" incluya correctamente.
  const capIndex = new Map(); // objId -> Map(toolLower -> minNivel)
  actData.forEach(obj => {
    const objId = obj.id;
    if (!capIndex.has(objId)) capIndex.set(objId, new Map());
    const mapTool = capIndex.get(objId);

    (obj.practicas || []).forEach(p => {
      (p.actividades || []).forEach(a => {
        const lvl = typeof a.nivel_capacidad === "number" ? a.nivel_capacidad : null;
        const tool = normTool(a.herramienta);
        if (!tool || lvl == null) return;
        const prev = mapTool.get(tool);
        mapTool.set(tool, prev == null ? lvl : Math.min(prev, lvl));
      });
    });
  });

  // ------- Datos del Excel (si existen) -------
  const userRefsRaw  = JSON.parse(localStorage.getItem('userRefs') || "[]");    // ej: ["EDM01","APO02"]
  const maturityMap  = JSON.parse(localStorage.getItem('maturityMap') || "{}"); // ej: {EDM01:"3", APO02:"2"}

  // Objetivos disponibles en el grafo
  const objetivosAll = allNodes.filter(d => d.tipo === "objetivo");
  const allowedRefs  = Array.isArray(userRefsRaw) && userRefsRaw.length
    ? userRefsRaw.filter(id => objetivosAll.some(o => o.id === id))
    : [];

  // --------- Grados globales de herramientas (para tamaño) ---------
  const toolDegree = {};
  allLinks.forEach((l) => { toolDegree[l.target] = (toolDegree[l.target] || 0) + 1; });
  const toolMax   = d3.max(Object.values(toolDegree)) || 1;
  const toolScale = d3.scalePow().exponent(TOOL_EXP).domain([1, toolMax]).range([TOOL_MIN, TOOL_MAX]);

  function getRadius(d) {
    return d.tipo === "herramienta" ? toolScale(toolDegree[d.id] || 1) : R_OBJ;
  }
  function getStrokeWidth(d) {
    if (d.tipo !== "herramienta") return 1.5;
    const r = getRadius(d);
    return 1 + ((r - TOOL_MIN) / (TOOL_MAX - TOOL_MIN)) * 2; // 1 → 3
  }

  // ---------- Poblar selector (limitado por Excel si aplica) ----------
  objetivoSelect.innerHTML = "";
  const objetivosList = allowedRefs.length
    ? objetivosAll.filter(o => allowedRefs.includes(o.id))
    : objetivosAll;

  objetivosList.forEach((obj) => {
    const option = document.createElement("option");
    option.value = obj.id;
    option.textContent = `${obj.id} - ${obj.nombre}`;
    objetivoSelect.appendChild(option);
  });

  // ---------- Crear selector de "nivel de capacidad (máximo)" ----------
  const filterPanel = document.getElementById("filter-panel");
  const capWrapper = document.createElement("div");
  capWrapper.style.width = "100%";
  capWrapper.style.marginTop = "12px";

  const capLabel = document.createElement("label");
  capLabel.setAttribute("for", "capacidadMaxSelect");
  capLabel.innerHTML = "<strong>Nivel de capacidad (máximo):</strong>";

  capacidadSelect = document.createElement("select");
  capacidadSelect.id = "capacidadMaxSelect";
  capacidadSelect.style.width = "100%";
  capacidadSelect.style.marginTop = "6px";

  const capOpts = [
    {v:"",  t:"Todos los niveles"},
    {v:"1", t:"≤ 1"},
    {v:"2", t:"≤ 2"},
    {v:"3", t:"≤ 3"},
    {v:"4", t:"≤ 4"},
    {v:"5", t:"≤ 5"},
  ];
  capOpts.forEach(o => {
    const op = document.createElement("option");
    op.value = o.v; op.textContent = o.t;
    capacidadSelect.appendChild(op);
  });

  capWrapper.appendChild(capLabel);
  capWrapper.appendChild(capacidadSelect);
  filterPanel.insertBefore(capWrapper, filterPanel.querySelector(".button-group"));

  // ---------- Render ----------

  function renderGraph(filteredObjetivos = [], capMaxStr = "") {
    container.selectAll("*").remove();
    currentFocusId = null;

    const capMax = capMaxStr ? parseInt(capMaxStr, 10) : null;

    let nodesToShow = [];
    let linksToShow = [];

    // Base de objetivos a mostrar (Excel o todos)
    const baseObjetivos = (allowedRefs.length
      ? (filteredObjetivos.length ? filteredObjetivos.filter(id => allowedRefs.includes(id)) : allowedRefs)
      : (filteredObjetivos.length ? filteredObjetivos : objetivosAll.map(o => o.id))
    );

    const baseSet = new Set(baseObjetivos);

    // Objetivos
    const objetivosKept = allNodes.filter(n => n.tipo === "objetivo" && baseSet.has(n.id));
    // inyectar madurez desde Excel si está
    objetivosKept.forEach(n => { n.madurez = maturityMap[n.id] ?? n.madurez ?? ""; });

    nodesToShow.push(...objetivosKept);

    // Enlaces/herramientas condicionados por nivel de capacidad
    allLinks.forEach((l) => {
      if (!baseSet.has(l.source)) return;

      // Si no hay filtro de capacidad: incluir todo como siempre
      if (capMax == null) {
        const o = allNodes.find(n => n.id === l.source);
        const h = allNodes.find(n => n.id === l.target);
        if (o && h) {
          nodesToShow.push(h);
          linksToShow.push({ source: o, target: h });
        }
        return;
      }

      // Con filtro de capacidad: incluir herramienta solo si
      // hay al menos una actividad con nivel ≤ capMax para (objetivo, herramienta)
      const mapTool = capIndex.get(l.source);
      if (!mapTool) return;
      const minNivel = mapTool.get(normTool(l.target));
      if (minNivel == null) return;      // no hay actividad con nivel informado
      if (minNivel > capMax) return;     // la mínima es mayor al filtro

      const o = allNodes.find(n => n.id === l.source);
      const h = allNodes.find(n => n.id === l.target);
      if (o && h) {
        nodesToShow.push(h);
        linksToShow.push({ source: o, target: h });
      }
    });

    // Quitar duplicados de nodos
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

    // ===== Nodos como grupos <g> =====
    nodeSel = container
      .append("g")
      .attr("class", "nodes")
      .selectAll("g.node")
      .data(nodesToShow)
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .call(drag(simulation))
      .on("click", (event, d) => {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          mostrarInfo(d, capMax);
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
          // Si quieres pasar el cap a la tabla en el futuro:
          // localStorage.setItem("capacidadMaxTabla", capacidadSelect.value || "");
          window.location.href = "tabla.html";
        }
        event.stopPropagation();
        event.preventDefault();
      });

    // 1) Fondo (círculo de color) — siempre
    nodeSel.append("circle")
      .attr("class", "bg")
      .attr("r", d => getRadius(d))
      .attr("fill", d => (d.tipo === "objetivo" ? "#043c7c" : "#00c853"));

    // 2) Imagen recortada (solo herramientas) con clip circular común
    nodeSel.each(function(d) {
      if (d.tipo !== "herramienta") return;

      const g = d3.select(this);
      const r = getRadius(d);
      const candidates = buildIconCandidates(d);
      if (!candidates.length) return;

      const img = g.append("image")
        .attr("class", "tool-image")
        .attr("width",  2 * r)
        .attr("height", 2 * r)
        .attr("x", -r)
        .attr("y", -r)
        .attr("clip-path", "url(#nodeCircleClip)")
        .attr("preserveAspectRatio", "xMidYMid slice")
        .attr("href", candidates[0])
        .attr("data-try", 0);

      img.on("error", function() {
        const el = d3.select(this);
        let i = +el.attr("data-try");
        i++;
        if (i < candidates.length) {
          el.attr("href", candidates[i]).attr("data-try", i);
        } else {
          el.remove(); // fallback: solo círculo
        }
      });
    });

    // 3) Anillo/borde — siempre, por encima
    nodeSel.append("circle")
      .attr("class", "ring")
      .attr("r", d => getRadius(d))
      .attr("fill", "none")
      .attr("stroke", "#e9e9e9")
      .attr("stroke-width", d => getStrokeWidth(d));

    // Labels
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

      nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
      labelSel.attr("x", d => d.x).attr("y", d => d.y);
    });
  }

  // Render inicial
  renderGraph([], "");

  // ===== Persistencia desde tabla -> grafo =====
  const filtroDesdeTabla = localStorage.getItem("filtroDesdeTabla");
  if (filtroDesdeTabla) {
    const ids = JSON.parse(filtroDesdeTabla);
    const base = allowedRefs.length ? ids.filter(id => allowedRefs.includes(id)) : ids;
    [...objetivoSelect.options].forEach(opt => { opt.selected = base.includes(opt.value); });
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

  // Filtro por capacidad
  capacidadSelect.addEventListener("change", () => {
    updateSelectedTags(); // reusa el mismo flujo de render
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
    renderGraph(selectedValues, capacidadSelect.value || "");
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
    if (capacidadSelect) capacidadSelect.value = ""; // reset filtro capacidad
    renderGraph([], "");
    clearHighlight();
    closeInfoPanel();
  });

  // ===== Drawer info =====
  function mostrarInfo(d, capMax) {
    if (d.tipo === "objetivo") {
      const mad = d.madurez ?? (maturityMap[d.id] || "-");
      const capTxt = capMax == null ? "Todos" : `≤ ${capMax}`;
      infoContentEl.innerHTML = `
        <h2>${d.id} - ${d.nombre}</h2>
        <p><strong>Nivel de capacidad (filtro actual):</strong> ${capTxt}</p>
        <p><strong>Nivel de madurez (Excel):</strong> ${mad || "-"}</p>
        <p><strong>Descripción:</strong> ${d.descripcion || "-"}</p>
        <p><strong>Propósito:</strong> ${d.proposito || "-"}</p>
        <h3>Herramientas asociadas (según filtro):</h3>
        <p style="opacity:.8">Solo se muestran en el grafo las herramientas con actividades a nivel ≤ filtro seleccionado.</p>
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

    nodeSel
      .attr("opacity", n => (connected.has(n.id) ? 1 : 0.15))
      .style("filter", n => (connected.has(n.id) ? null : "blur(1px)"));

    linkSel
      .attr("opacity", l => (l.source.id === focusId || l.target.id === focusId ? 1 : 0.15))
      .attr("stroke",  l => (l.source.id === focusId || l.target.id === focusId ? "#aaa" : "#aaa"))
      .attr("stroke-width", l => (l.source.id === focusId || l.target.id === focusId ? 3 : 2));

    if (labelSel) {
      labelSel
        .attr("opacity", n => (connected.has(n.id) ? 1 : 0.25))
        .attr("filter",  n => (connected.has(n.id) ? null : "url(#softBlur)"));
    }
  }
  function toggleHighlight(d) {
    if (currentFocusId === d.id) clearHighlight();
    else { currentFocusId = d.id; setHighlight(currentFocusId); }
  }
});

// ============ Botón "Mas detalles" ============
document.getElementById("verTablaBtn").addEventListener("click", () => {
  const selectedValues = Array.from(document.getElementById("objetivoSelect").selectedOptions).map((opt) => opt.value);
  if (selectedValues.length === 0) {
    window.location.href = "tabla.html";
  } else {
    localStorage.setItem("filtroObjetivos", JSON.stringify(selectedValues));
    // Si quieres que la tabla reciba el filtro de capacidad:
    const capVal = (document.getElementById("capacidadMaxSelect") || {}).value || "";
    localStorage.setItem("capacidadMaxTabla", capVal);
    window.location.href = "tabla.html";
  }
});
