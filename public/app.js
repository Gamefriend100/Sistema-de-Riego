const API = ""; // ruta relativa

// Gauges
google.charts.load("current", { packages: ["gauge"] });
google.charts.setOnLoadCallback(initGauges);

let dataSuelo, dataAgua, dataTemp, dataHum;
let chartSuelo, chartAgua, chartTemp, chartHum;

function initGauges() {
  dataSuelo = google.visualization.arrayToDataTable([["Label","Value"],["Suelo",0]]);
  dataAgua  = google.visualization.arrayToDataTable([["Label","Value"],["Agua",0]]);
  dataTemp  = google.visualization.arrayToDataTable([["Label","Value"],["Temp",0]]);
  dataHum   = google.visualization.arrayToDataTable([["Label","Value"],["Hum",0]]);

  const optPercent = { min:0, max:100, width:150, height:150 };
  const optTemp    = { min:0, max:60, width:150, height:150 };

  chartSuelo = new google.visualization.Gauge(document.getElementById("gauge_suelo"));
  chartAgua  = new google.visualization.Gauge(document.getElementById("gauge_agua"));
  chartTemp  = new google.visualization.Gauge(document.getElementById("gauge_temp"));
  chartHum   = new google.visualization.Gauge(document.getElementById("gauge_hum"));

  chartSuelo.draw(dataSuelo,optPercent);
  chartAgua.draw(dataAgua,optPercent);
  chartTemp.draw(dataTemp,optTemp);
  chartHum.draw(dataHum,optPercent);
}

function actualizarGauges(suelo, agua, temp, hum){
  dataSuelo.setValue(0,1,suelo);
  dataAgua.setValue(0,1,agua);
  dataTemp.setValue(0,1,temp);
  dataHum.setValue(0,1,hum);

  chartSuelo.draw(dataSuelo);
  chartAgua.draw(dataAgua);
  chartTemp.draw(dataTemp);
  chartHum.draw(dataHum);
}

async function actualizar(){
  try{
    const res = await fetch(`${API}/api/ultimos`);
    const data = await res.json();

    if(!Array.isArray(data) || data.length===0){
      document.getElementById("tabla").innerHTML = `<tr><td colspan="5" style="text-align:center;">No hay registros</td></tr>`;
      return;
    }

    const u = data[0];
    actualizarGauges(u.suelo,u.agua,u.temp,u.hum);

    let html="";
    data.forEach(r=>{
      html+=`<tr>
        <td>${r.suelo}%</td>
        <td>${r.agua}%</td>
        <td>${r.temp}°C</td>
        <td>${r.hum}%</td>
        <td>${new Date(r.fecha).toLocaleString()}</td>
      </tr>`;
    });
    document.getElementById("tabla").innerHTML = html;

  }catch(e){ console.error(e); }
}

setInterval(actualizar,3000);
actualizar();
