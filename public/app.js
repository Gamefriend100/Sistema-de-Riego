const API = "https://sistema-de-riego-w2uh.onrender.com";

window.onload = function() {
  // ---------- 🔹 GAUGES ----------
  let gSuelo, gAgua, gTemp, gHum;

  function initGauges() {
    gSuelo = new JustGage({
      id: "gauge_suelo",
      value: 0,
      min: 0,
      max: 100,
      title: "Humedad Suelo",
      label: "%",
      levelColors: ["#ff4d4d","#f9c802","#00ff88"],
      donut: true,
      counter: true,
      decimals: 1,
      gaugeWidthScale: 0.6,
      hideInnerShadow: true
    });

    gAgua = new JustGage({
      id: "gauge_agua",
      value: 0,
      min: 0,
      max: 100,
      title: "Nivel Agua",
      label: "%",
      levelColors: ["#ff4d4d","#f9c802","#00bfff"],
      donut: true,
      counter: true,
      decimals: 1,
      gaugeWidthScale: 0.6,
      hideInnerShadow: true
    });

    gTemp = new JustGage({
      id: "gauge_temp",
      value: 0,
      min: 0,
      max: 60,
      title: "Temperatura",
      label: "°C",
      levelColors: ["#00bfff","#f9c802","#ff4d4d"],
      donut: true,
      counter: true,
      decimals: 1,
      gaugeWidthScale: 0.6,
      hideInnerShadow: true
    });

    gHum = new JustGage({
      id: "gauge_hum",
      value: 0,
      min: 0,
      max: 100,
      title: "Humedad Aire",
      label: "%",
      levelColors: ["#ff4d4d","#f9c802","#00ff88"],
      donut: true,
      counter: true,
      decimals: 1,
      gaugeWidthScale: 0.6,
      hideInnerShadow: true
    });
  }

  function actualizarGauges(suelo, agua, temp, hum) {
    gSuelo.refresh(Number(suelo) || 0);
    gAgua.refresh(Number(agua) || 0);
    gTemp.refresh(Number(temp) || 0);
    gHum.refresh(Number(hum) || 0);
  }

  // ---------- 🔹 ACTUALIZAR DATOS ----------
  async function actualizar() {
    try {
      const res = await fetch(`${API}/api/ultimos`);
      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        document.getElementById("tabla").innerHTML = `
          <tr><td colspan="5" style="text-align:center;">No hay registros</td></tr>`;
        actualizarGauges(0, 0, 0, 0);
        return;
      }

      const ultimo = data[0];
      actualizarGauges(ultimo.suelo, ultimo.agua, ultimo.temp, ultimo.hum);

      const html = data.map(r => `
        <tr>
          <td>${r.suelo ?? 0}%</td>
          <td>${r.agua ?? 0}%</td>
          <td>${r.temp ?? 0}°C</td>
          <td>${r.hum ?? 0}%</td>
          <td>${new Date(r.fecha).toLocaleString()}</td>
        </tr>
      `).join("");

      document.getElementById("tabla").innerHTML = html;

    } catch (e) {
      console.error("Error al actualizar:", e);
      document.getElementById("tabla").innerHTML = `
        <tr><td colspan="5" style="text-align:center;color:red;">
          Error al conectar con la API
        </td></tr>`;
      actualizarGauges(0, 0, 0, 0);
    }
  }

  // ---------- 🔹 EXPORTACIONES ----------
  function exportCSV() {
    window.location.href = `${API}/api/export/csv`;
  }

  function exportPorPeriodo() {
    const inicio = document.getElementById("fechaInicio").value;
    const fin = document.getElementById("fechaFin").value;

    if (!inicio || !fin) {
      alert("Seleccione ambas fechas");
      return;
    }

    // Convertir yyyy-mm-dd → dd/mm/yyyy
    const convert = d => {
      const [y, m, d2] = d.split("-");
      return `${d2}/${m}/${y}`;
    };

    const ini = convert(inicio);
    const fi = convert(fin);

    // Descargar CSV filtrado por periodo directamente desde backend
    window.location.href = `${API}/api/export/csv/periodo?inicio=${ini}&fin=${fi}`;
  }

  // ---------- 🔹 CREAR BOTONES DINÁMICOS ----------
  const cont = document.createElement("div");
  cont.style.textAlign = "center";
  cont.style.margin = "1rem";
  cont.innerHTML = `
    <label>Inicio:</label>
    <input type="date" id="fechaInicio" style="margin:0 .5rem">
    <label>Fin:</label>
    <input type="date" id="fechaFin" style="margin:0 .5rem">
    <button id="btnExportPeriodo" style="margin-left:1rem;padding:.5rem 1rem;">
      Exportar CSV por periodo
    </button>
  `;
  document.body.insertBefore(cont, document.getElementById("registro"));

  document.getElementById("btnExportPeriodo").onclick = exportPorPeriodo;

  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Exportar CSV completo";
  exportBtn.style.display = "block";
  exportBtn.style.margin = "1rem auto";
  exportBtn.style.padding = "0.5rem 1rem";
  exportBtn.style.fontSize = "1rem";
  exportBtn.onclick = exportCSV;
  document.body.insertBefore(exportBtn, document.getElementById("registro").nextSibling);

  // ---------- 🔹 INICIALIZAR ----------
  initGauges();
  actualizar();
  setInterval(actualizar, 3000);
};







