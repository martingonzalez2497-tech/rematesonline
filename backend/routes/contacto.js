const express = require("express");
const { enviarEmail } = require("../email");
const { sanitizarTexto } = require("../sanitizar");

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Formulario de contacto — envía email al admin
router.post("/", async (req, res) => {
  const { nombre, email, mensaje } = req.body;
  if (!nombre || !email || !mensaje) {
    return res.status(400).json({ error: "Completá todos los campos." });
  }
  if (typeof nombre !== "string" || nombre.length > 120) {
    return res.status(400).json({ error: "El nombre no es válido." });
  }
  if (typeof email !== "string" || !EMAIL_REGEX.test(email) || email.length > 200) {
    return res.status(400).json({ error: "El email no es válido." });
  }
  if (typeof mensaje !== "string" || mensaje.length < 3 || mensaje.length > 3000) {
    return res.status(400).json({ error: "El mensaje debe tener entre 3 y 3000 caracteres." });
  }

  await enviarEmail({
    para: process.env.ADMIN_EMAIL || "martingonzalez2497@gmail.com",
    asunto: `📩 Consulta de ${nombre} — Remate Directo`,
    texto: `Nuevo mensaje desde el formulario de contacto:\n\nNombre: ${nombre}\nEmail: ${email}\n\nMensaje:\n${mensaje}\n\n---\nRespondé directamente a este email o por WhatsApp.`,
  });

  // Confirmación al usuario
  await enviarEmail({
    para: email,
    asunto: "Recibimos tu consulta — Quién Da Más",
    texto: `¡Hola ${nombre}!\n\nRecibimos tu mensaje y te vamos a responder a la brevedad.\n\nSi necesitás una respuesta urgente podés escribirnos por WhatsApp al 099 924 004.\n\nEl equipo de Quién Da Más\nCanal 10 · Uruguay`,
  });

  res.json({ ok: true });
});

module.exports = router;
