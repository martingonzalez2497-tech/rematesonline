const express = require("express");
const db = require("../db");
const { avisarActualizacion } = require("../socket");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

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

function resolverOfertasAutomaticas(loteId, intentos = 0) {
  if (intentos > 25) {
    console.error("[OFERTA] resolverOfertasAutomaticas alcanzó el límite de 25 iteraciones en lote " + loteId + " — revisar datos.");
    return;
  }

  const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(loteId);
  if (!lote || lote.estado === "finalizada") return;

  const ultimaOferta = db
    .prepare("SELECT * FROM ofertas WHERE lote_id = ? ORDER BY monto DESC, id DESC LIMIT 1")
    .get(loteId);
  const liderActualId = ultimaOferta ? ultimaOferta.usuario_id : null;

  const candidata = db
    .prepare(
      `SELECT * FROM ofertas_automaticas
       WHERE lote_id = ? AND activa = 1 AND usuario_id != ? AND monto_maximo > ?
       ORDER BY monto_maximo DESC LIMIT 1`
    )
    .get(loteId, liderActualId || 0, lote.oferta_actual);

  if (!candidata) return;

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

  resolverOfertasAutomaticas(loteId, intentos + 1);
}

// ─── Ofertar manualmente ────────────────────────────────────────────────────
router.post("/", requireAuth, requireRole("publico"), (req, res) => {
  const usuarioActual = db.prepare("SELECT bloqueado FROM usuarios WHERE id = ?").get(req.usuario.id);
  if (usuarioActual && usuarioActual.bloqueado) {
    return res.status(403).json({ error: "Tu cuenta fue bloqueada, no podés ofertar." });
  }

  const { loteId, monto } = req.body;
  if (!loteId || monto === undefined) {
    return res.status(400).json({ error: "Faltan datos: loteId y monto son obligatorios." });
  }

  // Fix 2: validar monto como número finito positivo
  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) {
    return res.status(400).json({ error: "Monto inválido." });
  }

  // Fix 1: transacción para evitar race condition
  const resultado = db.transaction(() => {
    const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(loteId);
    if (!lote) return { error: "Lote no encontrado.", status: 404 };
    if (lote.estado === "finalizada") return { error: "Esta subasta ya finalizó.", status: 400 };
    if (new Date(lote.cierre) < new Date()) return { error: "El tiempo para ofertar en este lote ya venció.", status: 400 };

    const minimoValido = Number(lote.oferta_actual) + incrementoPara(lote.oferta_actual);
    if (montoNum < minimoValido) {
      return { error: `Tu oferta debe ser de al menos $ ${minimoValido}.`, status: 400 };
    }

    db.prepare("INSERT INTO ofertas (lote_id, usuario_id, monto) VALUES (?, ?, ?)").run(
      loteId, req.usuario.id, montoNum
    );

    const nuevoCierre = extenderCierreSiHaceFalta(lote);
    db.prepare("UPDATE lotes SET oferta_actual = ?, cierre = ? WHERE id = ?").run(montoNum, nuevoCierre, loteId);

    return { ok: true };
  })();

  if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });

  resolverOfertasAutomaticas(loteId);

  const loteActualizado = db.prepare("SELECT oferta_actual, cierre FROM lotes WHERE id = ?").get(loteId);
  console.log("[OFERTA] Manual — usuario " + req.usuario.id + " (" + req.usuario.nombre + ") ofertó $" + montoNum + " en lote " + loteId + " | nueva oferta actual: $" + loteActualizado.oferta_actual);
  avisarActualizacion();
  res.status(201).json({ ok: true, ofertaActual: loteActualizado.oferta_actual, cierre: loteActualizado.cierre });
});

// ─── Oferta automática (proxy bidding) ─────────────────────────────────────
router.post("/automatica", requireAuth, requireRole("publico"), (req, res) => {
  const usuarioActual = db.prepare("SELECT bloqueado FROM usuarios WHERE id = ?").get(req.usuario.id);
  if (usuarioActual && usuarioActual.bloqueado) {
    return res.status(403).json({ error: "Tu cuenta fue bloqueada, no podés ofertar." });
  }

  const { loteId, montoMaximo } = req.body;
  if (!loteId || montoMaximo === undefined) {
    return res.status(400).json({ error: "Faltan datos: loteId y montoMaximo son obligatorios." });
  }

  // Fix 2: validar montoMaximo como número finito positivo
  const montoMaximoNum = Number(montoMaximo);
  if (!Number.isFinite(montoMaximoNum) || montoMaximoNum <= 0) {
    return res.status(400).json({ error: "Monto máximo inválido." });
  }

  // Fix 1: transacción para evitar race condition
  const resultado = db.transaction(() => {
    const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(loteId);
    if (!lote) return { error: "Lote no encontrado.", status: 404 };
    if (lote.estado === "finalizada") return { error: "Esta subasta ya finalizó.", status: 400 };

    const minimoValidoAuto = Number(lote.oferta_actual) + incrementoPara(lote.oferta_actual);
    if (montoMaximoNum < minimoValidoAuto) {
      return { error: `Tu máximo debe ser de al menos $ ${minimoValidoAuto}.`, status: 400 };
    }

    db.prepare(
      `INSERT INTO ofertas_automaticas (lote_id, usuario_id, monto_maximo, activa)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(lote_id, usuario_id) DO UPDATE SET monto_maximo = excluded.monto_maximo, activa = 1`
    ).run(loteId, req.usuario.id, montoMaximoNum);

    const ultimaOferta = db
      .prepare("SELECT * FROM ofertas WHERE lote_id = ? ORDER BY monto DESC, id DESC LIMIT 1")
      .get(loteId);
    const yaVaGanando = ultimaOferta && ultimaOferta.usuario_id === req.usuario.id;

    if (!yaVaGanando) {
      const incremento = incrementoPara(lote.oferta_actual);
      const primeraOferta = Math.min(montoMaximoNum, Number(lote.oferta_actual) + incremento);
      db.prepare("INSERT INTO ofertas (lote_id, usuario_id, monto) VALUES (?, ?, ?)").run(
        loteId, req.usuario.id, primeraOferta
      );
      const nuevoCierre = extenderCierreSiHaceFalta(lote);
      db.prepare("UPDATE lotes SET oferta_actual = ?, cierre = ? WHERE id = ?").run(primeraOferta, nuevoCierre, loteId);
    }

    return { ok: true };
  })();

  if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });

  resolverOfertasAutomaticas(loteId);

  const loteActualizado = db.prepare("SELECT oferta_actual, cierre FROM lotes WHERE id = ?").get(loteId);
  const gano = db
    .prepare("SELECT usuario_id FROM ofertas WHERE lote_id = ? ORDER BY monto DESC, id DESC LIMIT 1")
    .get(loteId);

  console.log("[OFERTA] Automática — usuario " + req.usuario.id + " (" + req.usuario.nombre + ") configuró máximo $" + montoMaximoNum + " en lote " + loteId + " | nueva oferta actual: $" + loteActualizado.oferta_actual + " | va ganando: " + !!(gano && gano.usuario_id === req.usuario.id));
  avisarActualizacion();
  res.status(201).json({
    ok: true,
    ofertaActual: loteActualizado.oferta_actual,
    cierre: loteActualizado.cierre,
    vasGanando: gano && gano.usuario_id === req.usuario.id,
  });
});

