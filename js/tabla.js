// ======== Estado global ========
let dataGlobal = [];
let paginaActual = 1;
let filasPorPagina = 50;
let filtrosActivos = null;

// Filtros traídos del grafo (si venías con selección previa)
const filtroGuardado = JSON.parse(localStorage.getItem("filtroObjetivos")) || [];

// Utilidad: debounce
function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}

// -------- Carga del JSON --------
fetch("data/actividades.json")
  .then((r) => r.json())
  .then((data) => {
    dataGlobal = data;

    cargarFiltros(dataGlobal);

    if (filtroGuardado.length > 0) {
      // Aplica filtro inicial por objetivo (llega del grafo)
      const soloSeleccionados = dataGlobal.filter((obj) =>
        filtroGuardado.includes(obj.id)
      );
      filtrosActivos = soloSeleccionados.length ? soloSeleccionados : dataGlobal;

      // Marcar opciones seleccionadas visualmente
      const filtroObjetivo = document.getElementById("filtroObjetivo");
      [...filtroObjetivo.options].forEach((opt) => {
        const id = opt.value.split(" - ")[0];
        if (filtroGuardado.includes(id)) opt.selected = true;
      });
      actualizarTagsObjetivos();
      localStorage.removeItem("filtroObjetivos");
    } else {
      filtrosActivos = dataGlobal;
    }

    construirTabla(filtrosActivos);
  });

