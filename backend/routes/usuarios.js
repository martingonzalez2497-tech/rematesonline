const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Listar todos los usuarios — solo administrador
router.get("/", requireAuth, requireRole("administrador"), (req, res) => {
  const usuarios = db.prepare("SELECT id, nombre, email, rol, cedula, aprobado, bloqueado, creado_en FROM usuarios ORDER BY creado_en DESC, id DESC").all();

  const conPuntaje = usuarios.map((usuario) => {
    if (usuario.rol !== "publico") return { ...usuario, puntaje: null };

    const lotesGanados = db
      .prepare("SELECT pago_confirmado FROM lotes WHERE ganador_id = ? AND estado = 'finalizada'")
      .all(usuario.id);

    // Arranca en 100 (neutral). Cada lote pagado suma, cada uno sin pagar resta.
    // Los que todavía están esperando confirmación (pago_confirmado null) no afectan.
    let puntaje = 100;
    lotesGanados.forEach((l) => {
      if (l.pago_confirmado === 1) puntaje += 5;
      else if (l.pago_confirmado === 0) puntaje -= 20;
    });
    puntaje = Math.max(0, Math.min(150, puntaje));

    return { ...usuario, puntaje };
  });

  res.json(conPuntaje);
});

// Bloquear/desbloquear una cuenta — solo administrador. No se puede bloquear
// a un administrador (para no quedarse afuera del sitio sin querer).
router.patch("/:id/bloquear", requireAuth, requireRole("administrador"), (req, res) => {
  const usuario = db.prepare("SELECT rol FROM usuarios WHERE id = ?").get(req.params.id);
  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado." });
  if (usuario.rol === "administrador") {
    return res.status(400).json({ error: "No se puede bloquear a un administrador." });
  }
  db.prepare("UPDATE usuarios SET bloqueado = 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.patch("/:id/desbloquear", requireAuth, requireRole("administrador"), (req, res) => {
  db.prepare("UPDATE usuarios SET bloqueado = 0 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// Aprobar una cuenta de público general pendiente — solo administrador
router.patch("/:id/aprobar", requireAuth, requireRole("administrador"), (req, res) => {
  db.prepare("UPDATE usuarios SET aprobado = 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// Rechazar (eliminar) una cuenta pendiente — solo administrador
router.delete("/:id/rechazar", requireAuth, requireRole("administrador"), (req, res) => {
  const usuario = db.prepare("SELECT aprobado FROM usuarios WHERE id = ?").get(req.params.id);
  if (usuario && !usuario.aprobado) {
    db.prepare("DELETE FROM usuarios WHERE id = ?").run(req.params.id);
  }
  res.json({ ok: true });
});

// Crear un usuario con rol específico (rematador o administrador) — solo administrador.
// Esta es la única forma de crear rematadores/admins: no existe registro público para esos roles.
router.post("/", requireAuth, requireRole("administrador"), async (req, res) => {
  const { nombre, email, password, rol } = req.body;

  if (!nombre || !email || !password || !rol) {
    return res.status(400).json({ error: "Faltan datos obligatorios." });
  }
  if (!["publico", "rematador", "administrador"].includes(rol)) {
    return res.status(400).json({ error: "Rol inválido." });
  }

  const existente = db.prepare("SELECT id FROM usuarios WHERE email = ?").get(email.toLowerCase());
  if (existente) {
    return res.status(409).json({ error: "Ya existe una cuenta con ese email." });
  }

  const hash = await bcrypt.hash(password, 10);
  const resultado = db
    .prepare("INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)")
    .run(nombre, email.toLowerCase(), hash, rol);

  res.status(201).json({ id: resultado.lastInsertRowid, nombre, email, rol });
});

// Cambiar el rol de un usuario existente — solo administrador
router.patch("/:id/rol", requireAuth, requireRole("administrador"), (req, res) => {
  const { rol } = req.body;
  if (!["publico", "rematador", "administrador"].includes(rol)) {
    return res.status(400).json({ error: "Rol inválido." });
  }
  db.prepare("UPDATE usuarios SET rol = ? WHERE id = ?").run(rol, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
