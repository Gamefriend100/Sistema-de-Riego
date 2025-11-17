require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const ExcelJS = require("exceljs");
const { Parser } = require("json2csv");

// Modelo de datos
const DataSchema = new mongoose.Schema({
  humedad: Number,
  temperatura: Number,
  nivelAgua: Number,
  fecha: { type: Date, default: Date.now }
});
const Data = mongoose.model("Data", DataSchema);

const app = express();
app.use(cors());
app.use(express.json());

// Servir frontend
app.use(express.static(path.join(__dirname, "frontend")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// Conectar a MongoDB
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("⚠️  No se ha definido MONGO_URI en .env");
  process.exit(1);
}

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => {
    console.error("Error conectando a MongoDB:", err);
    process.exit(1);
  });

// Ruta para recibir datos del ESP32
app.post("/esp32/data", async (req, res) => {
  try {
    const { humedad, temperatura, nivelAgua } = req.body;
    const nuevo = new Data({ humedad, temperatura, nivelAgua });
    await nuevo.save();
    res.json({ mensaje: "Datos guardados" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Ruta para consultar datos
app.get("/datos", async (req, res) => {
  try {
    const datos = await Data.find().sort({ fecha: -1 }).limit(100);
    res.json(datos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exportar Excel
app.get("/export/excel", async (req, res) => {
  try {
    const datos = await Data.find().sort({ fecha: -1 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Datos ESP32");

    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 25 },
      { header: "Humedad", key: "humedad", width: 10 },
      { header: "Temperatura", key: "temperatura", width: 15 },
      { header: "Nivel de Agua", key: "nivelAgua", width: 15 }
    ];

    datos.forEach(d => sheet.addRow(d.toObject()));

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

// Exportar CSV
app.get("/export/csv", async (req, res) => {
  try {
    const datos = await Data.find().sort({ fecha: -1 });
    const parser = new Parser({ fields: ["fecha", "humedad", "temperatura", "nivelAgua"] });
    const csv = parser.parse(datos);

    res.header("Content-Type", "text/csv");
    res.attachment("datos_esp32.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Iniciar servidor
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor escuchando en puerto ${port}`));


