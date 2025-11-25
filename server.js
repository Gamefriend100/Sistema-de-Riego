import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import twilio from "twilio";
import { Parser } from "@json2csv/plainjs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Variables de entorno
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
const TWILIO_WHATSAPP_TO = "whatsapp:+5214381318237";

// Middlewares
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Conexión MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch(err => console.log("Error Mongo:", err));

// Schemas
const RegistroSchema = new mongoose.Schema({
  suelo: Number,
  agua: Number,
  temp: Number,
  hum: Number,
  fecha: { type: Date, default: Date.now }
});

const EmailSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  fecha: { type: Date, default: Date.now }
});

const TelegramSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  fecha: { type: Date, default: Date.now }
});

const Registro = mongoose.model("Registro", RegistroSchema);
const Email = mongoose.model("Email", EmailSchema);
const Telegram = mongoose.model("Telegram", TelegramSchema);

// Webhook Telegram
app.post("/webhook/telegram", async (req, res) => {
  try {
    console.log("Webhook recibido:", req.body);
    const update = req.body;

    if (update.message) {
      const chatId = update.message.chat.id.toString();
      const text = update.message.text;

      if (text === "/start") {
        const existe = await Telegram.findOne({ chatId });
        if (!existe) {
          await Telegram.create({ chatId });
          console.log("✅ Nuevo chatId registrado:", chatId);
        }

        // fetch nativo de Node 18+ (Node 25 ya lo tiene)
        const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "✅ Bot activo. Recibirás alertas de riego."
          })
        });
        const jsonResp = await resp.json();
        console.log("Respuesta Telegram:", jsonResp);
      }
    }

    res.status(200).send({ ok: true });
  } catch (err) {
    console.log("Error webhook Telegram:", err);
    res.status(500).send({ ok: false, err: String(err) });
  }
});

// Rutas
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.post("/api/setEmail", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ ok: false, msg: "Email requerido" });
    const existe = await Email.findOne({ email });
    if (existe) return res.json({ ok: false, msg: "Email ya registrado" });
    await Email.create({ email });
    res.json({ ok: true, msg: "Email registrado correctamente" });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

app.get("/api/telegram/list", async (req, res) => {
  try {
    const chats = await Telegram.find().sort({ fecha: -1 });
    res.json({ ok: true, chats });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

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

app.post("/api/alertas", async (req, res) => {
  try {
    const { tipo } = req.body;
    let mensaje = "";
    if (tipo === "suelo_y_agua_bajo") mensaje = "⚠ Suelo seco + tanque bajo.";
    else if (tipo === "nivel_agua_bajo") mensaje = "⚠ Nivel de agua bajo.";
    else if (tipo === "suelo_seco") mensaje = "⚠ El suelo está seco.";
    else mensaje = "⚠ Alerta desconocida";

    // Enviar correos
    const emails = await Email.find();
    if (emails.length) {
      const lista = emails.map(e => e.email);
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        tls: { rejectUnauthorized: false }
      });
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        bcc: lista,
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
    const chats = await Telegram.find();
    for (const chat of chats) {
      const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat.chatId, text: mensaje })
      });
      const jsonResp = await resp.json();
      console.log("Alerta enviada a Telegram:", jsonResp);
    }

    res.json({ ok: true, msg: "Alertas enviadas" });
  } catch (err) {
    console.log("ERROR ALERTAS:", err);
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

// Exportar JSON
app.get("/api/export", async (req, res) => {
  try {
    const registros = await Registro.find().sort({ fecha: -1 });
    res.json(registros);
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Exportar CSV
app.get("/api/export/csv", async (req, res) => {
  try {
    const registros = await Registro.find().sort({ fecha: -1 });
    const fields = ["suelo", "agua", "temp", "hum", "fecha"];
    const parser = new Parser({ fields });
    const csv = parser.parse(registros);
    res.header("Content-Type", "text/csv");
    res.attachment("datos_sistema_riego.csv");
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// Estado del sistema
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

