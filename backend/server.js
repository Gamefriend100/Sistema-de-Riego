require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Data = require('./models/Data');

const app = express();
app.use(express.json());
app.use(cors());

// Conexión a MongoDB Atlas usando MONGO_URI en .env
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("⚠️  No se ha definido MONGO_URI en .env. Copia .env.example a .env y edítala.");
  process.exit(1);
}

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB conectado"))
  .catch(err => {
    console.error("Error conectando a MongoDB:", err);
    process.exit(1);
  });

// Endpoints
app.post('/esp32/data', async (req, res) => {
  try {
    const body = req.body;
    const nuevo = new Data(body);
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
app.listen(port, () => console.log(`Servidor escuchando en puerto ${port}`));
