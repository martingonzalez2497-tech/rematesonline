const express = require("express");
const db = require("../db");
const { avisarActualizacion } = require("../socket");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Incremento mínimo entre ofertas: 5% del monto actual (redondeado)
// Tabla de incrementos mínimos por franja de precio (igual criterio que usan
// las casas de remates reales: montos chicos suben de a poco, montos grandes
// saltan más en plata pero proporcionalmente menos).
const FRANJAS_INCREMENTO = [
  { hasta: 300, incremento: 10 },
  { hasta: 1000, incremento: 50 },
  { hasta: 2500, incremento: 100 },
  { hasta: 5000, incremento: 200 },
  { hasta: 10000, incremento: 500 },
  { hasta: 20000, incremento: 1000 },
  { hasta: 50000, incremento: 2000 },
  { hasta: 100000, incremento: 5000 },
  { hasta: 250000, incremento: 10000 },
  { hasta: 500000, incremento: 12500 },
  { hasta: 1000000, incremento: 15000 },
  { hasta: Infinity, incremento: 20000 },
];

function incrementoPara(montoActual) {
  const franja = FRANJAS_INCREMENTO.find((f) => montoActual < f.hasta);
  return franja ? franja.incremento : 10000;
}

function extenderCierreSiHaceFalta(lote) {
  const restanteMs = new Date(lote.cierre) - new Date();
  if (restanteMs < 60 * 1000) {
    return new Date(Date.now() + 60 * 1000).toISOString();
  }
  return lote.cierre;
}

// Después de cualquier oferta (manual o automática), revisa si alguna oferta
// automática de OTRO usuario tiene que reaccionar pujando por encima.
// Se llama recursivamente hasta que nadie más necesite reaccionar (con un
// límite de seguridad para evitar loops infinitos si hay un bug de datos).
function resolverOfertasAutomaticas(loteId, intentos = 0) {
  if (intentos > 25) return; // salvavidas, no debería llegar a pasar nunca

  const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(loteId);
  if (!lote || lote.estado === "finalizada") return;

  const ultimaOferta = db
    .prepare("SELECT * FROM ofertas WHERE lote_id = ? ORDER BY monto DESC, id DESC LIMIT 1")
    .get(loteId);
  const liderActualId = ultimaOferta ? ultimaOferta.usuario_id : null;

  // La mejor oferta automática activa que no sea ya del líder actual
  const candidata = db
    .prepare(
      `SELECT * FROM ofertas_automaticas
       WHERE lote_id = ? AND activa = 1 AND usuario_id != ? AND monto_maximo > ?
       ORDER BY monto_maximo DESC LIMIT 1`
    )
    .get(loteId, liderActualId || 0, lote.oferta_actual);

  if (!candidata) return; // nadie más está dispuesto a superar la oferta actual

  const incremento = incrementoPara(lote.oferta_actual);
  const nuevoMonto = Math.min(candidata.monto_maximo, Number(lote.oferta_actual) + incremento);

  if (nuevoMonto <= lote.oferta_actual) return;

  db.prepare("INSERT INTO ofertas (lote_id, usuario_id, monto) VALUES (?, ?, ?)").run(
    loteId,
    candidata.usuario_id,
    nuevoMonto
  );

  const nuevoCierre = extenderCierreSiHaceFalta(lote);
  db.prepare("UPDATE lotes SET oferta_actual = ?, cierre = ? WHERE id = ?").run(nuevoMonto, nuevoCierre, loteId);

  // Puede que esto dispare a su vez la reacción de otra oferta automática (ping-pong)
  resolverOfertasAutomaticas(loteId, intentos + 1);
}

// Ofertar por un lote — solo público general logueado.
router.post("/", requireAuth, requireRole("publico"), (req, res) => {
  const usuarioActual = db.prepare("SELECT bloqueado FROM usuarios WHERE id = ?").get(req.usuario.id);
  if (usuarioActual && usuarioActual.bloqueado) {
    return res.status(403).json({ error: "Tu cuenta fue bloqueada, no podés ofertar." });
  }

  const { loteId, monto } = req.body;
  if (!loteId || !monto) {
    return res.status(400).json({ error: "Faltan datos: loteId y monto son obligatorios." });
  }

  const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(loteId);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado." });
  if (lote.estado === "finalizada") {
    return res.status(400).json({ error: "Esta subasta ya finalizó." });
  }
  if (new Date(lote.cierre) < new Date()) {
    return res.status(400).json({ error: "El tiempo para ofertar en este lote ya venció." });
  }
  const minimoValido = Number(lote.oferta_actual) + incrementoPara(lote.oferta_actual);
  if (Number(monto) < minimoValido) {
    return res.status(400).json({ error: `Tu oferta debe ser de al menos $ ${minimoValido}.` });
  }

  db.prepare("INSERT INTO ofertas (lote_id, usuario_id, monto) VALUES (?, ?, ?)").run(
    loteId,
    req.usuario.id,
    monto
  );

  const nuevoCierre = extenderCierreSiHaceFalta(lote);
  db.prepare("UPDATE lotes SET oferta_actual = ?, cierre = ? WHERE id = ?").run(monto, nuevoCierre, loteId);

  resolverOfertasAutomaticas(loteId);

  const loteActualizado = db.prepare("SELECT oferta_actual, cierre FROM lotes WHERE id = ?").get(loteId);
  avisarActualizacion();
  res.status(201).json({ ok: true, ofertaActual: loteActualizado.oferta_actual, cierre: loteActualizado.cierre });
});

