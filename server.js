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

// ----------------- FIX __dirname -----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------- TWILIO -----------------
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
const TWILIO_WHATSAPP_TO = "whatsapp:+5214381318237";

// ----------------- MONGO -----------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch(err => console.log("Error Mongo:", err));

// ----------------- SCHEMAS -----------------
const RegistroSchema = new mongoose.Schema({
  suelo: Number,
  agua: Number,
  temp: Number,
  hum: Number,
  fecha: { type: Date, default: Date.now }
});

const EmailSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  fecha: { type: Date, default: Date.now }
});

const TelegramSchema = new mongoose.Schema({
  chatId: { type: String, unique: true },
  fecha: { type: Date, default: Date.now }
});

const Registro = mongoose.model("Registro", RegistroSchema);
const Email = mongoose.model("Email", EmailSchema);
const Telegram = mongoose.model("Telegram", TelegramSchema);

// ----------------- ENVIAR MENSAJE TELEGRAM -----------------
async function enviarTelegram(mensaje) {
  const token = process.env.TELEGRAM_TOKEN;
  const chats = await Telegram.find();

  for (const c of chats) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: c.chatId,
          text: mensaje,
          parse_mode: "HTML"
        })
      });

      console.log(`Telegram enviado a ${c.chatId}`);
    } catch (err) {
      console.error("Error enviando Telegram:", err);
    }
  }
}

// ----------------- TELEGRAM LONG POLLING -----------------
async function telegramLongPolling() {
  const token = process.env.TELEGRAM_TOKEN;
  let offset = 0;

  console.log("📡 Long Polling Telegram iniciado...");

  while (true) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=20`
      );

      const data = await res.json();

      if (!data || !Array.isArray(data.result)) {
        console.log("Sin mensajes nuevos...");
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      if (data.result.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          if (!update.message) continue;

          const chatId = update.message.chat.id.toString();
          const texto = update.message.text || "";

          let existe = await Telegram.findOne({ chatId });

          if (!existe) {
            await Telegram.create({ chatId });
            console.log(`🆕 Nuevo usuario Telegram: ${chatId}`);
            await enviarTelegram("🌱 Te has suscrito a las alertas del sistema de riego.");
          }

          if (texto === "/start") {
            await enviarTelegram("✔ Ya estás registrado para recibir alertas.");
          }
        }
      }
    } catch (err) {
      console.error("Error Long Polling:", err);
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}

// Iniciar long polling
telegramLongPolling();

// ----------------- STATIC -----------------
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ----------------- EMAILS -----------------
app.post("/api/setEmail", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ ok: false, msg: "Email requerido" });

    const existe = await Email.findOne({ email });
    if (existe) return res.json({ ok: false, msg: "Email ya registrado" });

    await Email.create({ email });
    res.json({ ok: true, msg: "Email registrado" });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// ----------------- RECIBIR DATOS ESP32 -----------------
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

// ----------------- ULTIMOS REGISTROS -----------------
app.get("/api/ultimos", async (req, res) => {
  const registros = await Registro.find().sort({ fecha: -1 }).limit(10);
  res.json(registros);
});

// ----------------- EXPORT JSON -----------------
app.get("/api/export", async (req, res) => {
  const registros = await Registro.find().sort({ fecha: -1 });
  res.json(registros);
});

// ----------------- EXPORT JSON POR PERIODO -----------------
app.get("/api/export/periodo", async (req, res) => {
  try {
    const { inicio, fin } = req.query;
    if (!inicio || !fin)
      return res.status(400).json({ ok: false, msg: "Debe enviar inicio y fin en formato dd/mm/aaaa" });

    const [di, mi, yi] = inicio.split("/");
    const [df, mf, yf] = fin.split("/");

    const fechaInicio = new Date(`${yi}-${mi}-${di}T00:00:00`);
    const fechaFin = new Date(`${yf}-${mf}-${df}T23:59:59`);

    const registros = await Registro.find({
      fecha: { $gte: fechaInicio, $lte: fechaFin }
    }).sort({ fecha: -1 });

    res.json(registros);

  } catch (err) {
    console.error("Error exportando por periodo:", err);
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// ----------------- EXPORT CSV -----------------
app.get("/api/export/csv", async (req, res) => {
  try {
    const registros = await Registro.find().sort({ fecha: -1 });
    const parser = new Parser({ fields: ["suelo", "agua", "temp", "hum", "fecha"] });
    const csv = parser.parse(registros);

    res.header("Content-Type", "text/csv");
    res.attachment("datos_sistema_riego.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// ----------------- EXPORT CSV POR PERIODO -----------------
app.get("/api/export/csv/periodo", async (req, res) => {
  try {
    const { inicio, fin } = req.query;
    if (!inicio || !fin)
      return res.status(400).json({ ok: false, msg: "Debe enviar inicio y fin en formato dd/mm/aaaa" });

    const [di, mi, yi] = inicio.split("/");
    const [df, mf, yf] = fin.split("/");

    const fechaInicio = new Date(`${yi}-${mi}-${di}T00:00:00`);
    const fechaFin = new Date(`${yf}-${mf}-${df}T23:59:59`);

    const registros = await Registro.find({
      fecha: { $gte: fechaInicio, $lte: fechaFin }
    }).sort({ fecha: -1 });

    const parser = new Parser({ fields: ["suelo", "agua", "temp", "hum", "fecha"] });
    const csv = parser.parse(registros);

    res.header("Content-Type", "text/csv");
    res.attachment(`export_${inicio}_al_${fin}.csv`);
    res.send(csv);

  } catch (err) {
    console.error("Error exportando CSV por periodo:", err);
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// ----------------- ALERTAS GENERALES -----------------
app.post("/api/alertas", async (req, res) => {
  try {
    const { tipo } = req.body;

    let mensaje = "⚠ Alerta del sistema";
    if (tipo === "suelo_y_agua_bajo") mensaje = "⚠ Suelo seco + tanque bajo.";
    if (tipo === "nivel_agua_bajo") mensaje = "⚠ Nivel de agua bajo.";
    if (tipo === "suelo_seco") mensaje = "⚠ El suelo está seco.";

    // Emails
    const emails = await Email.find();
    if (emails.length > 0) {
      const lista = emails.map(e => e.email);

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
        bcc: lista,
        subject: "Alerta Sistema de Riego",
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
    await enviarTelegram(mensaje);

    res.json({ ok: true, msg: "Alertas enviadas" });
  } catch (err) {
    console.log("ERROR ALERTAS:", err);
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// ----------------- SERVIDOR -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor activo en puerto", PORT));






