import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import twilio from "twilio";
import { Parser } from "@json2csv/plainjs"; // CORRECTO para ES Modules

dotenv.config();

// Fix para __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Twilio WhatsApp
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

// Registrar Telegram
app.post("/api/setTelegram", async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ ok:false, msg:"Chat ID requerido" });

    const existe = await Telegram.findOne({ chatId });
    if (existe) return res.json({ ok:false, msg:"Telegram ya registrado" });

    await Telegram.create({ chatId });
    res.json({ ok:true, msg:"Telegram registrado correctamente" });
  } catch(err){
    res.status(500).json({ ok:false, msg:"Error al registrar Telegram", err:String(err) });
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

// Últimos registros
app.get("/api/ultimos", async (req,res)=>{
  try {
    const registros = await Registro.find().sort({ fecha:-1 }).limit(10);
    res.json(registros);
  } catch(err){
    res.status(500).json({ ok:false, err:String(err) });
  }
});

// Exportar todos los registros en JSON
app.get("/api/export", async (req,res)=>{
  try {
    const registros = await Registro.find().sort({ fecha:-1 });
    res.json(registros);
  } catch(err){
    res.status(500).json({ ok:false, err:String(err) });
  }
});

// Exportar todos los registros en CSV
app.get("/api/export/csv", async (req,res)=>{
  try {
    const registros = await Registro.find().sort({ fecha:-1 });
    const fields = ["suelo","agua","temp","hum","fecha"];
    const parser = new Parser({ fields });
    const csv = parser.parse(registros);

    res.header("Content-Type","text/csv");
    res.attachment("datos_sistema_riego.csv");
    return res.send(csv);
  } catch(err){
    res.status(500).json({ ok:false, err:String(err) });
  }
});

// Enviar alertas por correo y WhatsApp
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
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: { rejectUnauthorized: false }
      });

      transporter.verify((error, success) => {
        if(error) console.log("Error Nodemailer:", error);
        else console.log("Servidor de correo listo:", success);
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        bcc: lista,
        subject: "ALERTA SISTEMA DE RIEGO",
        text: mensaje
      });
    }

    // WhatsApp
    console.log("Twilio enviando alerta...");
    await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to: TWILIO_WHATSAPP_TO,
      body: mensaje
    });

    res.json({ ok:true, msg:"Alertas enviadas" });
  } catch(err){
    console.log("ERROR ALERTAS:", err);
    res.status(500).json({ ok:false, err:String(err) });
  }
});

// Endpoint para probar SMTP Gmail
app.get("/api/test-smtp", async (req, res) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: { rejectUnauthorized: false }
    });

    transporter.verify((error, success) => {
      if(error){
        console.log("Error SMTP:", error);
        return res.status(500).json({ ok:false, msg:"Error al conectar con SMTP", error: String(error) });
      } else {
        console.log("SMTP Gmail listo:", success);
        return res.json({ ok:true, msg:"Conexión SMTP correcta con Gmail" });
      }
    });

  } catch(err){
    console.log("ERROR TEST SMTP:", err);
    res.status(500).json({ ok:false, msg:"Error interno al probar SMTP", error: String(err) });
  }
});

// Status
app.get("/api/status", async (req,res)=>{
  try {
    const last = await Registro.findOne().sort({ fecha:-1 });
    res.json({
      ok:true,
      mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      lastRegistro: last
    });
  } catch(err){
    res.status(500).json({ ok:false, err:String(err) });
  }
});

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Servidor corriendo en puerto", PORT));



