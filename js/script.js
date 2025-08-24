// ================== Referencias base ==================
const svg = d3.select("svg");
const infoPanelEl   = document.getElementById("infoPanel");
const infoContentEl = document.getElementById("infoContent");
const infoOverlayEl = document.getElementById("infoOverlay");
const closeInfoBtn  = document.getElementById("closeInfo");

const objetivoSelect        = document.getElementById("objetivoSelect");
const selectedTagsContainer = document.getElementById("selected-tags");
const resetBtn              = document.getElementById("resetBtn");

const width  = window.innerWidth - 300; // 300 = ancho del panel izquierdo
const height = window.innerHeight;

// ================== Config visual (ajustable) ==================
const R_OBJ    = 16;
const TOOL_MIN = 14;
const TOOL_MAX = 40;
const TOOL_EXP = 1.25;
const LINK_BASE = 120;

// ================== Estado global ==================
let currentFocusId = null;
let nodeSel = null;   // <g.node>
let linkSel = null;
let labelSel = null;

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
infoOverlayEl?.addEventListener("click", closeInfoPanel);
closeInfoBtn?.addEventListener("click", closeInfoPanel);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeInfoPanel(); });

// ================== Zoom & contenedor ==================
const container = svg.append("g");
svg.on("dblclick.zoom", null);
svg.call(d3.zoom().scaleExtent([0.1, 3]).on("zoom", (event) => container.attr("transform", event.transform)));

// ---- defs globales: blur y clip circular para imágenes ----
const rootDefs = svg.append("defs");
rootDefs.append("filter").attr("id", "softBlur").append("feGaussianBlur").attr("stdDeviation", 1.6);

const circleClip = rootDefs.append("clipPath")
  .attr("id", "nodeCircleClip")
  .attr("clipPathUnits", "objectBoundingBox");
circleClip.append("circle").attr("cx", 0.5).attr("cy", 0.5).attr("r", 0.5);

svg.on("click", (event) => {
  if (event.target.tagName?.toLowerCase() === "svg") {
    closeInfoPanel(); clearHighlight();
  }
});

