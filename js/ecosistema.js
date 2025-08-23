// ===== Dataset de los 40 objetivos (id, nombre, dominio) =====
const DATA = [
  // EDM (5)
  {id:"EDM01", nombre:"Garantizar el establecimiento y mantenimiento del marco de gobierno", dominio:"EDM"},
  {id:"EDM02", nombre:"Asegurar la realización de beneficios", dominio:"EDM"},
  {id:"EDM03", nombre:"Asegurar la optimización del riesgo", dominio:"EDM"},
  {id:"EDM04", nombre:"Asegurar la optimización de los recursos", dominio:"EDM"},
  {id:"EDM05", nombre:"Asegurar la transparencia con las partes interesadas", dominio:"EDM"},

  // APO (14)
  {id:"APO01", nombre:"Gestionar el marco de gestión de TI", dominio:"APO"},
  {id:"APO02", nombre:"Gestionar la estrategia", dominio:"APO"},
  {id:"APO03", nombre:"Gestionar la arquitectura de la empresa", dominio:"APO"},
  {id:"APO04", nombre:"Gestionar la innovación", dominio:"APO"},
  {id:"APO05", nombre:"Gestionar el portafolio", dominio:"APO"},
  {id:"APO06", nombre:"Gestionar el presupuesto y los costes", dominio:"APO"},
  {id:"APO07", nombre:"Gestionar los recursos humanos", dominio:"APO"},
  {id:"APO08", nombre:"Gestionar las relaciones", dominio:"APO"},
  {id:"APO09", nombre:"Gestionar los acuerdos de servicio", dominio:"APO"},
  {id:"APO10", nombre:"Gestionar los proveedores", dominio:"APO"},
  {id:"APO11", nombre:"Gestionar la calidad", dominio:"APO"},
  {id:"APO12", nombre:"Gestionar el riesgo", dominio:"APO"},
  {id:"APO13", nombre:"Gestionar la seguridad", dominio:"APO"},
  {id:"APO14", nombre:"Gestionar los datos", dominio:"APO"},

  // BAI (11)
  {id:"BAI01", nombre:"Gestionar los programas", dominio:"BAI"},
  {id:"BAI02", nombre:"Gestionar la definición de requisitos", dominio:"BAI"},
  {id:"BAI03", nombre:"Gestionar la identificación y construcción de soluciones", dominio:"BAI"},
  {id:"BAI04", nombre:"Gestionar la disponibilidad y capacidad", dominio:"BAI"},
  {id:"BAI05", nombre:"Gestionar los cambios organizativos", dominio:"BAI"},
  {id:"BAI06", nombre:"Gestionar los cambios de TI", dominio:"BAI"},
  {id:"BAI07", nombre:"Gestionar la aceptación y transición de cambios", dominio:"BAI"},
  {id:"BAI08", nombre:"Gestionar el conocimiento", dominio:"BAI"},
  {id:"BAI09", nombre:"Gestionar los activos", dominio:"BAI"},
  {id:"BAI10", nombre:"Gestionar la configuración", dominio:"BAI"},
  {id:"BAI11", nombre:"Gestionar los proyectos", dominio:"BAI"},

  // DSS (6)
  {id:"DSS01", nombre:"Gestionar las operaciones", dominio:"DSS"},
  {id:"DSS02", nombre:"Gestionar las solicitudes e incidentes de servicio", dominio:"DSS"},
  {id:"DSS03", nombre:"Gestionar los problemas", dominio:"DSS"},
  {id:"DSS04", nombre:"Gestionar la continuidad", dominio:"DSS"},
  {id:"DSS05", nombre:"Gestionar los servicios de seguridad", dominio:"DSS"},
  {id:"DSS06", nombre:"Gestionar los controles de procesos de negocio", dominio:"DSS"},

  // MEA (4)
  {id:"MEA01", nombre:"Gestionar la monitorización del rendimiento y la conformidad", dominio:"MEA"},
  {id:"MEA02", nombre:"Gestionar el sistema de control interno", dominio:"MEA"},
  {id:"MEA03", nombre:"Gestionar el cumplimiento de los requisitos externos", dominio:"MEA"},
  {id:"MEA04", nombre:"Gestionar el aseguramiento", dominio:"MEA"},
];

