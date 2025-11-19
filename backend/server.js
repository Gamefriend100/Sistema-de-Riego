require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const ExcelJS = require("exceljs");
const { Parser } = require("json2csv");
const nodemailer = require("nodemailer");

// Modelos
const Data = require("./models/Data");
const UserEmail = require("./models/UserEmail");

const app = express();
app.use(cors());
app.use(express.json());

// Servir frontend si lo agregas después
app.use(express.static(path.join(__dirname, "frontend")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// Conexión a MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.error("Error al conectar Mongo:", err));

// ---------------------
// 🔵 CONFIGURAR ENVÍO DE EMAILS
// ---------------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function enviarCorreo(destinatario, asunto, mensaje) {
  try {
    await transporter.sendMail({
      from: `"Sistema de Riego" <${process.env.EMAIL_USER}>`,
      to: destinatario,
      subject: asunto,
      html: mensaje
    });

    console.log("📩 Correo enviado:", destinatario);
  } catch (err) {
    console.error("Error enviando correo:", err);
  }
}

// ---------------------
// 🔵 RUTA: GUARDAR EMAIL
// ---------------------
app.post("/email/set", async (req, res) => {
  try {
    const { email } = req.body;

    let registro = await UserEmail.findOne();

    if (!registro) {
      registro = new UserEmail({ email });
    } else {
      registro.email = email;
    }

    await registro.save();

    res.json({ mensaje: "Correo guardado", email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener correo actual
app.get("/email/get", async (req, res) => {
  try {
    const registro = await UserEmail.findOne();
    res.json(registro);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------
// 🔵 RUTA: ESP32 ENVÍA DATOS
// ---------------------
app.post("/esp32/data", async (req, res) => {
  try {
    const { humedad, temperatura, humedadSensor, nivelAgua, fecha } = req.body;

    const nuevo = new Data({
      humedad,
      temperatura,
      humedadSensor,
      nivelAgua,
      fecha
    });

    await nuevo.save();

    // Obtener email registrado
    const userEmail = await UserEmail.findOne();

    if (userEmail) {
      // 🔥 Si el nivel de agua baja demasiado
      if (nivelAgua < 20) {
        enviarCorreo(
          userEmail.email,
          "⚠ ALERTA: Nivel de agua bajo",
          `<h2>El tanque está casi vacío</h2>
           <p>Nivel actual: <b>${nivelAgua}%</b></p>
           <p>Rellene el contenedor lo antes posible.</p>`
        );
      }

      // 🔥 Si la humedad del suelo es muy baja
      if (humedad < 25 && nivelAgua > 50) {
        enviarCorreo(
          userEmail.email,
          "🌱 Suelo seco - Regando automáticamente",
          `<h2>La humedad del suelo es baja</h2>
           <p>Humedad: <b>${humedad}%</b></p>
           <p>La bomba se activó automáticamente.</p>`
        );
      }

      // 🔥 Humedad baja y tanque vacío → No regar
      if (humedad < 25 && nivelAgua < 25) {
        enviarCorreo(
          userEmail.email,
          "⛔ No se puede activar la bomba",
          `<h2>Suelo seco PERO sin agua disponible</h2>
           <p>Humedad: <b>${humedad}%</b></p>
           <p>Nivel de agua: <b>${nivelAgua}%</b></p>
           <p>Debe rellenar el tanque.</p>`
        );
      }
    }

    res.json({ mensaje: "Datos guardados correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------
// 🔵 RUTA: CONSULTAR DATOS
// ---------------------
app.get("/datos", async (req, res) => {
  try {
    const datos = await Data.find().sort({ _id: -1 }).limit(100);
    res.json(datos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------
// 🔵 EXPORTAR A EXCEL
// ---------------------
app.get("/export/excel", async (req, res) => {
  try {
    const datos = await Data.find().sort({ _id: -1 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Datos ESP32");

    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 25 },
      { header: "Humedad (%)", key: "humedad", width: 15 },
      { header: "Temperatura (°C)", key: "temperatura", width: 15 },
      { header: "Humedad Sensor (%)", key: "humedadSensor", width: 18 },
      { header: "Nivel de Agua (%)", key: "nivelAgua", width: 15 }
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

// ---------------------
// 🔵 EXPORTAR A CSV
// ---------------------
app.get("/export/csv", async (req, res) => {
  try {
    const datos = await Data.find().sort({ _id: -1 });
    const parser = new Parser({
      fields: ["fecha", "humedad", "temperatura", "humedadSensor", "nivelAgua"]
    });

    const csv = parser.parse(datos);

    res.header("Content-Type", "text/csv");
    res.attachment("datos_esp32.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------
// 🔵 INICIAR SERVIDOR
// ---------------------
app.listen(process.env.PORT, () =>
  console.log(`Servidor escuchando en puerto ${process.env.PORT}`)
);

