// ====== elementos ======
const inpEmpresa   = document.getElementById('empresa');
const inpExcel     = document.getElementById('excel');
const dropzone     = document.getElementById('dropzone');
const fileInfo     = document.getElementById('fileInfo');
const btnContinuar = document.getElementById('continuar');

// habilitar botón cuando hay título + archivo parseado
function updateButtonState(){
  const ok = inpEmpresa.value.trim().length > 0 && (inpExcel.files?.length || 0) > 0;
  btnContinuar.disabled = !ok;
}

// mostrar info del archivo
function showFileInfo(file){
  if(!file){ fileInfo.textContent = ""; return; }
  const kb = (file.size/1024).toFixed(1);
  fileInfo.textContent = `Archivo seleccionado: ${file.name} — ${kb} KB`;
}

// intentar obtener índices de columnas por cabecera
function locateColumns(headersRow){
  const headers = headersRow.map(h => String(h || "").trim().toLowerCase());

  // buscamos ref (referencia del objetivo)
  let idxRef = headers.findIndex(h =>
    h === "ref" ||
    h.includes("referenc") ||
    h.includes("id objetivo") ||
    h === "id" || h.startsWith("ogg")
  );

  // buscamos madurez
  let idxMad = headers.findIndex(h => h.includes("madur"));

  return { idxRef, idxMad };
}

// parsear Excel con SheetJS → guarda en localStorage userRefs + maturityMap
function parseExcel(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      if (!rows.length) { alert("El archivo está vacío."); return; }

      const { idxRef, idxMad } = locateColumns(rows[0]);
      if (idxRef === -1) { alert("No se encontró la columna de 'Referencia' (ref)."); return; }
      if (idxMad === -1) { alert("No se encontró la columna de 'Nivel de capacidad'."); return; }

      const userRefs = [];
      const maturityMap = {};

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const ref = String(r[idxRef] || "").trim();
        if (!ref) continue;

        const madRaw = r[idxMad];
        const mad = (madRaw === null || madRaw === undefined || String(madRaw).trim() === "") ? "" : String(madRaw).trim();

        userRefs.push(ref);
        maturityMap[ref] = mad; // guarda tal cual; lo usaremos luego
      }

      const uniqueRefs = Array.from(new Set(userRefs));
      if (uniqueRefs.length === 0) {
        alert("No se encontraron referencias válidas en el Excel.");
        return;
      }

      localStorage.setItem('userRefs', JSON.stringify(uniqueRefs));
      localStorage.setItem('maturityMap', JSON.stringify(maturityMap));

      showFileInfo(file);
      updateButtonState();
    } catch (err) {
      console.error(err);
      alert("No se pudo leer el Excel. Verifica el formato.");
    }
  };
  reader.readAsArrayBuffer(file);
}

// eventos de input de texto
inpEmpresa.addEventListener('input', updateButtonState);

// Drag&drop: prevenir por defecto
['dragenter','dragover','dragleave','drop'].forEach(evt => {
  window.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
});

// arrastrar/soltar estilos
['dragenter','dragover'].forEach(evt =>
  dropzone.addEventListener(evt, () => dropzone.classList.add('drag'))
);
['dragleave','drop'].forEach(evt =>
  dropzone.addEventListener(evt, () => dropzone.classList.remove('drag'))
);

// manejar drop
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if(!file) return;
  if(!/\.xlsx?$/i.test(file.name)){
    alert('Formato no permitido. Usa .xlsx o .xls');
    return;
  }
  const dt = new DataTransfer();
  dt.items.add(file);
  inpExcel.files = dt.files;
  showFileInfo(file);
  parseExcel(file);
});

// selección por diálogo (clic en el <label for="excel"> abre el diálogo; NO forzamos click manual)
inpExcel.addEventListener('change', () => {
  const file = inpExcel.files?.[0];
  if(!file) { showFileInfo(null); updateButtonState(); return; }
  if(!/\.xlsx?$/i.test(file.name)){
    alert('Formato no permitido. Usa .xlsx o .xls');
    inpExcel.value = '';
    showFileInfo(null);
    updateButtonState();
    return;
  }
  showFileInfo(file);
  parseExcel(file);
});

// continuar: guardamos y vamos a la siguiente vista
btnContinuar.addEventListener('click', () => {
  const empresa = inpEmpresa.value.trim();
  const file    = inpExcel.files?.[0];
  if(!empresa || !file) return;

  localStorage.setItem('empresaTitulo', empresa);
  localStorage.setItem('hojaRutaNombre', file.name);

  window.location.href = 'index.html'; // o la vista que quieras abrir
});