// ===== Render del tablero por dominios (figura estilo COBIT) =====
const board = document.getElementById("board");
const byDomain = (dom) => DATA.filter(d => d.dominio === dom);

const DOMAINS = [
  {key:"EDM", title:"EDM — Evaluar, Dirigir y Monitorizar", areaClass:"domain--edm"},
  {key:"APO", title:"APO — Alinear, Planear y Organizar", areaClass:"domain--apo"},
  {key:"BAI", title:"BAI — Construir, Adquirir e Implementar", areaClass:"domain--bai"},
  {key:"DSS", title:"DSS — Entregar, Dar Soporte y Servicio", areaClass:"domain--dss"},
  {key:"MEA", title:"MEA — Monitorizar, Evaluar y Valorar", areaClass:"domain--mea"},
];

const state = {
  selected: new Map(), // id -> nivel (1..5)
};

function render() {
  board.innerHTML = "";
  DOMAINS.forEach(dom => {
    const wrap = document.createElement("section");
    wrap.className = `domain ${dom.areaClass}`;

    const header = document.createElement("div");
    header.className = "domain-header";
    header.textContent = dom.title;

    const body = document.createElement("div");
    body.className = "domain-body";

    byDomain(dom.key).forEach(item => {
      body.appendChild(card(item));
    });

    wrap.appendChild(header);
    wrap.appendChild(body);
    board.appendChild(wrap);
  });

  updateStatus();
  updateButtonState();
}

function card(item){
  const isSelected = state.selected.has(item.id);

  const el = document.createElement("div");
  el.className = "obj-card" + (isSelected ? " selected" : "");
  el.dataset.id = item.id;

  const title = document.createElement("div");
  title.className = "obj-title";
  title.innerHTML = `<span class="badge">${item.id}</span><div class="obj-name">${item.nombre}</div>`;

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

  // Click en tarjeta: alterna selección
  el.addEventListener("click", (e) => {
    // Si el click fue sobre el <select>, no alternar la selección
    if (e.target && e.target.tagName === "SELECT") return;

    const selected = el.classList.toggle("selected");
    if (selected) {
      // si se selecciona y no había nivel, dejar “Seleccione…”
      if (!state.selected.has(item.id)) state.selected.set(item.id, "");
    } else {
      state.selected.delete(item.id);
    }
    updateStatus();
    updateButtonState();
  });

  // Cambio de nivel
  capacity.querySelector("select").addEventListener("change", (e) => {
    const val = e.target.value;
    state.selected.set(item.id, val);
    updateStatus();
    updateButtonState();
  });

  el.appendChild(title);
  el.appendChild(capacity);
  return el;
}

function updateStatus(){
  const totalSel = Array.from(state.selected.keys()).length;
  const completos = Array.from(state.selected.values()).filter(v => v !== "").length;
  document.getElementById("statusMsg").textContent =
    `${totalSel} objetivos seleccionados · ${completos} con nivel asignado`;
}

function allSelectedHaveLevel(){
  if (state.selected.size === 0) return false;
  for (const v of state.selected.values()){
    if (v === "") return false;
  }
  return true;
}

function updateButtonState(){
  document.getElementById("crearBtn").disabled = !allSelectedHaveLevel();
}

// ===== Acción principal =====
document.getElementById("crearBtn").addEventListener("click", () => {
  if (!allSelectedHaveLevel()) return;

  // Guardar en localStorage y continuar
  const payload = Array.from(state.selected.entries()).map(([id, nivel]) => ({
    id, nivel_capacidad: Number(nivel)
  }));
  localStorage.setItem("hojaRutaSeleccion", JSON.stringify(payload));

  // Cambia aquí el destino si tu siguiente vista es otra
  window.location.href = "index.html";
});

// Render inicial
render();
