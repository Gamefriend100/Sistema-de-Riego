const API = "https://sistema-de-riego-w2uh.onrender.com";

async function actualizar() {
  try {
    // Últimos registros
    const data = await fetch(API + "/api/ultimos").then(r => r.json());

    if (data.length > 0) {
      const ultimo = data[0];

      document.getElementById("suelo").textContent = ultimo.suelo + "%";
      document.getElementById("agua").textContent = ultimo.agua + "%";
      document.getElementById("temp").textContent = ultimo.temp + "°C";
      document.getElementById("hum").textContent = ultimo.hum + "%";
    }

    // Construir tabla
    let html = "";
    data.forEach(r => {
      html += `
      <tr>
        <td>${r.suelo}%</td>
        <td>${r.agua}%</td>
        <td>${r.temp}°C</td>
        <td>${r.hum}%</td>
        <td>${new Date(r.fecha).toLocaleString()}</td>
      </tr>`;
    });

    document.getElementById("tabla").innerHTML = html;
  } catch (error) {
    console.log("Error actualizando:", error);
  }
}

setInterval(actualizar, 3000);
actualizar();
