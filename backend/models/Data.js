const mongoose = require("mongoose");

const DataSchema = new mongoose.Schema({
  humedad: Number,
  temperatura: Number,
  extra: Object,
  fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Data", DataSchema);
