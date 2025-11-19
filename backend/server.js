require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// ===============================
// 🔵 MODELOS
// ===============================
const Data = require("./models/Data"); // Modelo actualizado para 3 sensores + alertas
const UserEmail = require("./models/UserEmail");

// ===============================
// 🔵 CONEXIÓN A MONGO
// ===============================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.error("Error al conectar Mongo:", err));

// ===============================
// 🔵 CONFIGURAR EMAIL
// ===============================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function enviarCorreo(destinatario, asunto, mensaje) {
  try {
    await transporter.sendMail({
      from: `"Sistema de Riego" <${process.env.EMAIL_USER}>`,
      to: destinatario,
      subject: asunto,
      html: mensaje,
    });
    console.log("📩 Correo enviado a:", destinatario);
  } catch (err) {
    console.error("Error enviando correo:", err);
  }
}

// ===============================
// 🔵 GUARDAR EMAIL
// ===============================
app.post("/email/set", async (req, res) => {
  try {
    const { email } = req.body;
    let registro = await UserEmail.findOne();
    if (!registro) registro = new UserEmail({ email });
    else registro.email = email;
    await registro.save();
    res.json({ mensaje: "Correo guardado", email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/email/get", async (req, res) => {
  try {
    const registro = await UserEmail.findOne();
    res.json(registro);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// 🔵 RECIBIR DATOS DEL ESP32
// ===============================
app.post("/esp32/data", async (req, res) => {
  try {
    const {
      humedadSuelo,
      temperatura,
      nivelAgua,
      bombaEncendida,
      alertaAgua,
      alertaCritica,
      fecha
    } = req.body;

    const nuevo = new Data({
      humedadSuelo,
      temperatura,
      nivelAgua,
      bombaEncendida,
      alertaAgua,
      alertaCritica,
      fecha
    });

    await nuevo.save();

    const userEmail = await UserEmail.findOne();
    if (userEmail) {
      if (alertaCritica) {
        enviarCorreo(
          userEmail.email,
          "⛔ ALERTA CRÍTICA - Agua insuficiente",
          `<h2>Suelo seco y nivel de agua crítico</h2>
           <p>Humedad suelo: <b>${humedadSuelo}%</b></p>
           <p>Nivel de agua: <b>${nivelAgua}%</b></p>
           <p>La bomba se bloqueó por seguridad.</p>`
        );
      } else if (alertaAgua) {
        enviarCorreo(
          userEmail.email,
          "⚠ ALERTA - Nivel de agua bajo",
          `<h2>El tanque de agua está bajo</h2>
           <p>Nivel actual: <b>${nivelAgua}%</b></p>`
        );
      }
    }

    res.json({ mensaje: "Datos guardados correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// 🔵 OBTENER DATOS
// ===============================
app.get("/datos", async (req, res) => {
  try {
    const datos = await Data.find().sort({ fecha: -1 }).limit(100);
    res.json(datos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// 🔵 EXPORTAR A EXCEL
// ===============================
const ExcelJS = require("exceljs");
app.get("/export/excel", async (req, res) => {
  try {
    const datos = await Data.find().sort({ fecha: -1 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Datos ESP32");

    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 25 },
      { header: "Humedad Suelo (%)", key: "humedadSuelo", width: 15 },
      { header: "Temperatura (°C)", key: "temperatura", width: 15 },
      { header: "Nivel Agua (%)", key: "nivelAgua", width: 15 },
      { header: "Bomba Encendida", key: "bombaEncendida", width: 15 },
      { header: "Alerta Agua", key: "alertaAgua", width: 12 },
      { header: "Alerta Crítica", key: "alertaCritica", width: 12 },
    ];

    datos.forEach((d) => sheet.addRow(d.toObject()));

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=datos_esp32.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// 🔵 EXPORTAR A CSV
// ===============================
const { Parser } = require("json2csv");
app.get("/export/csv", async (req, res) => {
  try {
    const datos = await Data.find().sort({ fecha: -1 });
    const parser = new Parser({
      fields: [
        "fecha",
        "humedadSuelo",
        "temperatura",
        "nivelAgua",
        "bombaEncendida",
        "alertaAgua",
        "alertaCritica"
      ]
    });
    const csv = parser.parse(datos);
    res.header("Content-Type", "text/csv");
    res.attachment("datos_esp32.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// 🔵 INICIAR SERVIDOR
// ===============================
app.listen(process.env.PORT, () =>
  console.log(`Servidor escuchando en puerto ${process.env.PORT}`)
);
