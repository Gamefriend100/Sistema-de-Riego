require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Data = require('./models/Data');
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');

const app = express();
app.use(express.json());
app.use(cors());

// -------------------------------
// Conexión a MongoDB
// -------------------------------
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("⚠️ No se ha definido MONGO_URI en .env.");
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => {
    console.error("❌ Error conectando a MongoDB:", err);
    process.exit(1);
  });


// -------------------------------
// Guardar datos desde el ESP32
// -------------------------------
app.post('/esp32/data', async (req, res) => {
  try {
    const nuevo = new Data(req.body);
    await nuevo.save();
    res.json({ mensaje: 'Datos guardados' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// -------------------------------
// Obtener último 100 datos
// -------------------------------
app.get('/datos', async (req, res) => {
  try {
    const datos = await Data.find().sort({ fecha: -1 }).limit(100);
    res.json(datos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// -------------------------------
// EXPORTAR A EXCEL
// -------------------------------
app.get('/export/excel', async (req, res) => {
  try {
    const datos = await Data.find().sort({ fecha: -1 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Datos Sensor');

    sheet.columns = [
      { header: 'Humedad', key: 'humedad', width: 15 },
      { header: 'Fecha', key: 'fecha', width: 25 },
    ];

    datos.forEach(d => {
      sheet.addRow({
        humedad: d.humedad,
        fecha: d.fecha.toLocaleString()
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=datos_esp32.xlsx'
    );

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// -------------------------------
// EXPORTAR A CSV
// -------------------------------
app.get('/export/csv', async (req, res) => {
  try {
    const datos = await Data.find().sort({ fecha: -1 });

    const fields = ['humedad', 'fecha'];
    const parser = new Parser({ fields });
    const csv = parser.parse(datos);

    res.header('Content-Type', 'text/csv');
    res.attachment('datos_esp32.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`🚀 Servidor escuchando en puerto ${port}`)
);

