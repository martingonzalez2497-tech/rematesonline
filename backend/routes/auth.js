const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { enviarEmail } = require("../email");
const { avisarNuevoUsuarioPendiente } = require("../socket");

const router = express.Router();

function firmarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Valida una cédula de identidad uruguaya con el dígito verificador oficial.
// Acepta con o sin puntos/guión (ej. "1.234.567-8" o "12345678").
function cedulaUruguayaValida(cedulaTexto) {
  const limpia = String(cedulaTexto || "").replace(/\D/g, "");
  if (limpia.length < 7 || limpia.length > 8) return false;

  const numero = limpia.padStart(8, "0");
  const digitos = numero.slice(0, 7).split("").map(Number);
  const verificador = Number(numero[7]);
  const pesos = [2, 9, 8, 7, 6, 3, 4];

  const suma = digitos.reduce((acc, d, i) => acc + d * pesos[i], 0);
  const resto = suma % 10;
  const esperado = resto === 0 ? 0 : 10 - resto;

  return esperado === verificador;
}

// Registro público: siempre crea usuarios con rol "publico", pendientes de
// aprobación por un administrador (no pueden ofertar hasta ser aprobados).
// Rematadores y administradores se crean aparte (ver /api/usuarios), nunca acá.
router.post("/registro", async (req, res) => {
  const { nombre, email, password, cedula, telefono, aceptaTerminos } = req.body;

  if (!nombre || !email || !password || !cedula) {
    return res.status(400).json({ error: "Faltan datos: nombre, email, cédula y password son obligatorios." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }
  if (!cedulaUruguayaValida(cedula)) {
    return res.status(400).json({ error: "La cédula de identidad ingresada no es válida." });
  }
  if (!aceptaTerminos) {
    return res.status(400).json({ error: "Tenés que aceptar los Términos y Condiciones para registrarte." });
  }

  const existente = db.prepare("SELECT id FROM usuarios WHERE email = ?").get(email.toLowerCase());
  if (existente) {
    return res.status(409).json({ error: "Ya existe una cuenta con ese email." });
  }

  const cedulaLimpia = cedula.replace(/\D/g, "");
  const cedulaExistente = db.prepare("SELECT id FROM usuarios WHERE cedula = ?").get(cedulaLimpia);
  if (cedulaExistente) {
    return res.status(409).json({ error: "Ya existe una cuenta registrada con esa cédula." });
  }

  const hash = await bcrypt.hash(password, 10);
  db.prepare(
    "INSERT INTO usuarios (nombre, email, password_hash, rol, cedula, telefono, aprobado, email_verificado) VALUES (?, ?, ?, 'publico', ?, ?, 0, 1)"
  ).run(nombre, email.toLowerCase(), hash, cedulaLimpia, telefono || null);

  avisarNuevoUsuarioPendiente(nombre);

  // Sin verificación de email — el usuario queda pendiente de aprobación del admin
  res.status(201).json({
    ok: true,
    requiereVerificacion: false,
    mensaje: "¡Listo! Tu cuenta está pendiente de aprobación por un administrador.",
  });
});

async function generarYEnviarCodigo(usuarioId, email, nombre) {
  const codigo = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
  const expira = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutos

  db.prepare("INSERT INTO codigos_verificacion (usuario_id, codigo, expira) VALUES (?, ?, ?)").run(
    usuarioId,
    codigo,
    expira
  );

  await enviarEmail({
    para: email,
    asunto: "Tu código de verificación — Remate Directo",
    texto: `Hola ${nombre},\n\nTu código de verificación es: ${codigo}\n\nVale por 15 minutos.\n\nSi no creaste esta cuenta, ignorá este email.`,
  });
}

router.post("/verificar-codigo", async (req, res) => {
  const { email, codigo } = req.body;
  if (!email || !codigo) {
    return res.status(400).json({ error: "Faltan datos: email y código son obligatorios." });
  }

  const usuario = db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email.toLowerCase());
  if (!usuario) {
    return res.status(404).json({ error: "No existe una cuenta con ese email." });
  }
  if (usuario.email_verificado) {
    return res.json({ ok: true, yaEstabaVerificado: true });
  }

  const registro = db
    .prepare(
      "SELECT * FROM codigos_verificacion WHERE usuario_id = ? AND codigo = ? AND usado = 0 ORDER BY id DESC LIMIT 1"
    )
    .get(usuario.id, codigo);

  if (!registro) {
    return res.status(400).json({ error: "El código ingresado no es correcto." });
  }
  if (new Date(registro.expira) < new Date()) {
    return res.status(400).json({ error: "Este código venció. Pedí uno nuevo." });
  }

  db.prepare("UPDATE codigos_verificacion SET usado = 1 WHERE id = ?").run(registro.id);
  db.prepare("UPDATE usuarios SET email_verificado = 1 WHERE id = ?").run(usuario.id);

  res.json({ ok: true });
});

router.post("/reenviar-codigo", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Falta el email." });

  const usuario = db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email.toLowerCase());
  // Respuesta genérica exista o no la cuenta, por seguridad (mismo criterio
  // que ya usamos en /olvide-password).
  if (!usuario || usuario.email_verificado) {
    return res.json({ ok: true });
  }

  await generarYEnviarCodigo(usuario.id, usuario.email, usuario.nombre);
  res.json({ ok: true });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Faltan datos: email y password son obligatorios." });
  }

  const usuario = db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email.toLowerCase());
  if (!usuario) {
    return res.status(401).json({ error: "Email o contraseña incorrectos." });
  }

  const passwordOk = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ error: "Email o contraseña incorrectos." });
  }
  if (usuario.bloqueado) {
    return res.status(403).json({ error: "Tu cuenta fue bloqueada. Contactate con nosotros si creés que es un error." });
  }
  if (!usuario.email_verificado) {
    return res.status(403).json({ error: "Todavía no verificaste tu email. Revisá tu casilla por el código.", requiereVerificacion: true });
  }
  if (!usuario.aprobado) {
    return res.status(403).json({ error: "Tu cuenta todavía no fue aprobada por un administrador. Probá más tarde." });
  }

  res.json({ token: firmarToken(usuario), usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } });
});

