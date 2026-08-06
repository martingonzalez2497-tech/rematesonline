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
    // Log: token inválido o vencido — útil para detectar intentos de acceso con tokens manipulados
    console.warn(`[AUTH] Token rechazado — ${err.message} | IP: ${req.ip} | Ruta: ${req.method} ${req.path}`);
    return res.status(401).json({ error: "Sesión inválida o vencida." });
  }

  const usuarioActual = db.prepare(
    "SELECT id, nombre, rol, bloqueado FROM usuarios WHERE id = ?"
  ).get(payload.id);

  if (!usuarioActual) {
    console.warn(`[AUTH] Token válido pero usuario ${payload.id} no existe en DB | IP: ${req.ip}`);
    return res.status(401).json({ error: "Tu cuenta ya no existe." });
  }
  if (usuarioActual.bloqueado) {
    console.warn(`[AUTH] Acceso bloqueado — usuario ${usuarioActual.id} (${usuarioActual.nombre}) | IP: ${req.ip} | Ruta: ${req.method} ${req.path}`);
    return res.status(403).json({ error: "Tu cuenta fue bloqueada." });
  }

  req.usuario = { id: usuarioActual.id, nombre: usuarioActual.nombre, rol: usuarioActual.rol };
  next();
}

function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      console.warn(`[AUTH] Rol insuficiente — usuario ${req.usuario?.id} (${req.usuario?.rol}) intentó acceder a ruta restringida a [${rolesPermitidos}] | ${req.method} ${req.path}`);
      return res.status(403).json({ error: "No tenés permiso para hacer esto." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