// ======== Construcción de tabla ========
function construirTabla(data) {
  const tbody = document.querySelector("#tabla-cobit tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Aplanar estructura {objetivo -> práctica -> actividad} a filas
  const filas = [];
  data.forEach((obj) => {
    obj.practicas.forEach((pr) => {
      pr.actividades.forEach((act) => {
        filas.push({
          objetivo: `${obj.id} - ${obj.nombre}`,
          practica: `${pr.id} - ${pr.nombre}`,
          actividad: `${act.id} - ${act.descripcion || "-"}`,
          nivel: formatearNivel(act.nivel_capacidad),      // 👈 HERE
          herramienta: normalizarHerramienta(act.herramienta),
          justificacion: act.justificacion || "-",
          observaciones: act.observaciones || "-",
          integracion: act.integracion || "-",
        });
      });
    });
  });

  // Resumen (total y por herramienta) usando todo el set filtrado (no paginado)
  actualizarResumenDesdeFilas(filas);

  // Paginación
  const inicio = (paginaActual - 1) * filasPorPagina;
  const fin = inicio + filasPorPagina;
  const pagina = filas.slice(inicio, fin);

  // Render filas (orden EXACTO como en tu THEAD)
  pagina.forEach((f) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(f.objetivo)}</td>
      <td>${escapeHTML(f.practica)}</td>
      <td>${escapeHTML(f.actividad)}</td>
      <td class="nivel-cap">${escapeHTML(f.nivel)}</td>           <!-- Nivel de Capacidad -->
      <td>${escapeHTML(f.herramienta)}</td>
      <td>${escapeHTML(f.justificacion)}</td>
      <td>${escapeHTML(f.observaciones)}</td>
      <td>${escapeHTML(f.integracion)}</td>
    `;
    tbody.appendChild(tr);
  });

  actualizarControlesPaginacion(filas.length);
}

// ======== Utilidades varias ========
function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatearNivel(n) {
  if (n === null || n === undefined || n === "" || n === "NA") return "-";
  const num = Number(n);
  return Number.isFinite(num) ? String(num) : "-";
}

function normalizarHerramienta(h) {
  if (!h) return "-";
  const t = String(h).trim();
  if (t === "" || t.toLowerCase() === "n/a") return "-";
  return t;
}

// ======== Resumen superior (chips) ========
function actualizarResumenDesdeFilas(filas) {
  const wrap = document.getElementById("resumenResultados");
  if (!wrap) return;

  wrap.innerHTML = "";

  const bar = document.createElement("div");
  bar.className = "summary-bar";

  if (!filas || filas.length === 0) {
    const msg = document.createElement("span");
    msg.className = "summary-label";
    msg.textContent = "No hay actividades para los filtros aplicados.";
    bar.appendChild(msg);
    wrap.appendChild(bar);
    return;
  }

  const totalBadge = document.createElement("span");
  totalBadge.className = "summary-badge";
  totalBadge.textContent = `Total de actividades: ${filas.length}`;
  bar.appendChild(totalBadge);

  const lbl = document.createElement("span");
  lbl.className = "summary-label";
  lbl.textContent = "Por herramienta:";
  bar.appendChild(lbl);

  const conteo = new Map();
  for (const f of filas) {
    const h = normalizarHerramienta(f.herramienta);
    conteo.set(h, (conteo.get(h) || 0) + 1);
  }

  const chips = document.createElement("div");
  chips.className = "summary-chips";

  [...conteo.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([herr, cnt]) => {
      const chip = document.createElement("span");
      chip.className = "chip" + (herr === "-" ? " muted" : "");
      chip.innerHTML = `${escapeHTML(herr)} <span class="count">${cnt}</span>`;
      chips.appendChild(chip);
    });

  bar.appendChild(chips);
  wrap.appendChild(bar);
}

// ======== Filtros ========
function cargarFiltros(data) {
  const filtroObjetivo = document.getElementById("filtroObjetivo");
  const filtroHerramienta = document.getElementById("filtroHerramienta");
  const filtroCapacidadMax = document.getElementById("filtroCapacidadMax");

  const objetivosSet = new Set();
  const herramientasSet = new Set();

  data.forEach((obj) => {
    objetivosSet.add(`${obj.id} - ${obj.nombre}`);
    obj.practicas.forEach((pr) =>
      pr.actividades.forEach((act) => {
        herramientasSet.add(normalizarHerramienta(act.herramienta));
      })
    );
  });

  // Llenar selects
  filtroObjetivo.innerHTML = "";
  objetivosSet.forEach((o) => filtroObjetivo.append(new Option(o, o)));

  // Mantiene "Todas" en Herramientas
  // (ya existe la opción vacía en el HTML)
  herramientasSet.forEach((h) => filtroHerramienta.append(new Option(h, h)));

  // Listeners
  document
    .getElementById("filtro")
    .addEventListener("input", debounce(aplicarFiltros, 300));
  filtroHerramienta.addEventListener("change", aplicarFiltros);
  filtroCapacidadMax?.addEventListener("change", aplicarFiltros);

  document.getElementById("filasPorPagina").addEventListener("change", (e) => {
    filasPorPagina = parseInt(e.target.value, 10);
    paginaActual = 1;
    construirTabla(filtrosActivos);
  });

  // Selector múltiple por "toggle" para Objetivos
  filtroObjetivo.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const option = e.target;
    if (!option || option.tagName !== "OPTION") return;
    option.selected = !option.selected;
    actualizarTagsObjetivos();
    aplicarFiltros();
  });

  // Click en chip para quitar selección
  document.getElementById("tagsObjetivos").addEventListener("click", (e) => {
    if (e.target.tagName === "SPAN") {
      const valor = e.target.getAttribute("data-value");
      Array.from(filtroObjetivo.options).forEach((opt) => {
        if (opt.value === valor) opt.selected = false;
      });
      actualizarTagsObjetivos();
      aplicarFiltros();
    }
  });

      // 🔄 Limpiar TODOS los filtros
    document.getElementById("limpiarObjetivos").addEventListener("click", () => {
      const filtroTexto = document.getElementById("filtro");
      const filtroObjetivo = document.getElementById("filtroObjetivo");
      const filtroHerramienta = document.getElementById("filtroHerramienta");
      const filtroCapacidadMax = document.getElementById("filtroCapacidadMax"); // puede no existir

      // 1) Texto de búsqueda
      if (filtroTexto) filtroTexto.value = "";

      // 2) Objetivos (multiselect)
      if (filtroObjetivo) {
        Array.from(filtroObjetivo.options).forEach(opt => (opt.selected = false));
      }

      // 3) Herramienta
      if (filtroHerramienta) filtroHerramienta.value = "";

      // 4) Capacidad (hasta)
      if (filtroCapacidadMax) filtroCapacidadMax.value = "";

      // 5) UI de chips y refresco
      actualizarTagsObjetivos();
      paginaActual = 1;
      filtrosActivos = filtrarDatosActuales();
      construirTabla(filtrosActivos);
    });

}

function actualizarTagsObjetivos() {
  const cont = document.getElementById("tagsObjetivos");
  const filtroObjetivo = document.getElementById("filtroObjetivo");
  cont.innerHTML = "";

  const seleccionados = Array.from(filtroObjetivo.selectedOptions);
  if (seleccionados.length === 0) return;

  seleccionados.forEach((opt) => {
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.innerHTML = `${escapeHTML(opt.text)} <span data-value="${escapeHTML(
      opt.value
    )}">&times;</span>`;
    cont.appendChild(tag);
  });
}