// Devuelve los datos del usuario logueado (para restaurar sesión al recargar la página)
router.get("/yo", requireAuth, (req, res) => {
  res.json({ usuario: req.usuario });
});

/* ==========================================================================
   RECUPERACIÓN DE CONTRASEÑA
   IMPORTANTE: todavía no hay servicio de email conectado. El link de
   recuperación se imprime en la consola del servidor (ver server.log) en
   vez de enviarse por mail. Cuando conectes un servicio de email real
   (Resend, SendGrid, Gmail, etc.), reemplazá el console.log de abajo por
   el envío real — el resto del flujo (token, expiración, cambio de
   contraseña) ya queda funcionando tal cual.
   ========================================================================== */
router.post("/olvide-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Falta el email." });
  }

  const usuario = db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email.toLowerCase());

  // Por seguridad, respondemos "ok" exista o no la cuenta —
  // así nadie puede usar este endpoint para averiguar qué emails están registrados.
  if (!usuario) {
    return res.json({ ok: true });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora

  db.prepare("INSERT INTO recuperaciones_password (usuario_id, token, expira) VALUES (?, ?, ?)").run(
    usuario.id,
    token,
    expira
  );

  const linkRecuperacion = `${process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500"}/index.html?resetToken=${token}`;

  await enviarEmail({
    para: usuario.email,
    asunto: "Recuperar tu contraseña — Remate Directo",
    texto: `Hola ${usuario.nombre},\n\nEntrá a este link para poner una contraseña nueva:\n${linkRecuperacion}\n\nVale por 1 hora. Si no pediste esto, ignorá el email.`,
  });

  res.json({ ok: true });
});

router.post("/restablecer-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: "Faltan datos: token y password son obligatorios." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }

  const recuperacion = db.prepare("SELECT * FROM recuperaciones_password WHERE token = ?").get(token);
  if (!recuperacion) {
    return res.status(400).json({ error: "El link de recuperación no es válido." });
  }
  if (recuperacion.usado) {
    return res.status(400).json({ error: "Este link ya fue utilizado." });
  }
  if (new Date(recuperacion.expira) < new Date()) {
    return res.status(400).json({ error: "Este link venció. Pedí uno nuevo." });
  }

  const hash = await bcrypt.hash(password, 10);
  db.prepare("UPDATE usuarios SET password_hash = ? WHERE id = ?").run(hash, recuperacion.usuario_id);
  db.prepare("UPDATE recuperaciones_password SET usado = 1 WHERE id = ?").run(recuperacion.id);

  res.json({ ok: true });
});

module.exports = router;