// ─── Desactivar oferta automática ──────────────────────────────────────────
router.delete("/automatica/:loteId", requireAuth, requireRole("publico"), (req, res) => {
  db.prepare(
    "UPDATE ofertas_automaticas SET activa = 0 WHERE lote_id = ? AND usuario_id = ?"
  ).run(req.params.loteId, req.usuario.id);
  res.json({ ok: true });
});

// ─── Ver mi oferta automática activa ───────────────────────────────────────
router.get("/automatica/:loteId", requireAuth, (req, res) => {
  const propia = db
    .prepare("SELECT * FROM ofertas_automaticas WHERE lote_id = ? AND usuario_id = ? AND activa = 1")
    .get(req.params.loteId, req.usuario.id);
  res.json(propia || null);
});

// ─── Actividad reciente (home) ──────────────────────────────────────────────
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

// ─── Historial de ofertas de un lote ───────────────────────────────────────
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

// ─── Mis ofertas con paginación ─────────────────────────────────────────────
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
              lotes.cierre, lotes.ganador_id
       FROM ofertas JOIN lotes ON lotes.id = ofertas.lote_id
       WHERE ofertas.usuario_id = ?
       GROUP BY ofertas.lote_id
       ORDER BY ofertas.fecha DESC
       LIMIT ? OFFSET ?`
    )
    .all(req.usuario.id, porPagina, offset);

  res.json({ ofertas, total, pagina, porPagina, totalPaginas: Math.ceil(total / porPagina) });
});

// ─── Favoritos ──────────────────────────────────────────────────────────────
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

// ─── Vistas de lote ─────────────────────────────────────────────────────────
router.post("/lote/:loteId/vista", (req, res) => {
  const { sesion } = req.body;
  // Fix 4: validar sesion — string no vacío de máximo 64 caracteres
  if (!sesion || typeof sesion !== "string" || sesion.length > 64) {
    return res.status(400).json({ error: "Sesion inválida." });
  }

  const yaVisto = db.prepare(
    `SELECT id FROM vistas_lote WHERE lote_id = ? AND sesion = ? AND fecha > datetime('now', '-5 minutes')`
  ).get(req.params.loteId, sesion);

  if (!yaVisto) {
    db.prepare("INSERT INTO vistas_lote (lote_id, sesion) VALUES (?, ?)").run(req.params.loteId, sesion);
  }

  const total = db.prepare(
    `SELECT COUNT(DISTINCT sesion) AS n FROM vistas_lote WHERE lote_id = ? AND fecha > datetime('now', '-10 minutes')`
  ).get(req.params.loteId).n;

  res.json({ vistas: total });
});

// ─── Reseñas de compradores ─────────────────────────────────────────────────
router.post("/resenas", requireAuth, requireRole("publico"), (req, res) => {
  const { loteId, calificacion, comentario } = req.body;
  if (!loteId || !calificacion || calificacion < 1 || calificacion > 5) {
    return res.status(400).json({ error: "Calificación inválida (1-5)." });
  }
  const lote = db.prepare("SELECT * FROM lotes WHERE id = ? AND ganador_id = ? AND estado = 'finalizada'").get(loteId, req.usuario.id);
  if (!lote) return res.status(403).json({ error: "Solo podés reseñar lotes que ganaste." });

  try {
    db.prepare(
      `INSERT INTO resenas (lote_id, usuario_id, calificacion, comentario)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(lote_id, usuario_id) DO UPDATE SET calificacion = excluded.calificacion, comentario = excluded.comentario`
    ).run(loteId, req.usuario.id, calificacion, comentario || null);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "No se pudo guardar la reseña." });
  }
});

router.get("/resenas/:loteId", (req, res) => {
  const resenas = db.prepare(
    `SELECT resenas.calificacion, resenas.comentario, resenas.creado_en,
            usuarios.nombre AS autor
     FROM resenas JOIN usuarios ON usuarios.id = resenas.usuario_id
     WHERE resenas.lote_id = ? ORDER BY resenas.creado_en DESC`
  ).all(req.params.loteId);
  res.json(resenas);
});

module.exports = router;
