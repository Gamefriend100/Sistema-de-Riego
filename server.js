import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";

dotenv.config();
const app = express();
const __dirname = path.resolve();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // Servir carpeta public

// Servir index.html en la raíz
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch(err => console.log("Error Mongo:", err));

// Schemas
const RegistroSchema = new mongoose.Schema({
  suelo: { type: Number, required: true },
  agua: { type: Number, required: true },
  temp: { type: Number, required: true },
  hum: { type: Number, required: true },
  fecha: { type: Date, default: Date.now }
});

const EmailSchema = new mongoose.Schema({ email: { type: String, unique: true } });

const Registro = mongoose.model("Registro", RegistroSchema);
const Email = mongoose.model("Email", EmailSchema);

// Registrar email
app.post("/api/registrar-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ ok: false, msg: "Email requerido" });

    const existe = await Email.findOne({ email });
    if (existe) return res.json({ ok: false, msg: "Email ya registrado" });

    await Email.create({ email });
    res.json({ ok: true, msg: "Email registrado correctamente" });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Recibir datos ESP32
app.post("/api/datos", async (req, res) => {
  try {
    const { suelo, agua, temp, hum } = req.body;

    if ([suelo, agua, temp, hum].some(v => v === undefined)) {
      return res.status(400).json({ ok: false, msg: "Faltan datos" });
    }

    await Registro.create({ suelo, agua, temp, hum });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Últimos 10 registros
app.get("/api/ultimos", async (req, res) => {
  try {
    const registros = await Registro.find().sort({ fecha: -1 }).limit(10);
    res.json(registros);
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Alertas por correo
app.post("/api/alertas", async (req, res) => {
  try {
    const { tipo } = req.body;
    const emails = await Email.find();
    if (!emails.length) return res.json({ ok: true, msg: "No hay emails registrados" });

    const lista = emails.map(e => e.email);
    let mensaje = "";

    if (tipo === "suelo_y_agua_bajo") mensaje = "⚠ El suelo está seco y el tanque de agua bajo. Rellena el depósito.";
    else if (tipo === "nivel_agua_bajo") mensaje = "⚠ Nivel de agua del depósito <25%. Rellénalo.";
    else if (tipo === "suelo_seco") mensaje = "⚠ Suelo seco (<25%). La bomba se activará.";
    else mensaje = "⚠ Alerta desconocida: " + tipo;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      bcc: lista,
      subject: "ALERTA SISTEMA DE RIEGO",
      text: mensaje
    });

    res.json({ ok: true, msg: "Alertas enviadas" });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Status debug
app.get("/api/status", async (req, res) => {
  try {
    const last = await Registro.findOne().sort({ fecha: -1 });
    res.json({
      ok: true,
      mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      lastRegistro: last ?? null
    });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor encendido en puerto", PORT));


