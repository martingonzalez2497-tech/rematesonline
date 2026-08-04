const express = require("express");
const db = require("../db");
const { enviarEmail } = require("../email");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Suscribirse al newsletter
router.post("/suscribir", async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email) || email.length > 200) {
    return res.status(400).json({ error: "Email inválido." });
  }
  const existe = db.prepare("SELECT id FROM newsletter WHERE email = ?").get(email.toLowerCase());
  if (existe) return res.json({ ok: true, mensaje: "Ya estabas suscripto." });

  db.prepare("INSERT INTO newsletter (email) VALUES (?)").run(email.toLowerCase());

  // Email de confirmación
  await enviarEmail({
    para: email,
    asunto: "✅ Te suscribiste a Quién Da Más",
    texto: `¡Hola!\n\nTe registraste para recibir novedades de Quién Da Más — Remate Directo.\n\nTe vamos a avisar cuando publiquemos nuevos remates con los artículos disponibles y los precios iniciales.\n\n¡Gracias por tu interés!\n\nEl equipo de Quién Da Más\nCanal 10 · Uruguay\nTel: 099 924 004`,
  });

  res.json({ ok: true, mensaje: "¡Listo! Te vamos a avisar cuando haya nuevos remates." });
});

// Enviar newsletter a todos los suscriptores — solo admin
router.post("/enviar", requireAuth, requireRole("administrador"), async (req, res) => {
  const { asunto, texto } = req.body;
  if (!asunto || !texto) return res.status(400).json({ error: "Faltan asunto y texto." });

  const suscriptores = db.prepare("SELECT email FROM newsletter").all();
  if (suscriptores.length === 0) return res.json({ ok: true, enviados: 0 });

  let enviados = 0;
  for (const s of suscriptores) {
    const result = await enviarEmail({ para: s.email, asunto, texto });
    if (result.ok || result.simulado) enviados++;
  }

  res.json({ ok: true, enviados, total: suscriptores.length });
});

// Ver suscriptores — solo admin
router.get("/suscriptores", requireAuth, requireRole("administrador"), (req, res) => {
  const lista = db.prepare("SELECT email, creado_en FROM newsletter ORDER BY creado_en DESC").all();
  res.json(lista);
});

module.exports = router;
