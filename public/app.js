const API = "https://sistema-de-riego-w2uh.onrender.com";

async function actualizar() {
  try {
    // Obtener últimos registros
    const res = await fetch(`${API}/api/ultimos`);
    const data = await res.json();

    // Si la API devolvió error
    if (!Array.isArray(data)) {
      console.warn("Respuesta inesperada:", data);
      return;
    }

    // Si hay al menos un registro
    if (data.length > 0) {
      const ultimo = data[0];

      document.getElementById("suelo").textContent = (ultimo.suelo ?? 0) + "%";
      document.getElementById("agua").textContent = (ultimo.agua ?? 0) + "%";
      document.getElementById("temp").textContent = (ultimo.temp ?? 0) + "°C";
      document.getElementById("hum").textContent = (ultimo.hum ?? 0) + "%";
    } else {
      // Si no hay registros
      document.getElementById("suelo").textContent = "--";
      document.getElementById("agua").textContent = "--";
      document.getElementById("temp").textContent = "--";
      document.getElementById("hum").textContent = "--";
    }

    // Construir tabla
    let html = "";

    if (data.length === 0) {
      html = `
        <tr>
          <td colspan="5" style="text-align:center; color:#888;">
            No hay registros disponibles aún
          </td>
        </tr>
      `;
    } else {
      data.forEach(r => {
        html += `
        <tr>
          <td>${r.suelo}%</td>
          <td>${r.agua}%</td>
          <td>${r.temp}°C</td>
          <td>${r.hum}%</td>
          <td>${new Date(r.fecha).toLocaleString()}</td>
        </tr>
        `;
      });
    }

    document.getElementById("tabla").innerHTML = html;

  } catch (error) {
    console.log("Error actualizando:", error);

    // Mostrar datos de error en pantalla
    document.getElementById("suelo").textContent = "ERR";
    document.getElementById("agua").textContent = "ERR";
    document.getElementById("temp").textContent = "ERR";
    document.getElementById("hum").textContent = "ERR";

    document.getElementById("tabla").innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:red;">
          Error al conectar con la API
        </td>
      </tr>
    `;
  }
}

// Actualizar cada 3 segundos
setInterval(actualizar, 3000);
actualizar();
