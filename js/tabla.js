let dataGlobal = [];
let paginaActual = 1;
let filasPorPagina = 50;
let filtrosActivos = null;

const filtroGuardado = JSON.parse(localStorage.getItem("filtroObjetivos")) || [];

function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}

fetch("data/actividades.json")
  .then(response => response.json())
  .then(data => {
    dataGlobal = data;
    cargarFiltros(dataGlobal);

    if (filtroGuardado.length > 0) {
      filtrosActivos = dataGlobal.filter(obj => filtroGuardado.includes(obj.id));
      construirTabla(filtrosActivos);

      const filtroObjetivo = document.getElementById("filtroObjetivo");
      [...filtroObjetivo.options].forEach(option => {
        const id = option.value.split(" - ")[0];
        if (filtroGuardado.includes(id)) {
          option.selected = true;
        }
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
    objetivo.practicas.forEach(practica => {
      practica.actividades.forEach(actividad => {
        filas.push({
          objetivo: `${objetivo.id} - ${objetivo.nombre}`,
          practica: `${practica.id} - ${practica.nombre}`,
          actividad: `${actividad.id} - ${actividad.descripcion}`,
          herramienta: actividad.herramienta || "-",
          justificacion: actividad.justificacion || "-",
          observaciones: actividad.observaciones || "-",
          integracion: actividad.integracion || "-"
        });
      });
    });
  });

  const inicio = (paginaActual - 1) * filasPorPagina;
  const fin = inicio + filasPorPagina;
  const filasPagina = filas.slice(inicio, fin);

  filasPagina.forEach(f => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${f.objetivo}</td>
      <td>${f.practica}</td>
      <td>${f.actividad}</td>
      <td>${f.herramienta}</td>
      <td>${f.justificacion}</td>
      <td>${f.observaciones}</td>
      <td>${f.integracion}</td>
    `;
    tbody.appendChild(row);
  });

  actualizarControlesPaginacion(filas.length);
}

function cargarFiltros(data) {
  const filtroObjetivo = document.getElementById("filtroObjetivo");
  const filtroHerramienta = document.getElementById("filtroHerramienta");

  const objetivosSet = new Set();
  const herramientasSet = new Set();

  data.forEach(obj => {
    objetivosSet.add(`${obj.id} - ${obj.nombre}`);
    obj.practicas.forEach(practica =>
      practica.actividades.forEach(act => herramientasSet.add(act.herramienta))
    );
  });

  objetivosSet.forEach(o => filtroObjetivo.append(new Option(o, o)));
  herramientasSet.forEach(h => filtroHerramienta.append(new Option(h, h)));

  document.getElementById("filtro").addEventListener("input", debounce(aplicarFiltros, 300));
  filtroHerramienta.addEventListener("change", aplicarFiltros);

  document.getElementById("filasPorPagina").addEventListener("change", (e) => {
    filasPorPagina = parseInt(e.target.value);
    paginaActual = 1;
    construirTabla(filtrosActivos);
  });

  // ✅ Selector múltiple tipo grafo
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

    Array.from(filtroObjetivo.options).forEach(opt => {
      if (opt.value === valor) opt.selected = false;
    });

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
  const texto = document.getElementById("filtro").value.toLowerCase();
  const filtroObjetivoSelect = document.getElementById("filtroObjetivo");
  const objetivoSeleccionados = Array.from(filtroObjetivoSelect.selectedOptions).map(opt => opt.value.toLowerCase());
  const herramientaFiltro = document.getElementById("filtroHerramienta").value.toLowerCase();

  return dataGlobal
    .map(obj => {
      const objetivoNombre = `${obj.id} - ${obj.nombre}`.toLowerCase();
      if (objetivoSeleccionados.length > 0 && !objetivoSeleccionados.includes(objetivoNombre)) {
        return null;
      }

      const practicasFiltradas = obj.practicas.map(pr => ({
        ...pr,
        actividades: pr.actividades.filter(act =>
          (texto === "" || (act.descripcion + act.herramienta).toLowerCase().includes(texto)) &&
          (herramientaFiltro === "" || act.herramienta.toLowerCase() === herramientaFiltro)
        )
      })).filter(pr => pr.actividades.length > 0);

      return practicasFiltradas.length > 0 ? { ...obj, practicas: practicasFiltradas } : null;
    })
    .filter(Boolean);
}

function actualizarControlesPaginacion(totalFilas) {
  const controles = document.getElementById("paginacion");
  controles.innerHTML = "";

  const totalPaginas = Math.ceil(totalFilas / filasPorPagina);

  const btnPrev = document.createElement("button");
  btnPrev.textContent = "⬅ Anterior";
  btnPrev.disabled = paginaActual === 1;
  btnPrev.onclick = () => {
    paginaActual--;
    construirTabla(filtrosActivos);
  };

  const btnNext = document.createElement("button");
  btnNext.textContent = "Siguiente ➡";
  btnNext.disabled = paginaActual === totalPaginas;
  btnNext.onclick = () => {
    paginaActual++;
    construirTabla(filtrosActivos);
  };

  const indicador = document.createElement("span");
  indicador.textContent = `Página ${paginaActual} de ${totalPaginas}`;

  controles.append(btnPrev, indicador, btnNext);
}

document.getElementById("btnVolverGrafo").addEventListener("click", () => {
  const objetivoSelect = document.getElementById("filtroObjetivo");
  const seleccionados = Array.from(objetivoSelect.selectedOptions).map(opt => opt.value.split(" - ")[0]);

  if (seleccionados.length > 0) {
    localStorage.setItem("filtroDesdeTabla", JSON.stringify(seleccionados));
  } else {
    localStorage.removeItem("filtroDesdeTabla");
  }
});

document.getElementById("abrirFiltros").addEventListener("click", () => {
  document.getElementById("panelFiltros").classList.add("abierto");
});

document.getElementById("cerrarFiltros").addEventListener("click", () => {
  document.getElementById("panelFiltros").classList.remove("abierto");
});
