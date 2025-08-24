let dataGlobal = [];
let paginaActual = 1;
let filasPorPagina = 50;
let filtrosActivos = null;

const filtroGuardado = JSON.parse(localStorage.getItem("filtroObjetivos")) || [];

function debounce(func, delay) {
  let timeout;
  return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), delay); };
}

fetch("data/actividades.json")
  .then(response => response.json())
  .then(data => {
    // ===== Prefiltro desde Hoja de Ruta (por objetivo y nivel) =====
    const capMap = JSON.parse(localStorage.getItem("capacidadPorObjetivo") || "{}"); // { APO01: 2, ... }
    const selRefs = JSON.parse(localStorage.getItem("userRefs") || "[]");

    if (Object.keys(capMap).length && selRefs.length) {
      dataGlobal = data
        .filter(obj => selRefs.includes(obj.id)) // sólo objetivos seleccionados
        .map(obj => {
          const thr = Number(capMap[obj.id] || 0);
          const practicas = (obj.practicas || []).map(pr => {
            const acts = (pr.actividades || []).filter(a => Number(a.nivel_capacidad || 0) <= thr);
            return acts.length ? { ...pr, actividades: acts } : null;
          }).filter(Boolean);
          return { ...obj, practicas };
        })
        .filter(o => o.practicas && o.practicas.length > 0);
    } else {
      // Sin hoja de ruta -> dataset completo
      dataGlobal = data;
    }

    cargarFiltros(dataGlobal);

    if (filtroGuardado.length > 0) {
      filtrosActivos = dataGlobal.filter(obj => filtroGuardado.includes(obj.id));
      construirTabla(filtrosActivos);

      const filtroObjetivo = document.getElementById("filtroObjetivo");
      [...filtroObjetivo.options].forEach(option => {
        const id = option.value.split(" - ")[0];
        if (filtroGuardado.includes(id)) option.selected = true;
      });

      actualizarTagsObjetivos();
      localStorage.removeItem("filtroObjetivos");
    } else {
      filtrosActivos = dataGlobal;
      construirTabla(filtrosActivos);
    }
  });

