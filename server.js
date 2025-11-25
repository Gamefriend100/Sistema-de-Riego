import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import twilio from "twilio";
import { Parser } from "@json2csv/plainjs";
import fetch from "node-fetch";

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

// Rutas principales
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Registrar Email
app.post("/api/setEmail", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ ok:false, msg:"Email requerido" });
    const existe = await Email.findOne({ email });
    if (existe) return res.json({ ok:false, msg:"Email ya registrado" });
    await Email.create({ email });
    res.json({ ok:true, msg:"Email registrado correctamente" });
  } catch(err){
    res.status(500).json({ ok:false, msg:"Error al registrar email", err:String(err) });
  }
});

// Recibir chatId automático desde webhook de Telegram
app.post(`/webhook/telegram`, async (req, res) => {
  try {
    const update = req.body;
    if (update.message) {
      const chatId = update.message.chat.id.toString();
      const text = update.message.text;

      // Registrar automáticamente el chatId si hace /start
      if(text === "/start") {
        const existe = await Telegram.findOne({ chatId });
        if(!existe) {
          await Telegram.create({ chatId });
          console.log("Nuevo chatId registrado:", chatId);
        }
        // Mensaje de bienvenida
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: "Bot activo. Recibirás alertas de riego." })
        });
      }
    }
    res.sendStatus(200);
  } catch(err) {
    console.log("Error webhook Telegram:", err);
    res.sendStatus(500);
  }
});

// Recibir datos ESP32
app.post("/api/datos", async (req, res) => {
  try {
    const { suelo, agua, temp, hum } = req.body;
    if ([suelo, agua, temp, hum].includes(undefined))
      return res.status(400).json({ ok:false, msg:"Faltan datos" });

    await Registro.create({ suelo, agua, temp, hum });
    res.json({ ok:true });
  } catch(err){
    res.status(500).json({ ok:false, err:String(err) });
  }
});

// Alertas por correo, WhatsApp y Telegram
app.post("/api/alertas", async (req,res)=>{
  try {
    const { tipo } = req.body;
    let mensaje = "";
    if(tipo==="suelo_y_agua_bajo") mensaje="⚠ Suelo seco + tanque bajo.";
    else if(tipo==="nivel_agua_bajo") mensaje="⚠ Nivel de agua bajo.";
    else if(tipo==="suelo_seco") mensaje="⚠ El suelo está seco.";
    else mensaje="⚠ Alerta desconocida";

    // Correos
    const emails = await Email.find();
    if(emails.length){
      const lista = emails.map(e=>e.email);
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
    for(const chat of chats){
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat.chatId, text: mensaje })
      });
    }

    res.json({ ok:true, msg:"Alertas enviadas" });
  } catch(err){
    console.log("ERROR ALERTAS:", err);
    res.status(500).json({ ok:false, err:String(err) });
  }
});

// Resto de endpoints (export, status, etc.) se mantienen igual...
// ...

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Servidor corriendo en puerto", PORT));



