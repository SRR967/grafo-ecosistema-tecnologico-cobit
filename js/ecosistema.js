// js/ecosistema.js

// ================= Util =================
const badge = (id, nombre) =>
  `<span class="badge">${id}</span><div class="obj-name">${nombre}</div>`;

function dominioDe(id) {
  const pref = String(id).slice(0, 3).toUpperCase();
  if (["EDM", "APO", "BAI", "DSS", "MEA"].includes(pref)) return pref;
  return "OTR"; // fallback
}

function normalizarHerramienta(h) {
  if (h == null) return "";
  const t = String(h).trim();
  if (!t || t.toLowerCase() === "n/a" || t === "-") return "";
  return t;
}

// ================= Estado =================
const state = {
  // id -> nivel (string "1".."5" o "")
  selected: new Map(),
  // dataset dinámico leído desde actividades.json
  objetivos: [], // [{id, nombre, dominio}]
  // índice para cálculos de enlaces filtrados
  indiceActividades: new Map(), // idObj -> [{herramienta, nivel_capacidad}, ...]
};

// ================== Cargar actividades.json ==================
(async function init() {
  try {
    const res = await fetch("data/actividades.json", { cache: "no-store" });
    const data = await res.json();

    // Construimos lista de objetivos y un índice de actividades por objetivo
    const objetivos = [];
    const idx = new Map();

    for (const obj of data) {
      const id = obj.id;
      const nombre = obj.nombre || "";
      const dom = dominioDe(id);

      objetivos.push({ id, nombre, dominio: dom });

      // aplanamos actividades con (herramienta, nivel_capacidad)
      const acts = [];
      for (const p of (obj.practicas || [])) {
        for (const a of (p.actividades || [])) {
          const herramienta = normalizarHerramienta(a.herramienta);
          const nivel = Number(a.nivel_capacidad || 0);
          acts.push({ herramienta, nivel_capacidad: nivel });
        }
      }
      idx.set(id, acts);
    }

    // guardamos en estado
    state.objetivos = objetivos.sort((a, b) => a.id.localeCompare(b.id));
    state.indiceActividades = idx;

    // render
    render();
  } catch (err) {
    console.error("No se pudo cargar data/actividades.json", err);
    document.getElementById("board").innerHTML =
      `<div style="padding:16px;color:#f88">Error cargando actividades.json.</div>`;
  }
})();

// ================== Render del tablero ==================
const board = document.getElementById("board");

const DOMAINS = [
  { key: "EDM", title: "EDM — Evaluar, Dirigir y Monitorizar", areaClass: "domain--edm" },
  { key: "APO", title: "APO — Alinear, Planear y Organizar", areaClass: "domain--apo" },
  { key: "BAI", title: "BAI — Construir, Adquirir e Implementar", areaClass: "domain--bai" },
  { key: "DSS", title: "DSS — Entregar, Dar Soporte y Servicio", areaClass: "domain--dss" },
  { key: "MEA", title: "MEA — Monitorizar, Evaluar y Valorar", areaClass: "domain--mea" },
];

function byDomain(dom) {
  return state.objetivos.filter(d => d.dominio === dom);
}

function render() {
  board.innerHTML = "";

  // Agregamos de nuevo los “frames” de fondo (si tu HTML no los trae)
  if (!board.querySelector(".frame-left")) {
    const f1 = document.createElement("div");
    f1.className = "frame-left";
    f1.setAttribute("aria-hidden", "true");
    const f2 = document.createElement("div");
    f2.className = "frame-mea";
    f2.setAttribute("aria-hidden", "true");
    board.appendChild(f1);
    board.appendChild(f2);
  }

  DOMAINS.forEach(dom => {
    const wrap = document.createElement("section");
    wrap.className = `domain ${dom.areaClass}`;

    const header = document.createElement("div");
    header.className = "domain-header";
    header.textContent = dom.title;

    const body = document.createElement("div");
    body.className = "domain-body";

    byDomain(dom.key).forEach(item => body.appendChild(card(item)));

    wrap.appendChild(header);
    wrap.appendChild(body);
    board.appendChild(wrap);
  });

  updateStatus();
  updateButtonState();
}

