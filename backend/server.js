import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// --------------------------------------------------
// RUTA RAÍZ (SOLUCIÓN A "Cannot GET /")
// --------------------------------------------------
app.get("/", (req, res) => {
  res.send("Servidor funcionando ✓");
});

// --------------------------------------------------
// CONEXIÓN A MONGODB (TU URL DIRECTA)
// --------------------------------------------------
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB conectado correctamente"))
.catch(err=>console.log("Error MongoDB:", err));

// --------------------------------------------------
// SCHEMAS
// --------------------------------------------------
const RegistroSchema = new mongoose.Schema({
  suelo: Number,
  agua: Number,
  temp: Number,
  hum: Number,
  fecha: { type: Date, default: Date.now }
});

const EmailSchema = new mongoose.Schema({
  email: String
});

const Registro = mongoose.model("Registro", RegistroSchema);
const Email = mongoose.model("Email", EmailSchema);

// --------------------------------------------------
// REGISTRAR CORREO
// --------------------------------------------------
app.post("/api/registrar-email", async(req,res)=>{
  if (!req.body.email) return res.json({ok:false, msg:"Email requerido"});

  await Email.create({email:req.body.email});
  res.json({ok:true, msg:"Correo registrado exitosamente"});
});

// --------------------------------------------------
// RECIBIR DATOS DEL ESP32
// --------------------------------------------------
app.post("/api/datos", async (req, res) => {
  await Registro.create(req.body);
  res.json({ ok: true });
});

// --------------------------------------------------
// OBTENER ÚLTIMOS 10 REGISTROS
// --------------------------------------------------
app.get("/api/ultimos", async (req, res) => {
  const registros = await Registro.find().sort({ fecha: -1 }).limit(10);
  res.json(registros);
});

// --------------------------------------------------
// ENVIAR ALERTAS
// --------------------------------------------------
app.post("/api/alertas", async (req, res) => {
  const tipo = req.body.tipo;

  const emails = await Email.find();
  if (emails.length === 0) return res.json({ ok: true });

  const lista = emails.map(e => e.email);

  let mensaje = "";

  if (tipo === "suelo_y_agua_bajo")
    mensaje = "El suelo está seco y el nivel de agua es demasiado bajo para regar. Rellena el tanque.";
  
  if (tipo === "nivel_agua_bajo")
    mensaje = "El nivel de agua del depósito está por debajo del 25%. Rellénalo.";
  
  if (tipo === "suelo_seco")
    mensaje = "El suelo está seco (menos del 25%). Se activará la bomba.";

  // Configurar correos con tu Gmail
  let transport = nodemailer.createTransport({
    service: "gmail",
    auth: { 
      user: process.env.EMAIL_USER, 
      pass: process.env.EMAIL_PASS 
    }
  });

  await transport.sendMail({
    from: process.env.EMAIL_USER,
    bcc: lista,
    subject: "⚠ ALERTA AUTOMÁTICA – SISTEMA DE RIEGO",
    text: mensaje
  });

  res.json({ ok: true });
});

// --------------------------------------------------
// INICIAR SERVIDOR
// --------------------------------------------------
app.listen(process.env.PORT, ()=>console.log("API funcionando en puerto " + process.env.PORT));
