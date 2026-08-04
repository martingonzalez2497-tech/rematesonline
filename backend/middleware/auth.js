const jwt = require("jsonwebtoken");
const db = require("../db");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Falta iniciar sesión." });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: "Sesión inválida o vencida." });
  }

  // Revalidar contra la base de datos en cada request: si el usuario fue
  // bloqueado, eliminado, o le cambiaron el rol después de emitido el
  // token, el token viejo deja de servir inmediatamente en vez de seguir
  // siendo válido hasta que expiren los 7 días.
  const usuarioActual = db.prepare(
    "SELECT id, nombre, rol, bloqueado FROM usuarios WHERE id = ?"
  ).get(payload.id);

  if (!usuarioActual) {
    return res.status(401).json({ error: "Tu cuenta ya no existe." });
  }
  if (usuarioActual.bloqueado) {
    return res.status(403).json({ error: "Tu cuenta fue bloqueada." });
  }

  req.usuario = { id: usuarioActual.id, nombre: usuarioActual.nombre, rol: usuarioActual.rol };
  next();
}

// Uso: requireRole("administrador") o requireRole("administrador", "rematador")
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "No tenés permiso para hacer esto." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
