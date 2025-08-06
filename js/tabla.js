let dataGlobal = [];
let paginaActual = 1;
let filasPorPagina = 50; // valor inicial

// Debounce
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
    construirTabla(dataGlobal);
    cargarFiltros(dataGlobal);
  });

function construirTabla(data) {
  const tbody = document.querySelector("#tabla-cobit tbody");
  tbody.innerHTML = "";

  // Aplanar datos en filas únicas
  const filas = [];
  data.forEach(objetivo => {
    objetivo.practicas.forEach(practica => {
      practica.actividades.forEach(actividad => {
        filas.push({
          objetivo: `${objetivo.id} - ${objetivo.nombre}`, // ✅ corregido
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


  // Paginación
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
  filtroObjetivo.addEventListener("change", aplicarFiltros);
  filtroHerramienta.addEventListener("change", aplicarFiltros);

  document.getElementById("filasPorPagina").addEventListener("change", (e) => {
    filasPorPagina = parseInt(e.target.value);
    paginaActual = 1;
    construirTabla(filtrarDatosActuales());
  });

}

function aplicarFiltros() {
  paginaActual = 1;
  construirTabla(filtrarDatosActuales());
}

function filtrarDatosActuales() {
  const texto = document.getElementById("filtro").value.toLowerCase();
  const objetivoFiltro = document.getElementById("filtroObjetivo").value.toLowerCase();
  const herramientaFiltro = document.getElementById("filtroHerramienta").value.toLowerCase();

  return dataGlobal
    .map(obj => ({
      ...obj,
      practicas: obj.practicas.map(pr => ({
        ...pr,
        actividades: pr.actividades.filter(act =>
          (texto === "" || (act.descripcion + act.herramienta).toLowerCase().includes(texto)) &&
          (herramientaFiltro === "" || act.herramienta.toLowerCase() === herramientaFiltro)
        )
      })).filter(pr => pr.actividades.length > 0)
    }))
    .filter(obj =>
      (objetivoFiltro === "" || `${obj.id} - ${obj.nombre}`.toLowerCase() === objetivoFiltro) &&
      obj.practicas.length > 0
    );
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
    construirTabla(filtrarDatosActuales());
  };

  const btnNext = document.createElement("button");
  btnNext.textContent = "Siguiente ➡";
  btnNext.disabled = paginaActual === totalPaginas;
  btnNext.onclick = () => {
    paginaActual++;
    construirTabla(filtrarDatosActuales());
  };

  const indicador = document.createElement("span");
  indicador.textContent = `Página ${paginaActual} de ${totalPaginas}`;

  controles.append(btnPrev, indicador, btnNext);
}

// Filtrar desde el grafo
window.filtrarPorObjetivosDesdeGrafo = function (objetivosSeleccionados) {
  paginaActual = 1;
  const filtrados = dataGlobal.filter(obj => objetivosSeleccionados.includes(obj.id));
  construirTabla(filtrados);
};
