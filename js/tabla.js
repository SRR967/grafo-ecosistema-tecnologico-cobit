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

document.getElementById("btnExportar")?.addEventListener("click", exportarReporte);

// ---------- Exportador PDF (simple, sin colores) ----------
// ====================== Exportador SIN librerías ======================
function exportarReporte() {
  // 1) Fuente: lo que se está mostrando (respeta filtros)
  const dataset = (Array.isArray(window.filtrosActivos) && window.filtrosActivos.length)
    ? window.filtrosActivos
    : (Array.isArray(window.dataGlobal) ? window.dataGlobal : []);

  if (!dataset || dataset.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }

  // 2) Helpers
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const domainName = (id) => {
    const p = String(id||"").slice(0,3).toUpperCase();
    return ["EDM","APO","BAI","DSS","MEA"].includes(p) ? p : "N/D";
  };
  const normHerr = (h) => {
    if (!h) return "-";
    const t = String(h).trim();
    return (!t || t.toLowerCase() === "n/a") ? "-" : t;
  };

  // 3) Aplanar filas (como la tabla, sin paginar)
  const filas = [];
  dataset.forEach(obj => {
    (obj.practicas || []).forEach(pr => {
      (pr.actividades || []).forEach(act => {
        filas.push({
          objetivoId: obj.id,
          objetivo: `${obj.id} - ${obj.nombre}`,
          practica: `${pr.id} - ${pr.nombre}`,
          actividad: `${act.id} - ${act.descripcion || "-"}`,
          nivel: act.nivel_capacidad ?? "-",
          herramienta: normHerr(act.herramienta),
          justificacion: act.justificacion || "-",
          observaciones: act.observaciones || "-",
          integracion: act.integracion || "-",
          dominio: domainName(obj.id)
        });
      });
    });
  });

  // 4) Resúmenes
  const domCob = new Map(); // dominio -> {acts}
  const objPorDom = new Map(); // dominio -> Set objetivos
  const topHerr = new Map(); // herramienta -> count
  const niveles = {1:0,2:0,3:0,4:0,5:0,"-":0};

  dataset.forEach(o => {
    const d = domainName(o.id);
    if (!objPorDom.has(d)) objPorDom.set(d, new Set());
    objPorDom.get(d).add(o.id);
  });
  filas.forEach(f => {
    if (!domCob.has(f.dominio)) domCob.set(f.dominio, {acts:0});
    domCob.get(f.dominio).acts += 1;
    const h = normHerr(f.herramienta);
    topHerr.set(h, (topHerr.get(h) || 0) + 1);
    const nv = (f.nivel === "-" ? "-" : Number(f.nivel));
    if (niveles[nv] !== undefined) niveles[nv] += 1; else niveles["-"] += 1;
  });

  const coberturaRows = ["EDM","APO","BAI","DSS","MEA"].map(dom => {
    const objs = (objPorDom.get(dom) ? objPorDom.get(dom).size : 0);
    const acts = (domCob.get(dom) ? domCob.get(dom).acts : 0);
    return `<tr><td>${dom}</td><td>${objs}</td><td>${acts}</td></tr>`;
  }).join("");

  const topHerrRows = [...topHerr.entries()]
    .filter(([h]) => h !== "-")
    .sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]))
    .slice(0,15)
    .map(([h,c]) => `<tr><td>${esc(h)}</td><td>${c}</td></tr>`)
    .join("");

  const nivelesRows = [["1", niveles[1]],["2", niveles[2]],["3", niveles[3]],[ "4", niveles[4]],[ "5", niveles[5]]]
    .map(([n,c]) => `<tr><td>${n}</td><td>${c}</td></tr>`).join("");

  const nivelesIntro = (() => {
    const capMap = JSON.parse(localStorage.getItem("capacidadPorObjetivo") || "{}");
    const selRefs = JSON.parse(localStorage.getItem("userRefs") || "[]");
    if (!selRefs || !selRefs.length) return "";
    const rows = selRefs.map(id => `<tr><td>${id}</td><td>${esc(capMap[id] ?? "-")}</td></tr>`).join("");
    return `
      <div class="section">
        <h2>Niveles asignados en Hoja de Ruta</h2>
        <table class="t small">
          <thead><tr><th>Objetivo</th><th>Nivel</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  })();

  // 5) Tabla maestra
  const masterRows = filas.map(f => `
    <tr>
      <td>${esc(f.objetivo)}</td>
      <td>${esc(f.practica)}</td>
      <td>${esc(f.actividad)}</td>
      <td class="c">${esc(f.nivel)}</td>
      <td>${esc(f.herramienta)}</td>
      <td>${esc(f.justificacion)}</td>
      <td>${esc(f.observaciones)}</td>
      <td>${esc(f.integracion)}</td>
    </tr>
  `).join("");

  // 6) Texto de introducción (con créditos)
  const introTexto = `Este reporte consolida, a partir de los filtros vigentes, la trazabilidad entre los Objetivos de Gobierno y Gestión (OGG) de COBIT 2019, sus prácticas y actividades operativas, y las herramientas tecnológicas que soportan su ejecución. Su propósito es ofrecer una visión auditable y accionable del ecosistema actual: qué objetivos están siendo abordados, con qué profundidad (niveles de capacidad 1–5) y con qué evidencias (justificación técnica, observaciones e integraciones) se respalda su implementación. Metodológicamente, una actividad queda dentro del alcance si pertenece a un objetivo seleccionado y su nivel de capacidad es ≤ al nivel definido para ese objetivo en la hoja de ruta; en caso contrario se excluye. Las métricas de cobertura por dominio (EDM/APO/BAI/DSS/MEA) permiten identificar brechas, oportunidades de reutilización de herramientas y prioridades de mejora. El apartado de “Top herramientas” refleja frecuencia de uso (no criticidad) y la Tabla maestra preserva la relación OGG→Práctica→Actividad sin paginación, facilitando verificación y planeación. Este documento forma parte del trabajo de grado “Ecosistema Tecnológico para la Implementación de Hojas de Ruta de COBIT 2019”, elaborado por Johana Paola Palacio Osorio, Jesús Santiago Ramón Ramos y Jhoan Esteban Soler Giraldo.`;

  // 7) Plantilla HTML imprimible (A4)
  const fecha = new Date().toLocaleString();
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Reporte COBIT 2019 – Ecosistema</title>
<style>
  @page { size: A4; margin: 14mm; }
  @media print { 
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    .page-break { page-break-before: always; }
  }
  body{ font-family: "Segoe UI", Arial, sans-serif; color:#111; margin:0; }
  .wrap{ padding: 0; }
  h1{ font-size: 20px; margin: 0 0 6px; }
  h2{ font-size: 16px; margin: 16px 0 6px; }
  p{ font-size: 12px; line-height: 1.5; margin: 8px 0; text-align: justify; }
  .muted{ color:#666; font-size: 12px; margin-bottom: 6px; }
  .section{ margin-bottom: 10px; }
  .t{ width: 100%; border-collapse: collapse; table-layout: fixed; }
  .t th, .t td { border: 1px solid #444; padding: 6px; font-size: 11.5px; vertical-align: top; word-wrap: break-word; }
  .t thead{ background: #eee; }
  .t.small th, .t.small td{ font-size: 11px; }
  .c { text-align: center; }
  /* Tabla maestra: anchos fijos con colgroup */
  .master col.objetivo   { width: 16%; }
  .master col.practica   { width: 16%; }
  .master col.actividad  { width: 28%; }
  .master col.nivel      { width: 6%;  }
  .master col.herr       { width: 10%; }
  .master col.justif     { width: 10%; }
  .master col.obs        { width: 7%;  }
  .master col.integ      { width: 7%;  }
  .footer { position: fixed; bottom: 6mm; right: 14mm; font-size: 10px; color:#666; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Reporte COBIT 2019 – Ecosistema</h1>
    <div class="muted">Generado: ${esc(fecha)}</div>
    <p>${esc(introTexto)}</p>

    ${nivelesIntro}

    <div class="section">
      <h2>Cobertura por dominio</h2>
      <table class="t small">
        <thead><tr><th>Dominio</th><th># Objetivos</th><th># Actividades</th></tr></thead>
        <tbody>${coberturaRows}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>Top herramientas (por frecuencia de actividades)</h2>
      <table class="t small">
        <thead><tr><th>Herramienta</th><th>Actividades</th></tr></thead>
        <tbody>${topHerrRows || "<tr><td colspan='2'>No hay datos</td></tr>"}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>Conteo de actividades por nivel de capacidad</h2>
      <table class="t small">
        <thead><tr><th>Nivel</th><th>Actividades</th></tr></thead>
        <tbody>${nivelesRows}</tbody>
      </table>
    </div>

    <div class="section page-break">
      <h2>Tabla maestra de actividades (alcance actual)</h2>
      <table class="t master">
        <colgroup>
          <col class="objetivo"><col class="practica"><col class="actividad"><col class="nivel">
          <col class="herr"><col class="justif"><col class="obs"><col class="integ">
        </colgroup>
        <thead>
          <tr>
            <th>Objetivo</th>
            <th>Práctica</th>
            <th>Actividad</th>
            <th>Nivel</th>
            <th>Herramienta</th>
            <th>Justificación técnica</th>
            <th>Obs.</th>
            <th>Integración</th>
          </tr>
        </thead>
        <tbody>${masterRows}</tbody>
      </table>
    </div>

    <div class="footer">© 2025 · Proyecto de grado – Universidad del Quindío</div>
  </div>
  <script>
    // Lanza impresión cuando cargue, para que puedas "Guardar como PDF"
    window.onload = function(){ window.focus(); window.print(); };
  </script>
</body>
</html>`.trim();

  // 8) Abrir en nueva pestaña e inyectar el HTML (permite imprimir/guardar PDF)
  const win = window.open("", "_blank");
  if (!win) {
    // Si el bloqueador de popups lo impide, intenta descarga del HTML
    const blob = new Blob([html], {type: "text/html"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0,10);
    a.download = `Reporte_COBIT_2019_Ecosistema_${stamp}.html`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
    alert("Popup bloqueado. Se descargó el HTML del reporte; ábrelo y usa Imprimir → Guardar como PDF.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