// ================== Utils ==================
function slugify(name) {
  return name.normalize?.("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase()
    .replace(/[\/\\]/g, "-").replace(/[^a-z0-9._ -]/g, "")
    .replace(/\s+/g, "-").replace(/-+/g, "-");
}
function buildIconCandidates(node) {
  const baseNames = [];
  const idRaw   = String(node.id || "").trim();
  const nameRaw = String(node.nombre || "").trim();
  [idRaw, nameRaw].forEach((base) => {
    if (!base) return;
    const uniq = new Set();
    [base, base.replace(/\s+/g, "_"), base.replace(/\s+/g, "-"), slugify(base)]
      .forEach(v => { if (v && !uniq.has(v)) { uniq.add(v); baseNames.push(v); } });
  });
  const exts = [".png", ".svg", ".jpg", ".jpeg", ".webp"];
  const candidates = [];
  baseNames.forEach(b => exts.forEach(ext => candidates.push(`img/${b}${ext}`)));
  return Array.from(new Set(candidates));
}
function drag(simulation) {
  return d3.drag()
    .on("start", (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on("drag",  (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on("end",   (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; });
}
function clearHighlight() {
  if (!nodeSel || !linkSel) return;
  currentFocusId = null;
  nodeSel.attr("opacity", 1).style("filter", null);
  linkSel.attr("opacity", 1).attr("stroke", "#aaa").attr("stroke-width", 2);
  if (labelSel) labelSel.attr("opacity", 1).attr("filter", null);
}
function normalizarHerramienta(h) {
  if (!h) return "-";
  const t = String(h).trim();
  if (!t || t.toLowerCase() === "n/a") return "-";
  return t;
}

// ================== Carga de datos y render ==================
// NUEVO: también cargamos actividades.json
Promise.all([
  d3.json("data/grafo.json"),
  fetch("data/actividades.json").then(r => r.json()).catch(() => null)
]).then(([grafo, actividades]) => {
  const allNodes = grafo.nodes;
  const allLinks = grafo.links; // fallback
  const byIdNode = new Map(allNodes.map(n => [n.id, n]));
  const herramientasPorIdLower = new Map(
    allNodes.filter(n => n.tipo === "herramienta").map(n => [n.id.toLowerCase(), n])
  );

  // ------- Datos guardados desde "Ecosistema" -------
  const capMap = JSON.parse(localStorage.getItem("capacidadPorObjetivo") || "{}"); // { APO01: 2, ... }
  const userRefs = JSON.parse(localStorage.getItem("userRefs") || "[]"); // ["APO01", ...]
  const tieneEcosistema = Object.keys(capMap).length > 0 && userRefs.length > 0;

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

  // ---------- Poblar selector ----------
  objetivoSelect.innerHTML = "";
  const objetivosAll = allNodes.filter(d => d.tipo === "objetivo");

  const objetivosList = tieneEcosistema
    ? objetivosAll.filter(o => userRefs.includes(o.id))
    : objetivosAll;

  objetivosList.forEach((obj) => {
    const option = document.createElement("option");
    option.value = obj.id;
    option.textContent = `${obj.id} - ${obj.nombre}`;
    objetivoSelect.appendChild(option);
  });

  // ========= Construye enlaces filtrados por CAPACIDAD (si hay ecosistema) =========
  function buildLinksByCapacity(baseObjetivosIds) {
    if (!tieneEcosistema || !actividades) return null; // sin ecosistema -> usa fallback
    // Conjunto de objetivos a considerar
    const setObjs = new Set(
      (baseObjetivosIds?.length ? baseObjetivosIds : userRefs)
        .filter(id => capMap[id] != null)
    );

    const links = [];
    const herramientasIncluidas = new Set();

    actividades.forEach(obj => {
      const oid = obj.id;
      if (!setObjs.has(oid)) return;
      const thr = Number(capMap[oid]); // nivel max para este objetivo

      obj.practicas?.forEach(pr =>
        pr.actividades?.forEach(act => {
          const nivel = Number(act.nivel_capacidad || 0);
          if (!nivel || nivel > thr) return;

          const hName = normalizarHerramienta(act.herramienta);
          if (hName === "-") return;

          // Emparejamos contra nodo herramienta (case-insensitive)
          const toolNode =
            byIdNode.get(hName) ||
            herramientasPorIdLower.get(hName.toLowerCase());
          if (!toolNode) return;

          links.push({ source: byIdNode.get(oid), target: toolNode });
          herramientasIncluidas.add(toolNode.id);
        })
      );
    });

    // Nodos a mostrar: objetivos + herramientas realmente usadas
    const nodes = [];
    setObjs.forEach(id => { const n = byIdNode.get(id); if (n) nodes.push(n); });
    herramientasIncluidas.forEach(id => { const n = byIdNode.get(id); if (n) nodes.push(n); });

    return { nodes, links };
  }

  // ================= Render principal =================
  function renderGraph(filteredObjetivos = []) {
    container.selectAll("*").remove();
    currentFocusId = null;

    let nodesToShow = [];
    let linksToShow = [];

    if (tieneEcosistema) {
      // Si hay ecosistema: construir a partir de actividades y capMap
      const pack = buildLinksByCapacity(filteredObjetivos);
      if (pack) {
        nodesToShow = pack.nodes;
        linksToShow = pack.links;
      } else {
        // Fallback improbable
        nodesToShow = objetivosAll;
        linksToShow = [];
      }
    } else {
      // Sin ecosistema: comportamiento original (sin filtro por capacidad)
      if (filteredObjetivos.length > 0) {
        const set = new Set(filteredObjetivos);
        nodesToShow.push(...objetivosAll.filter(n => set.has(n.id)));
        allLinks.forEach((l) => {
          if (set.has(l.source)) {
            const o = byIdNode.get(l.source);
            const h = byIdNode.get(l.target);
            if (o && h) { nodesToShow.push(h); linksToShow.push({ source: o, target: h }); }
          }
        });
      } else {
        nodesToShow = [...allNodes];
        linksToShow = allLinks.map(l => ({ source: byIdNode.get(l.source), target: byIdNode.get(l.target) }));
      }
    }

    // Únicos
    nodesToShow = Array.from(new Map(nodesToShow.map(n => [n.id, n])).values());

    // Simulación
    const simulation = d3.forceSimulation(nodesToShow)
      .force("link", d3.forceLink(linksToShow).distance(d => LINK_BASE + (getRadius(d.source) + getRadius(d.target)) * 0.6))
      .force("charge", d3.forceManyBody().strength(-320))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(d => getRadius(d) + 8));

    // Enlaces
    linkSel = container.append("g").attr("stroke", "#aaa")
      .selectAll("line").data(linksToShow).enter().append("line").attr("stroke-width", 2);

    // Nodos como <g>
    nodeSel = container.append("g").attr("class", "nodes")
      .selectAll("g.node").data(nodesToShow).enter().append("g")
      .attr("class", "node")
      .call(drag(simulation))
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => { mostrarInfo(d); toggleHighlight(d); clickTimer = null; }, CLICK_DELAY);
        event.stopPropagation();
      })
      .on("dblclick", (event, d) => {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        closeInfoPanel();
        if (d.tipo === "objetivo") {
          localStorage.setItem("filtroObjetivos", JSON.stringify([d.id]));
          window.location.href = "tabla.html";
        }
        event.stopPropagation(); event.preventDefault();
      });

    // Fondo
    nodeSel.append("circle").attr("class", "bg")
      .attr("r", d => getRadius(d))
      .attr("fill", d => (d.tipo === "objetivo" ? "#043c7c" : "#00c853"));

    // Imagen (herramientas)
    nodeSel.each(function(d) {
      if (d.tipo !== "herramienta") return;
      const g = d3.select(this);
      const r = getRadius(d);
      const candidates = buildIconCandidates(d);
      if (!candidates.length) return;

      const img = g.append("image")
        .attr("class", "tool-image")
        .attr("width",  2 * r).attr("height", 2 * r)
        .attr("x", -r).attr("y", -r)
        .attr("clip-path", "url(#nodeCircleClip)")
        .attr("preserveAspectRatio", "xMidYMid slice")
        .attr("href", candidates[0]).attr("data-try", 0);

      img.on("error", function() {
        const el = d3.select(this);
        let i = +el.attr("data-try"); i++;
        if (i < candidates.length) el.attr("href", candidates[i]).attr("data-try", i);
        else el.remove();
      });
    });

    // Anillo
    nodeSel.append("circle").attr("class", "ring")
      .attr("r", d => getRadius(d))
      .attr("fill", "none").attr("stroke", "#e9e9e9")
      .attr("stroke-width", d => getStrokeWidth(d));

    // Labels
    labelSel = container.append("g").selectAll("text")
      .data(nodesToShow).enter().append("text")
      .text(d => d.id).attr("text-anchor", "middle")
      .attr("dy", d => -(getRadius(d) + 10))
      .style("font-size", d => `${Math.max(10, Math.min(16, Math.round(getRadius(d) * 0.55)))}px`)
      .style("pointer-events", "none");

    simulation.on("tick", () => {
      linkSel.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
             .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
      labelSel.attr("x", d => d.x).attr("y", d => d.y);
    });
  }

  // Render inicial:
  // - Si hay ecosistema: mostramos SOLO los objetivos seleccionados con sus herramientas por nivel.
  // - Si no, todo como antes.
  renderGraph([]);

  // ===== Persistencia desde tabla -> grafo =====
  const filtroDesdeTabla = localStorage.getItem("filtroDesdeTabla");
  if (filtroDesdeTabla) {
    const ids = JSON.parse(filtroDesdeTabla);
    const base = ids.filter(id => !tieneEcosistema || userRefs.includes(id));
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
    renderGraph([]); // con ecosistema: vuelve a todos los seleccionados en la hoja
    clearHighlight();
    closeInfoPanel();
  });

  // ===== Drawer info =====
  function mostrarInfo(d) {
    if (d.tipo === "objetivo") {
      infoContentEl.innerHTML = `
        <h2>${d.id} - ${d.nombre}</h2>
        <p><strong>Nivel de capacidad (Hoja):</strong> ${capMap[d.id] ?? "-"}</p>
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

  // ===== Resaltado =====
  function setHighlight(focusId) {
    if (!nodeSel || !linkSel) return;
    const connected = new Set([focusId]);
    linkSel.each(l => { if (l.source.id === focusId) connected.add(l.target.id); if (l.target.id === focusId) connected.add(l.source.id); });

    nodeSel.attr("opacity", n => (connected.has(n.id) ? 1 : 0.15))
           .style("filter", n => (connected.has(n.id) ? null : "blur(1px)"));

    linkSel.attr("opacity", l => (l.source.id === focusId || l.target.id === focusId ? 1 : 0.15))
           .attr("stroke-width", l => (l.source.id === focusId || l.target.id === focusId ? 3 : 2));

    if (labelSel) {
      labelSel.attr("opacity", n => (connected.has(n.id) ? 1 : 0.25))
              .attr("filter",  n => (connected.has(n.id) ? null : "url(#softBlur)"));
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