function card(item) {
  const isSelected = state.selected.has(item.id);

  const el = document.createElement("div");
  el.className = "obj-card" + (isSelected ? " selected" : "");
  el.dataset.id = item.id;

  const title = document.createElement("div");
  title.className = "obj-title";
  title.innerHTML = badge(item.id, item.nombre);

  const capacity = document.createElement("div");
  capacity.className = "capacity";
  capacity.innerHTML = `
    <label for="cap-${item.id}">Nivel de capacidad:</label>
    <select id="cap-${item.id}">
      <option value="">Seleccione…</option>
      <option value="1">1</option>
      <option value="2">2</option>
      <option value="3">3</option>
      <option value="4">4</option>
      <option value="5">5</option>
    </select>
  `;

  // valor inicial si ya estaba seleccionado
  if (isSelected) {
    capacity.querySelector("select").value = String(state.selected.get(item.id));
  }

  // Click en tarjeta: alterna selección (excepto si clic en <select>)
  el.addEventListener("click", (e) => {
    if (e.target && e.target.tagName === "SELECT") return;
    const selectedNow = el.classList.toggle("selected");
    if (selectedNow) {
      if (!state.selected.has(item.id)) state.selected.set(item.id, "");
    } else {
      state.selected.delete(item.id);
    }
    updateStatus();
    updateButtonState();
  });

  // Cambio de nivel
  capacity.querySelector("select").addEventListener("change", (e) => {
    state.selected.set(item.id, e.target.value);
    updateStatus();
    updateButtonState();
  });

  el.appendChild(title);
  el.appendChild(capacity);
  return el;
}

function updateStatus() {
  const totalSel = state.selected.size;
  const completos = Array.from(state.selected.values()).filter(v => v !== "").length;
  document.getElementById("statusMsg").textContent =
    `${totalSel} objetivos seleccionados · ${completos} con nivel asignado`;
}

function allSelectedHaveLevel() {
  if (state.selected.size === 0) return false;
  for (const v of state.selected.values()) if (v === "") return false;
  return true;
}

function updateButtonState() {
  document.getElementById("crearBtn").disabled = !allSelectedHaveLevel();
}

// ================== Calcular enlaces filtrados ==================
function calcularLinksFiltrados() {
  // Devuelve pares {source: objId, target: herramienta} para cada objetivo
  // considerando SOLO actividades con nivel_capacidad <= nivel elegido
  // y herramientas válidas.
  const links = [];
  const capMap = Object.fromEntries(
    Array.from(state.selected.entries()).map(([id, nivel]) => [id, Number(nivel)])
  );

  for (const [objId, nivelSel] of Object.entries(capMap)) {
    const acts = state.indiceActividades.get(objId) || [];
    const herramientas = new Set();
    for (const a of acts) {
      if (!a) continue;
      const h = normalizarHerramienta(a.herramienta);
      const n = Number(a.nivel_capacidad || 0);
      if (!h) continue;
      if (n > 0 && n <= nivelSel) herramientas.add(h);
    }
    for (const h of herramientas) {
      links.push({ source: objId, target: h });
    }
  }
  return links;
}

// ===== Acción principal =====
document.getElementById("crearBtn").addEventListener("click", () => {
  // Todos los seleccionados deben tener nivel
  const payload = Array.from(state.selected.entries())
    .map(([id, nivel]) => ({ id, nivel_capacidad: Number(nivel) }))
    .filter(x => x.nivel_capacidad >= 1 && x.nivel_capacidad <= 5);

  if (payload.length === 0) return;

  // Mapa objetivo -> nivel
  const capMap = Object.fromEntries(payload.map(x => [x.id, x.nivel_capacidad]));
  // Solo ids
  const refs = payload.map(x => x.id);

  // Persistimos para el grafo/tabla
  localStorage.setItem("hojaRutaSeleccion", JSON.stringify(payload));
  localStorage.setItem("capacidadPorObjetivo", JSON.stringify(capMap));
  localStorage.setItem("userRefs", JSON.stringify(refs)); // por si lo usabas antes

  // (opcional) limpiar claves viejas que ya no uses.
  localStorage.removeItem("maturityMap");

  // Ir al grafo
  window.location.href = "index.html";
});