function aplicarFiltros() {
  paginaActual = 1;
  filtrosActivos = filtrarDatosActuales();
  construirTabla(filtrosActivos);
}

// Buscador + filtros (objetivo, herramienta, capacidad "hasta")
function filtrarDatosActuales() {
  const texto = document.getElementById("filtro").value.trim().toLowerCase();

  const filtroObjetivoSelect = document.getElementById("filtroObjetivo");
  const objetivoSeleccionados = Array.from(
    filtroObjetivoSelect.selectedOptions
  ).map((opt) => opt.value.toLowerCase());

  const herramientaFiltro = document
    .getElementById("filtroHerramienta")
    .value.toLowerCase(); // "" (todas) o valor

  const capMaxStr =
    document.getElementById("filtroCapacidadMax")?.value || "";
  const capMax = capMaxStr ? Number(capMaxStr) : null;

  return dataGlobal
    .map((obj) => {
      const objetivoLabel = `${obj.id} - ${obj.nombre}`.toLowerCase();
      if (
        objetivoSeleccionados.length > 0 &&
        !objetivoSeleccionados.includes(objetivoLabel)
      ) {
        return null;
      }

      const practicasFiltradas = obj.practicas
        .map((pr) => {
          const practicaLabel = `${pr.id} - ${pr.nombre}`.toLowerCase();

          const actividadesFiltradas = pr.actividades.filter((act) => {
            const actividadLabel = `${act.id} - ${act.descripcion || "-"}`.toLowerCase();
            const herramienta = normalizarHerramienta(
              act.herramienta
            ).toLowerCase();
            const justificacion = (act.justificacion || "-").toLowerCase();
            const observaciones = (act.observaciones || "-").toLowerCase();
            const integracion = (act.integracion || "-").toLowerCase();

            const haystack = [
              objetivoLabel,
              practicaLabel,
              actividadLabel,
              herramienta,
              justificacion,
              observaciones,
              integracion,
            ].join(" ");

            const coincideTexto = texto === "" || haystack.includes(texto);
            const coincideHerramienta =
              herramientaFiltro === "" || herramienta === herramientaFiltro;

            // Filtro capacidad "hasta"
            const nivelNum = Number(act.nivel_capacidad);
            const coincideCapacidad =
              capMax === null ||
              !Number.isFinite(nivelNum) ||
              nivelNum <= capMax;

            return coincideTexto && coincideHerramienta && coincideCapacidad;
          });

          return actividadesFiltradas.length > 0
            ? { ...pr, actividades: actividadesFiltradas }
            : null;
        })
        .filter(Boolean);

      return practicasFiltradas.length > 0
        ? { ...obj, practicas: practicasFiltradas }
        : null;
    })
    .filter(Boolean);
}

// ======== Paginación ========
function actualizarControlesPaginacion(totalFilas) {
  const cont = document.getElementById("paginacion");
  cont.innerHTML = "";

  const totalPaginas = Math.ceil(totalFilas / filasPorPagina) || 1;

  const btnPrev = document.createElement("button");
  btnPrev.textContent = "⬅ Anterior";
  btnPrev.disabled = paginaActual === 1;
  btnPrev.onclick = () => {
    paginaActual--;
    construirTabla(filtrosActivos);
  };

  const indicador = document.createElement("span");
  indicador.textContent = `Página ${paginaActual} de ${totalPaginas}`;

  const btnNext = document.createElement("button");
  btnNext.textContent = "Siguiente ➡";
  btnNext.disabled = paginaActual === totalPaginas;
  btnNext.onclick = () => {
    paginaActual++;
    construirTabla(filtrosActivos);
  };

  cont.append(btnPrev, indicador, btnNext);
}

// ======== Volver al grafo con selección aplicada ========
document.getElementById("btnVolverGrafo")?.addEventListener("click", () => {
  const objetivoSelect = document.getElementById("filtroObjetivo");
  const seleccionados = Array.from(objetivoSelect.selectedOptions).map((opt) =>
    opt.value.split(" - ")[0]
  );

  if (seleccionados.length > 0) {
    localStorage.setItem("filtroDesdeTabla", JSON.stringify(seleccionados));
  } else {
    localStorage.removeItem("filtroDesdeTabla");
  }
});
