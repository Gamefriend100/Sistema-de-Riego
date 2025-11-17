require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Data = require('./models/Data');

const app = express();
app.use(express.json());
app.use(cors());

// Render usa variables de entorno del panel — no requiere .env local
const mongoUri = process.env.MONGO_URI;

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => {
    console.error("❌ Error conectando a MongoDB:", err);
  });

// Endpoints
app.post('/esp32/data', async (req, res) => {
  try {
    const nuevo = new Data(req.body);
    await nuevo.save();
    res.json({ mensaje: 'Datos guardados' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/datos', async (req, res) => {
  try {
    const datos = await Data.find().sort({ fecha: -1 }).limit(100);
    res.json(datos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Servidor escuchando en puerto ${port}`));
