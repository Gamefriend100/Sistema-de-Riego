import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";

dotenv.config();
const app = express();

// Necesario para servir el index.html
const __dirname = path.resolve();

// Middlewares
app.use(cors());
app.use(express.json());

// --------------------------------------------------
// SERVIR ARCHIVOS ESTÁTICOS (HTML, CSS, JS)
// --------------------------------------------------
app.use(express.static("public"));

// Ruta raíz -> entrega index.html del folder public
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// --------------------------------------------------
// CONEXIÓN A MONGO
// --------------------------------------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch(err => console.log("Error Mongo:", err));

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
const EmailSchema = new mongoose.Schema({ email: String });

const Registro = mongoose.model("Registro", RegistroSchema);
const Email = mongoose.model("Email", EmailSchema);

// --------------------------------------------------
// REGISTRAR EMAIL
// --------------------------------------------------
app.post("/api/registrar-email", async (req, res) => {
  if (!req.body.email) return res.json({ ok: false, msg: "Email requerido" });
  await Email.create({ email: req.body.email });
  res.json({ ok: true, msg: "Email registrado correctamente" });
});

// --------------------------------------------------
// RECIBIR DATOS DEL ESP32
// --------------------------------------------------
app.post("/api/datos", async (req, res) => {
  try {
    await Registro.create(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
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

  try {
    const emails = await Email.find();
    if (emails.length === 0) return res.json({ ok: true, msg: "No hay emails registrados" });

    const lista = emails.map(e => e.email);
    let mensaje = "";

    if (tipo === "suelo_y_agua_bajo")
      mensaje = "El suelo está seco y el nivel de agua es demasiado bajo. Rellena el tanque.";
    else if (tipo === "nivel_agua_bajo")
      mensaje = "El nivel de agua del depósito está por debajo del 25%. Rellénalo.";
    else if (tipo === "suelo_seco")
      mensaje = "El suelo está seco (menos de 25%). Se activará la bomba.";
    else
      mensaje = "Alerta desconocida: " + tipo;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      bcc: lista,
      subject: "⚠ ALERTA – SISTEMA DE RIEGO",
      text: mensaje
    });

    res.json({ ok: true, msg: "Alertas enviadas" });
  } catch (err) {
    res.status(500).json({ ok: false, err: String(err) });
  }
});

// --------------------------------------------------
// STATUS DEBUG
// --------------------------------------------------
app.get("/api/status", async (req, res) => {
  const last = await Registro.findOne().sort({ fecha: -1 });
  res.json({
    ok: true,
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    lastRegistro: last ?? null
  });
});

// --------------------------------------------------
// INICIAR SERVIDOR
// --------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor encendido en puerto", PORT));

