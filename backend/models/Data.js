const mongoose = require("mongoose");

const DataSchema = new mongoose.Schema({
  humedad: Number,         // Humedad del suelo
  temperatura: Number,     // Temperatura del DHT
  humedadSensor: Number,   // Humedad del DHT
  nivelAgua: Number,       // Nivel de agua
  fecha: { type: String }  // <-- Guardar fecha EXACTA del ESP32 (ISO)
});

module.exports = mongoose.model("Data", DataSchema);
