import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import twilio from "twilio";
import { Parser } from "@json2csv/plainjs";
import axios from "axios";

dotenv.config();

// Fix __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Twilio WhatsApp
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
const TWILIO_WHATSAPP_TO = "whatsapp:+5214381318237";

// Para recibir JSON
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch(err => console.log("Error Mongo:", err));

// Schemas
const Registro = mongoose.model("Registro", new mongoose.Schema({
  suelo: Number,
  agua: Number,
  temp: Number,
  hum: Number,
  fecha: { type: Date, default: Date.now }
}));

const Email = mongoose.model("Email", new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  fecha: { type: Date, default: Date.now }
}));

const Telegram = mongoose.model("Telegram", new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  fecha: { type: Date, default: Date.now }
}));

// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Registrar Email
app.post("/api/setEmail", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ ok: false, msg: "Email requerido" });

    const existe = await Email.findOne({ email });
    if (existe) return res.json({ ok: false, msg: "Email ya registrado" });

    await Email.create({ email });
    res.json({ ok: true, msg: "Email registrado correctamente" });
  } catch (err) {
    res.status(500).json({ ok: false, msg: "Error al registrar email", err: String(err) });
  }
});

// Webhook de Telegram
app.post(`/webhook/telegram`, async (req, res) => {
  try {
    const message = req.body.message;
    if (!message) return res.sendStatus(200);

    const chatId = message.chat.id.toString();
    const text = message.text?.toLowerCase() || "";

    // Registrar automáticamente al usuario
    const existe = await Telegram.findOne({ chatId });
    if (!existe) {
      await Telegram.create({ chatId });
      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "Has sido registrado para recibir alertas del sistema de riego 🌱💧"
      });
    }

    // Comando /start
    if (text === "/start") {
      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "Bot activo. Recibirás las alertas aquí 🚨"
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.log("Error webhook:", err);
    res.sendStatus(200);
  }
});

// Recibir datos del ESP32
app.post("/api/datos", async (req, res) => {
  try {
    const { suelo, agua, temp, hum } = req.body;
    if ([suelo, agua, temp, hum].includes(undefined))
      return res.status(400).json({ ok: false, msg: "Faltan datos" });

    await Registro.create({ suelo, agua, temp, hum });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Últimos registros
app.get("/api/ultimos", async (req, res) => {
  try {
    const registros = await Registro.find().sort({ fecha: -1 }).limit(10);
    res.json(registros);
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Export JSON
app.get("/api/export", async (req, res) => {
  try {
    const registros = await Registro.find().sort({ fecha: -1 });
    res.json(registros);
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Export CSV
app.get("/api/export/csv", async (req, res) => {
  try {
    const registros = await Registro.find().sort({ fecha: -1 });
    const fields = ["suelo", "agua", "temp", "hum", "fecha"];
    const parser = new Parser({ fields });
    const csv = parser.parse(registros);

    res.header("Content-Type", "text/csv");
    res.attachment("datos_sistema_riego.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Alertas
app.post("/api/alertas", async (req, res) => {
  try {
    const { tipo } = req.body;
    let mensaje = "";

    if (tipo === "suelo_y_agua_bajo") mensaje = "⚠ Suelo seco + tanque bajo.";
    else if (tipo === "nivel_agua_bajo") mensaje = "⚠ Nivel de agua bajo.";
    else if (tipo === "suelo_seco") mensaje = "⚠ El suelo está seco.";
    else mensaje = "⚠ Alerta desconocida";

    // Emails
    const emails = await Email.find();
    if (emails.length) {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        bcc: emails.map(e => e.email),
        subject: "ALERTA SISTEMA DE RIEGO",
        text: mensaje
      });
    }

    // WhatsApp
    await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to: TWILIO_WHATSAPP_TO,
      body: mensaje
    });

    // Telegram
    const usuarios = await Telegram.find();
    for (const u of usuarios) {
      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: u.chatId,
        text: mensaje
      });
    }

    res.json({ ok: true, msg: "Alertas enviadas" });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Status
app.get("/api/status", async (req, res) => {
  try {
    const last = await Registro.findOne().sort({ fecha: -1 });
    res.json({
      ok: true,
      mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      lastRegistro: last
    });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor corriendo en puerto", PORT));