function construirTabla(data) {
  const tbody = document.querySelector("#tabla-cobit tbody");
  tbody.innerHTML = "";

  const filas = [];
  data.forEach(objetivo => {
    (objetivo.practicas || []).forEach(practica => {
      (practica.actividades || []).forEach(actividad => {
        filas.push({
          objetivo: `${objetivo.id} - ${objetivo.nombre}`,
          practica: `${practica.id} - ${practica.nombre}`,
          actividad: `${actividad.id} - ${actividad.descripcion}`,
          nivel_capacidad: actividad.nivel_capacidad ?? "-",
          herramienta: normalizarHerramienta(actividad.herramienta),
          justificacion: actividad.justificacion || "-",
          observaciones: actividad.observaciones || "-",
          integracion: actividad.integracion || "-"
        });
      });
    });
  });

  actualizarResumenDesdeFilas(filas);

  const inicio = (paginaActual - 1) * filasPorPagina;
  const fin = inicio + filasPorPagina;
  const filasPagina = filas.slice(inicio, fin);

  filasPagina.forEach(f => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${f.objetivo}</td>
      <td>${f.practica}</td>
      <td>${f.actividad}</td>
      <td>${f.nivel_capacidad}</td>
      <td>${f.herramienta}</td>
      <td>${f.justificacion}</td>
      <td>${f.observaciones}</td>
      <td>${f.integracion}</td>
    `;
    tbody.appendChild(row);
  });

  actualizarControlesPaginacion(filas.length);
}

function normalizarHerramienta(h) {
  if (!h) return "-";
  const t = String(h).trim();
  if (t === "" || t.toLowerCase() === "n/a") return "-";
  return t;
}

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
      chip.innerHTML = `${herr} <span class="count">${cnt}</span>`;
      chips.appendChild(chip);
    });

  bar.appendChild(chips);
  wrap.appendChild(bar);
}

function cargarFiltros(data) {
  const filtroObjetivo = document.getElementById("filtroObjetivo");
  const filtroHerramienta = document.getElementById("filtroHerramienta");

  const objetivosSet = new Set();
  const herramientasSet = new Set();

  data.forEach(obj => {
    objetivosSet.add(`${obj.id} - ${obj.nombre}`);
    obj.practicas.forEach(practica =>
      practica.actividades.forEach(act => {
        herramientasSet.add(normalizarHerramienta(act.herramienta));
      })
    );
  });

  objetivosSet.forEach(o => filtroObjetivo.append(new Option(o, o)));
  herramientasSet.forEach(h => filtroHerramienta.append(new Option(h, h)));

  document.getElementById("filtro").addEventListener("input", debounce(aplicarFiltros, 300));
  filtroHerramienta.addEventListener("change", aplicarFiltros);

  document.getElementById("filasPorPagina").addEventListener("change", (e) => {
    filasPorPagina = parseInt(e.target.value, 10);
    paginaActual = 1;
    construirTabla(filtrosActivos);
  });

  filtroObjetivo.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const option = e.target;
    option.selected = !option.selected;
    actualizarTagsObjetivos();
    aplicarFiltros();
  });
}

function actualizarTagsObjetivos() {
  const contenedor = document.getElementById("tagsObjetivos");
  const filtroObjetivo = document.getElementById("filtroObjetivo");

  contenedor.innerHTML = "";
  const seleccionados = Array.from(filtroObjetivo.selectedOptions);
  if (seleccionados.length === 0) return;

  seleccionados.forEach(opt => {
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.innerHTML = `${opt.text} <span data-value="${opt.value}">&times;</span>`;
    contenedor.appendChild(tag);
  });
}

document.getElementById("tagsObjetivos").addEventListener("click", (e) => {
  if (e.target.tagName === "SPAN") {
    const valor = e.target.getAttribute("data-value");
    const filtroObjetivo = document.getElementById("filtroObjetivo");
    Array.from(filtroObjetivo.options).forEach(opt => { if (opt.value === valor) opt.selected = false; });
    actualizarTagsObjetivos();
    aplicarFiltros();
  }
});

function aplicarFiltros() {
  paginaActual = 1;
  filtrosActivos = filtrarDatosActuales();
  construirTabla(filtrosActivos);
}

function filtrarDatosActuales() {
  const texto = document.getElementById("filtro").value.trim().toLowerCase();
  const filtroObjetivoSelect = document.getElementById("filtroObjetivo");
  const objetivoSeleccionados = Array.from(filtroObjetivoSelect.selectedOptions).map(opt => opt.value.toLowerCase());
  const herramientaFiltro = document.getElementById("filtroHerramienta").value.toLowerCase();

  return dataGlobal
    .map(obj => {
      const objetivoLabel = `${obj.id} - ${obj.nombre}`.toLowerCase();
      if (objetivoSeleccionados.length > 0 && !objetivoSeleccionados.includes(objetivoLabel)) return null;

      const practicasFiltradas = obj.practicas
        .map(pr => {
          const practicaLabel = `${pr.id} - ${pr.nombre}`.toLowerCase();
          const actividadesFiltradas = pr.actividades.filter(act => {
            const actividadLabel = `${act.id} - ${act.descripcion || "-"}`.toLowerCase();
            const herramienta = normalizarHerramienta(act.herramienta).toLowerCase();
            const justificacion = (act.justificacion || "-").toLowerCase();
            const observaciones = (act.observaciones || "-").toLowerCase();
            const integracion = (act.integracion || "-").toLowerCase();

            const haystack = [objetivoLabel, practicaLabel, actividadLabel, herramienta, justificacion, observaciones, integracion].join(" ");
            const coincideTexto = texto === "" || haystack.includes(texto);
            const coincideHerramienta = herramientaFiltro === "" || herramienta === herramientaFiltro;

            return coincideTexto && coincideHerramienta;
          });
          return actividadesFiltradas.length > 0 ? { ...pr, actividades: actividadesFiltradas } : null;
        })
        .filter(Boolean);

      return practicasFiltradas.length > 0 ? { ...obj, practicas: practicasFiltradas } : null;
    })
    .filter(Boolean);
}

function actualizarControlesPaginacion(totalFilas) {
  const controles = document.getElementById("paginacion");
  controles.innerHTML = "";

  const totalPaginas = Math.ceil(totalFilas / filasPorPagina) || 1;

  const btnPrev = document.createElement("button");
  btnPrev.textContent = "⬅ Anterior";
  btnPrev.disabled = paginaActual === 1;
  btnPrev.onclick = () => { paginaActual--; construirTabla(filtrosActivos); };

  const btnNext = document.createElement("button");
  btnNext.textContent = "Siguiente ➡";
  btnNext.disabled = paginaActual === totalPaginas;
  btnNext.onclick = () => { paginaActual++; construirTabla(filtrosActivos); };

  const indicador = document.createElement("span");
  indicador.textContent = `Página ${paginaActual} de ${totalPaginas}`;

  controles.append(btnPrev, indicador, btnNext);
}

document.getElementById("btnVolverGrafo").addEventListener("click", () => {
  const objetivoSelect = document.getElementById("filtroObjetivo");
  const seleccionados = Array.from(objetivoSelect.selectedOptions).map(opt => opt.value.split(" - ")[0]);
  if (seleccionados.length > 0) localStorage.setItem("filtroDesdeTabla", JSON.stringify(seleccionados));
  else localStorage.removeItem("filtroDesdeTabla");
});

document.getElementById("abrirFiltros").addEventListener("click", () => {
  document.getElementById("panelFiltros").classList.add("abierto");
});
document.getElementById("cerrarFiltros").addEventListener("click", () => {
  document.getElementById("panelFiltros").classList.remove("abierto");
});
document.getElementById("limpiarObjetivos").addEventListener("click", () => {
  const filtroObjetivo = document.getElementById("filtroObjetivo");
  Array.from(filtroObjetivo.options).forEach(opt => opt.selected = false);
  actualizarTagsObjetivos(); aplicarFiltros();
});
