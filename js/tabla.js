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

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnExportar");
  if (btn) btn.addEventListener("click", exportarReporte);
});

// ---------- Exportador PDF (simple, sin colores) ----------
// ====================== Exportador SIN librerías ======================
// ====== Exportar PDF: "Reporte del ecosistema tecnológico" ======
// ====== Exportar PDF: "Reporte del ecosistema tecnológico" ======
async function exportarReporte () {
  // 1) Validaciones de librerías
  const { jsPDF } = (window.jspdf || {});
  if (!jsPDF) { alert("Falta jsPDF en la página"); return; }
  if (!jsPDF.API || typeof jsPDF.API.autoTable !== "function") {
    alert("Falta el plugin jsPDF-Autotable"); return;
  }

  // ----------------- Helpers -----------------
  const DOM_KEYS = ["EDM", "APO", "BAI", "DSS", "MEA"];

  const dominioDe = (id) => {
    const pref = String(id).slice(0, 3).toUpperCase();
    return DOM_KEYS.includes(pref) ? pref : "OTR";
  };
  const normHerr = (h) => {
    if (h == null) return "-";
    const t = String(h).trim();
    return (!t || t.toLowerCase() === "n/a" || t === "-") ? "-" : t;
  };

  // Aplana data a filas básicas; prioriza filtros activos si existen
  async function getFilas() {
    const srcBase =
      (typeof filtrosActivos !== "undefined" && Array.isArray(filtrosActivos) && filtrosActivos.length)
        ? filtrosActivos
        : (typeof dataGlobal !== "undefined" ? dataGlobal : null);

    const src = srcBase || await fetch("data/actividades.json", { cache: "no-store" }).then(r => r.json());

    const out = [];
    (src || []).forEach(obj => {
      (obj.practicas || []).forEach(pr => {
        (pr.actividades || []).forEach(a => {
          out.push({
            objetivo: `${obj.id} - ${obj.nombre || "-"}`,
            objetivo_id: obj.id,
            practica: `${pr.id} - ${pr.nombre || "-"}`,
            actividad: `${a.id} - ${a.descripcion || "-"}`,
            nivel_capacidad: a?.nivel_capacidad ?? "-",
            herramienta: normHerr(a?.herramienta),
            justificacion: a?.justificacion || "-",
            observaciones: a?.observaciones || "-",
            integracion: a?.integracion || "-"
          });
        });
      });
    });
    return out;
  }

  function mapaCobertura(filas) {
    const porDomObj = new Map();
    const porDomAct = new Map();
    const vistos = new Set();

    for (const f of filas) {
      const dom = dominioDe(f.objetivo_id);
      if (!vistos.has(f.objetivo_id)) {
        vistos.add(f.objetivo_id);
        porDomObj.set(dom, (porDomObj.get(dom) || 0) + 1);
      }
      porDomAct.set(dom, (porDomAct.get(dom) || 0) + 1);
    }
    return {
      objetivos: DOM_KEYS.map(d => ({ dominio: d, count: porDomObj.get(d) || 0 })),
      actividades: DOM_KEYS.map(d => ({ dominio: d, count: porDomAct.get(d) || 0 })),
    };
  }

  function conteoNiveles(filas) {
    const m = new Map();
    for (const f of filas) {
      const n = Number(f.nivel_capacidad);
      if (Number.isFinite(n)) m.set(n, (m.get(n) || 0) + 1);
    }
    return [1,2,3,4,5].map(n => ({ nivel: `Nivel ${n}`, count: m.get(n) || 0 }));
  }

  function nivelesAsignadosDesdeEcosistema() {
    const capMap = JSON.parse(localStorage.getItem("capacidadPorObjetivo") || "{}");
    const refs   = JSON.parse(localStorage.getItem("userRefs") || "[]");
    return refs
      .filter(id => capMap[id] != null && String(capMap[id]).trim() !== "")
      .map(id => ({ objetivo: id, nivel: String(capMap[id]) }));
  }

  function topHerramientas(filas) {
    const m = new Map();
    for (const f of filas) m.set(f.herramienta, (m.get(f.herramienta) || 0) + 1);
    return [...m.entries()]
      .sort((a, b) => {
        if (a[0] === "-" && b[0] !== "-") return 1;
        if (b[0] === "-" && a[0] !== "-") return -1;
        return b[1] - a[1] || a[0].localeCompare(b[0]);
      })
      .map(([herramienta, count]) => ({ herramienta, count }));
  }

  // ----- Pie chart con leyenda y labels: devuelve {url, w, h} -----
  function piePNG(pares, size = 360) {
  const MAX_SLICES = 12; // 11 + "Otros"
  let data = [...pares];
  if (data.length > MAX_SLICES) {
    const top = data.slice(0, MAX_SLICES - 1);
    const otros = data.slice(MAX_SLICES - 1);
    const sumOtros = otros.reduce((s, x) => s + x.count, 0);
    data = [...top, { herramienta: "Otros", count: sumOtros }];
  }
  const total = data.reduce((s, d) => s + d.count, 0) || 1;

  const legendW = 240;           // espacio para leyenda a la derecha
  const W = size + legendW;
  const H = Math.max(300, size * 0.85);

  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // <<< fondo opaco para que NO se vea nada detrás >>>
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  const cx = size * 0.46;
  const cy = H * 0.58;
  const r  = Math.min(size * 0.42, H * 0.42);

  const color = (i) => `hsl(${Math.floor((i * 37) % 360)},65%,60%)`;

  // rebanadas
  let ang = -Math.PI / 2;
  data.forEach((d, i) => {
    const frac = d.count / total;
    const a2 = ang + frac * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.fillStyle = color(i);
    ctx.arc(cx, cy, r, ang, a2);
    ctx.closePath();
    ctx.fill();

    // etiquetas con línea solo si la porción >= 3%
    const mid = (ang + a2) / 2;
    if (frac >= 0.03) {
      const lx = cx + Math.cos(mid) * (r + 6);
      const ly = cy + Math.sin(mid) * (r + 6);
      const tx = cx + Math.cos(mid) * (r + 28);
      const ty = cy + Math.sin(mid) * (r + 28);

      ctx.strokeStyle = "#666";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(mid) * (r - 4), cy + Math.sin(mid) * (r - 4));
      ctx.lineTo(lx, ly);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      const pct = Math.round(frac * 100);
      ctx.fillStyle = "#111";
      ctx.font = "12px sans-serif";
      ctx.textAlign = (Math.cos(mid) >= 0) ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`${pct}%`, tx + (Math.cos(mid) >= 0 ? 4 : -4), ty);
    }
    ang = a2;
  });

  // donut interior (blanco, SIN texto en el centro)
  ctx.beginPath();
  ctx.fillStyle = "#fff";
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // leyenda
  const xL = size + 20;
  let yL = 20;
  ctx.font = "12px sans-serif";
  data.forEach((d, i) => {
    const pct = Math.round((d.count / total) * 100);
    ctx.fillStyle = color(i);
    ctx.fillRect(xL, yL - 10, 12, 12);
    ctx.fillStyle = "#111";
    ctx.fillText(`${d.herramienta} — ${d.count} (${pct}%)`, xL + 18, yL);
    yL += 16;
  });

  return { url: c.toDataURL("image/png"), w: W, h: H };
}


  // ----------------- Construcción del PDF -----------------
  const filas = await getFilas();
  if (!filas.length) { alert("No hay datos para exportar (revisa los filtros)."); return; }

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const M = 36;

  // Portada
  doc.setFont("helvetica", "bold").setFontSize(20);
  doc.text("Reporte del ecosistema tecnológico", M, 70);
  doc.setFont("helvetica", "normal").setFontSize(11);
  const intro =
    "Propósito: entregar un resumen ejecutable del avance del ecosistema tecnológico " +
    "conforme a COBIT 2019, incluyendo cobertura por dominio, niveles de capacidad, " +
    "uso de herramientas y el detalle completo de actividades. " +
    "El documento fue elaborado por el equipo del proyecto para comunicar nivel de adopción, " +
    "soporte de herramientas y trazabilidad de actividades.";
  doc.text(doc.splitTextToSize(intro, 760), M, 100);

  // 1) Mapa de cobertura
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text("1) Mapa de cobertura por dominio", M, 150);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("A continuación se presentan los dominios COBIT cubiertos por los objetivos y el número total de actividades asociadas.", M, 168);
  const cobertura = mapaCobertura(filas);
  doc.autoTable({
    startY: 188, margin: { left: M },
    head: [["Dominio", "# Objetivos"]],
    body: cobertura.objetivos.map(x => [x.dominio, x.count]),
    styles: { fontSize: 9 }, tableWidth: 340, theme: "grid"
  });
  const yAfter1 = doc.lastAutoTable.finalY;
  doc.autoTable({
    startY: 188, margin: { left: M + 360 },
    head: [["Dominio", "# Actividades"]],
    body: cobertura.actividades.map(x => [x.dominio, x.count]),
    styles: { fontSize: 9 }, tableWidth: 340, theme: "grid"
  });
  let cursorY = Math.max(yAfter1, doc.lastAutoTable.finalY) + 18;

  // 2) Niveles de capacidad
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text("2) Niveles de capacidad", M, cursorY);
  cursorY += 18;
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("Se detalla el conteo de actividades por nivel de capacidad y, si existe, el nivel objetivo asignado desde la vista de Ecosistema.", M, cursorY);
  cursorY += 12;

  const niveles = conteoNiveles(filas);
  doc.autoTable({
    startY: cursorY + 6, margin: { left: M },
    head: [["Nivel", "# Actividades"]],
    body: niveles.map(n => [n.nivel, n.count]),
    styles: { fontSize: 9 }, tableWidth: 240, theme: "grid"
  });
  const yLeft = doc.lastAutoTable.finalY;
  const nivelesEco = nivelesAsignadosDesdeEcosistema();
  doc.autoTable({
    startY: cursorY + 6, margin: { left: M + 260 },
    head: [["Objetivo", "Nivel"]],
    body: (nivelesEco.length ? nivelesEco : [{objetivo:"-", nivel:"-"}]).map(x => [x.objetivo, x.nivel]),
    styles: { fontSize: 9 }, tableWidth: 280, theme: "grid"
  });
  cursorY = Math.max(yLeft, doc.lastAutoTable.finalY) + 18;

  // 3) Resumen de herramientas + gráfico de torta
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text("3) Resumen de herramientas", M, cursorY);
  cursorY += 18;
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("Listado de herramientas utilizadas por las actividades y su participación relativa.", M, cursorY);
  cursorY += 6;

  const tops = topHerramientas(filas);
  doc.autoTable({
    startY: cursorY + 10, margin: { left: M },
    head: [["Herramienta", "# Actividades"]],
    body: (tops.length ? tops : [{herramienta:"-", count:0}]).map(t => [t.herramienta, t.count]),
    styles: { fontSize: 9 }, tableWidth: 340, theme: "grid"
  });
  cursorY = doc.lastAutoTable.finalY + 12;