// Activar/actualizar una oferta automática (puja proxy) — solo público general.
// El usuario da un monto máximo, y el sistema puja por él automáticamente,
// de a poco, cada vez que alguien lo supera, sin pasarse de ese máximo.
router.post("/automatica", requireAuth, requireRole("publico"), (req, res) => {
  const usuarioActual = db.prepare("SELECT bloqueado FROM usuarios WHERE id = ?").get(req.usuario.id);
  if (usuarioActual && usuarioActual.bloqueado) {
    return res.status(403).json({ error: "Tu cuenta fue bloqueada, no podés ofertar." });
  }

  const { loteId, montoMaximo } = req.body;
  if (!loteId || !montoMaximo) {
    return res.status(400).json({ error: "Faltan datos: loteId y montoMaximo son obligatorios." });
  }

  const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(loteId);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado." });
  if (lote.estado === "finalizada") {
    return res.status(400).json({ error: "Esta subasta ya finalizó." });
  }
  const minimoValidoAuto = Number(lote.oferta_actual) + incrementoPara(lote.oferta_actual);
  if (Number(montoMaximo) < minimoValidoAuto) {
    return res.status(400).json({ error: `Tu máximo debe ser de al menos $ ${minimoValidoAuto}.` });
  }

  db.prepare(
    `INSERT INTO ofertas_automaticas (lote_id, usuario_id, monto_maximo, activa)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(lote_id, usuario_id) DO UPDATE SET monto_maximo = excluded.monto_maximo, activa = 1`
  ).run(loteId, req.usuario.id, montoMaximo);

  // Si el usuario no va ganando todavía, hacemos una primera oferta de su parte ya mismo
  const ultimaOferta = db
    .prepare("SELECT * FROM ofertas WHERE lote_id = ? ORDER BY monto DESC, id DESC LIMIT 1")
    .get(loteId);
  const yaViene_ganando = ultimaOferta && ultimaOferta.usuario_id === req.usuario.id;

  if (!yaViene_ganando) {
    const incremento = incrementoPara(lote.oferta_actual);
    const primeraOferta = Math.min(montoMaximo, Number(lote.oferta_actual) + incremento);
    db.prepare("INSERT INTO ofertas (lote_id, usuario_id, monto) VALUES (?, ?, ?)").run(
      loteId,
      req.usuario.id,
      primeraOferta
    );
    const nuevoCierre = extenderCierreSiHaceFalta(lote);
    db.prepare("UPDATE lotes SET oferta_actual = ?, cierre = ? WHERE id = ?").run(primeraOferta, nuevoCierre, loteId);
  }

  resolverOfertasAutomaticas(loteId);

  const loteActualizado = db.prepare("SELECT oferta_actual, cierre FROM lotes WHERE id = ?").get(loteId);
  const gano = db
    .prepare("SELECT usuario_id FROM ofertas WHERE lote_id = ? ORDER BY monto DESC, id DESC LIMIT 1")
    .get(loteId);

  avisarActualizacion();
  res.status(201).json({
    ok: true,
    ofertaActual: loteActualizado.oferta_actual,
    cierre: loteActualizado.cierre,
    vasGanando: gano && gano.usuario_id === req.usuario.id,
  });
});

// Desactivar mi oferta automática en un lote
router.delete("/automatica/:loteId", requireAuth, requireRole("publico"), (req, res) => {
  db.prepare(
    "UPDATE ofertas_automaticas SET activa = 0 WHERE lote_id = ? AND usuario_id = ?"
  ).run(req.params.loteId, req.usuario.id);
  res.json({ ok: true });
});

