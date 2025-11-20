const API = "https://sistema-de-riego-w2uh.onrender.com";

// Inicializar gauges
let gSuelo, gAgua, gTemp, gHum;

function initGauges() {
  gSuelo = new JustGage({
    id: "gauge_suelo", value:0, min:0, max:100, title:"Humedad Suelo",
    levelColors:["#ff4d4d","#f9c802","#00ff88"], donut:true, counter:true, gaugeWidthScale:0.6, hideInnerShadow:true
  });
  gAgua = new JustGage({
    id: "gauge_agua", value:0, min:0, max:100, title:"Nivel Agua",
    levelColors:["#ff4d4d","#f9c802","#00bfff"], donut:true, counter:true, gaugeWidthScale:0.6, hideInnerShadow:true
  });
  gTemp = new JustGage({
    id: "gauge_temp", value:0, min:0, max:60, title:"Temperatura",
    levelColors:["#00bfff","#f9c802","#ff4d4d"], donut:true, counter:true, gaugeWidthScale:0.6, hideInnerShadow:true
  });
  gHum = new JustGage({
    id: "gauge_hum", value:0, min:0, max:100, title:"Humedad Aire",
    levelColors:["#ff4d4d","#f9c802","#00ff88"], donut:true, counter:true, gaugeWidthScale:0.6, hideInnerShadow:true
  });
}

// Refrescar gauges
function actualizarGauges(suelo, agua, temp, hum){
  gSuelo.refresh(suelo);
  gAgua.refresh(agua);
  gTemp.refresh(temp);
  gHum.refresh(hum);
}

// Refrescar tabla y gauges
async function actualizar() {
  try {
    const res = await fetch(`${API}/api/ultimos`);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      document.getElementById("tabla").innerHTML = `
        <tr><td colspan="5" style="text-align:center;">No hay registros</td></tr>`;
      return;
    }

    // Actualizar gauges con el registro más reciente
    const ultimo = data[0];
    actualizarGauges(ultimo.suelo, ultimo.agua, ultimo.temp, ultimo.hum);

    // Construir tabla con los 10 últimos registros
    let html = "";
    data.forEach(r => {
      html += `<tr>
        <td>${r.suelo}%</td>
        <td>${r.agua}%</td>
        <td>${r.temp}°C</td>
        <td>${r.hum}%</td>
        <td>${new Date(r.fecha).toLocaleString()}</td>
      </tr>`;
    });
    document.getElementById("tabla").innerHTML = html;

  } catch (e) {
    console.error("Error al actualizar:", e);
    document.getElementById("tabla").innerHTML = `
      <tr><td colspan="5" style="text-align:center;color:red;">
        Error al conectar con la API
      </td></tr>`;
  }
}

// Inicializar
initGauges();
actualizar();
setInterval(actualizar, 3000);