// ---- Preparar la imagen del PIE ----
const { url: pieURL, w: imgW, h: imgH } = piePNG(tops);
const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();

// Garantiza espacio vertical; si no cabe, agrega página y resetea cursor
const ensureSpace = (needed) => {
  if (cursorY + needed > pageH - M) {
    doc.addPage("landscape", "a4");
    cursorY = 60; // margen superior en la nueva página
  }
};

// Tamaño dibujado conservando aspecto
const maxW = pageW - M * 2;
let drawW = Math.min(imgW, maxW);
let drawH = imgH * (drawW / imgW);

// Asegura espacio para TÍTULO (16pt) + GRÁFICO
ensureSpace(16 + drawH);

// --- Título encima del gráfico ---
doc.setFont("helvetica", "bold").setFontSize(12);
doc.text("Distribución de herramientas en el ecosistema", M, cursorY);
cursorY += 16; // baja para dejar lugar a la imagen

// Dibuja la imagen centrada
const xCentered = M + (maxW - drawW) / 2;
doc.addImage(pieURL, "PNG", xCentered, cursorY, drawW, drawH);

// Avanza cursor para lo que siga
cursorY += drawH + 24;


  // 4) Tabla maestra de actividades (en nueva página)
  doc.addPage("landscape", "a4");
  let y = 60;
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text("4) Tabla maestra de actividades", M, y);
  y += 18;
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("Se presenta la tabla completa de objetivos, prácticas y actividades, con nivel de capacidad y soporte de herramienta.", M, y);
  y += 10;

  doc.autoTable({
    startY: y + 8,
    margin: { left: M, right: M },
    head: [["Objetivo", "Práctica", "Actividad", "Nivel", "Herramienta", "Justificación Técnica", "Observaciones", "Integración"]],
    body: filas.map(f => [
      f.objetivo, f.practica, f.actividad,
      String(f.nivel_capacidad ?? "-"),
      f.herramienta, f.justificacion, f.observaciones, f.integracion
    ]),
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [4, 60, 124], textColor: 255 },
    theme: "grid",
    didDrawPage(data) {
      doc.setFontSize(9).setTextColor(150);
      doc.text("Reporte del ecosistema tecnológico", M, 30);
      const str = `Página ${doc.internal.getNumberOfPages()}`;
      doc.text(str, doc.internal.pageSize.getWidth() - M - doc.getTextWidth(str), 30);
    }
  });

  // Guardar
  doc.save("reporte_ecosistema.pdf");
}