// Ver mi oferta automática activa en un lote (para precargar el formulario)
router.get("/automatica/:loteId", requireAuth, (req, res) => {
  const propia = db
    .prepare("SELECT * FROM ofertas_automaticas WHERE lote_id = ? AND usuario_id = ? AND activa = 1")
    .get(req.params.loteId, req.usuario.id);
  res.json(propia || null);
});

// Historial de ofertas de un lote (público, para mostrar quién va ganando sin exponer emails)
// Últimas ofertas de todo el sitio (público), para mostrar actividad reciente en la home
router.get("/recientes", (req, res) => {
  const ofertas = db
    .prepare(
      `SELECT ofertas.monto, ofertas.fecha, usuarios.nombre AS usuario_nombre,
              lotes.titulo AS lote_titulo, lotes.numero AS lote_numero
       FROM ofertas
       JOIN usuarios ON usuarios.id = ofertas.usuario_id
       JOIN lotes ON lotes.id = ofertas.lote_id
       ORDER BY ofertas.id DESC
       LIMIT 8`
    )
    .all();
  res.json(ofertas);
});

router.get("/lote/:loteId", (req, res) => {
  const ofertas = db
    .prepare(
      `SELECT ofertas.monto, ofertas.fecha, usuarios.nombre AS usuario_nombre
       FROM ofertas JOIN usuarios ON usuarios.id = ofertas.usuario_id
       WHERE lote_id = ? ORDER BY ofertas.fecha ASC`
    )
    .all(req.params.loteId);
  res.json(ofertas);
});

// Mis ofertas — con paginación
router.get("/mias", requireAuth, (req, res) => {
  const pagina = parseInt(req.query.pagina) || 1;
  const porPagina = 20;
  const offset = (pagina - 1) * porPagina;

  const total = db.prepare(
    `SELECT COUNT(DISTINCT lote_id) AS n FROM ofertas WHERE usuario_id = ?`
  ).get(req.usuario.id).n;

  const ofertas = db
    .prepare(
      `SELECT ofertas.*, lotes.titulo, lotes.numero, lotes.imagen, lotes.estado AS lote_estado,
              lotes.cierre, lotes.ganador_id, lotes.remate_moneda
       FROM ofertas JOIN lotes ON lotes.id = ofertas.lote_id
       WHERE ofertas.usuario_id = ?
       GROUP BY ofertas.lote_id
       ORDER BY ofertas.fecha DESC
       LIMIT ? OFFSET ?`
    )
    .all(req.usuario.id, porPagina, offset);

  res.json({ ofertas, total, pagina, porPagina, totalPaginas: Math.ceil(total / porPagina) });
});

// Favoritos — GET lista, POST toggle
router.get("/favoritos", requireAuth, (req, res) => {
  const favs = db.prepare(
    `SELECT lote_id FROM favoritos WHERE usuario_id = ?`
  ).all(req.usuario.id).map(r => r.lote_id);
  res.json(favs);
});

router.post("/favoritos/:loteId", requireAuth, (req, res) => {
  const { loteId } = req.params;
  const existe = db.prepare(
    "SELECT id FROM favoritos WHERE usuario_id = ? AND lote_id = ?"
  ).get(req.usuario.id, loteId);

  if (existe) {
    db.prepare("DELETE FROM favoritos WHERE usuario_id = ? AND lote_id = ?").run(req.usuario.id, loteId);
    res.json({ esFavorito: false });
  } else {
    db.prepare("INSERT OR IGNORE INTO favoritos (usuario_id, lote_id) VALUES (?, ?)").run(req.usuario.id, loteId);
    res.json({ esFavorito: true });
  }
});

// Registrar vista de un lote (contador en vivo)
router.post("/lote/:loteId/vista", (req, res) => {
  const { sesion } = req.body;
  if (!sesion) return res.status(400).json({ error: "Falta sesion." });
  // Upsert: si la misma sesión ya vio este lote en los últimos 5 min, no duplicar
  const yaVisto = db.prepare(
    `SELECT id FROM vistas_lote WHERE lote_id = ? AND sesion = ? AND fecha > datetime('now', '-5 minutes')`
  ).get(req.params.loteId, sesion);
  if (!yaVisto) {
    db.prepare("INSERT INTO vistas_lote (lote_id, sesion) VALUES (?, ?)").run(req.params.loteId, sesion);
  }
  // Contar vistas únicas de los últimos 10 minutos
  const total = db.prepare(
    `SELECT COUNT(DISTINCT sesion) AS n FROM vistas_lote WHERE lote_id = ? AND fecha > datetime('now', '-10 minutes')`
  ).get(req.params.loteId).n;
  res.json({ vistas: total });
});

module.exports = router;
