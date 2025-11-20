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
// RUTA RAÍZ (Render usa esta ruta para verificar que sirve algo)
// --------------------------------------------------
app.get("/", (req, res) => {
  res.status(200).send("API Sistema de Riego funcionando ✔");
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

const EmailSchema = new mongoose.Schema({
  email: String
});

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
// RECIBIR DATOS ESP32
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
    mensaje = "El suelo está seco y el nivel de agua es demasiado bajo. Rellena el tanque.";

  if (tipo === "nivel_agua_bajo")
    mensaje = "El nivel de agua del depósito está bajo. Rellénalo.";

  if (tipo === "suelo_seco")
    mensaje = "El suelo está seco (menos de 25%). Se activará la bomba.";

  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    bcc: lista,
    subject: "⚠ Alerta – Sistema de Riego",
    text: mensaje
  });

  res.json({ ok: true });
});

// --------------------------------------------------
// INICIAR SERVIDOR
// --------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor encendido en puerto", PORT));
