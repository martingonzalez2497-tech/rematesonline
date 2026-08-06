const express = require("express");
const db = require("../db");
const { avisarActualizacion } = require("../socket");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sanitizarTexto } = require("../sanitizar");

const router = express.Router();

// Ver todos los remates — público, no requiere login
router.get("/", (req, res) => {
  const ahora = new Date().toISOString();
  const remates = db
    .prepare(
      `SELECT remates.*, usuarios.nombre AS rematador_nombre
       FROM remates JOIN usuarios ON usuarios.id = remates.rematador_id
       WHERE remates.fecha_inicio IS NULL OR remates.fecha_inicio <= ?
       ORDER BY remates.creado_en DESC, remates.id DESC`
    )
    .all(ahora);
  res.json(remates);
});

// Ver TODOS los remates incluyendo programados — solo admin/rematador
router.get("/todos", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const remates = db
    .prepare(
      `SELECT remates.*, usuarios.nombre AS rematador_nombre
       FROM remates JOIN usuarios ON usuarios.id = remates.rematador_id
       ORDER BY remates.creado_en DESC, remates.id DESC`
    )
    .all();
  res.json(remates);
});

router.get("/:id", (req, res) => {
  const remate = db.prepare("SELECT * FROM remates WHERE id = ?").get(req.params.id);
  if (!remate) return res.status(404).json({ error: "Remate no encontrado." });
  res.json(remate);
});

// Crear un remate (evento) — solo rematador o administrador
router.post("/", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const { titulo, rubro, descripcion, moneda, fecha_inicio } = req.body;
  if (!titulo || !rubro) {
    return res.status(400).json({ error: "Faltan datos: título y rubro son obligatorios." });
  }
  const resultado = db
    .prepare("INSERT INTO remates (titulo, rubro, descripcion, moneda, rematador_id, fecha_inicio) VALUES (?, ?, ?, ?, ?, ?)")
    .run(sanitizarTexto(titulo), sanitizarTexto(rubro), sanitizarTexto(descripcion), moneda === "USD" ? "USD" : "UYU", req.usuario.id, fecha_inicio || null);
  avisarActualizacion();
  res.status(201).json({ id: resultado.lastInsertRowid });
});

// Editar un remate — el rematador dueño, o cualquier administrador
router.put("/:id", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const remate = db.prepare("SELECT * FROM remates WHERE id = ?").get(req.params.id);
  if (!remate) return res.status(404).json({ error: "Remate no encontrado." });

  const esDueño = remate.rematador_id === req.usuario.id;
  if (!esDueño && req.usuario.rol !== "administrador") {
    return res.status(403).json({ error: "Solo el rematador dueño o un administrador puede editar este remate." });
  }

  const { titulo, rubro, descripcion, moneda, imagen_portada, fecha_inicio } = req.body;
  db.prepare("UPDATE remates SET titulo = ?, rubro = ?, descripcion = ?, moneda = ?, imagen_portada = ?, fecha_inicio = ? WHERE id = ?").run(
    titulo !== undefined ? sanitizarTexto(titulo) : remate.titulo,
    rubro !== undefined ? sanitizarTexto(rubro) : remate.rubro,
    descripcion !== undefined ? sanitizarTexto(descripcion) : remate.descripcion,
    moneda === "USD" || moneda === "UYU" ? moneda : remate.moneda,
    imagen_portada !== undefined ? imagen_portada : remate.imagen_portada,
    fecha_inicio !== undefined ? (fecha_inicio || null) : remate.fecha_inicio,
    remate.id
  );

  avisarActualizacion();
  res.json({ ok: true });
});

// Eliminar un remate — solo administrador. Se lleva puestos sus lotes y ofertas.
router.delete("/:id", requireAuth, requireRole("administrador"), (req, res) => {
  const loteIds = db.prepare("SELECT id FROM lotes WHERE remate_id = ?").all(req.params.id).map((l) => l.id);
  const borrarOfertas = db.prepare("DELETE FROM ofertas WHERE lote_id = ?");
  loteIds.forEach((id) => borrarOfertas.run(id));
  db.prepare("DELETE FROM lotes WHERE remate_id = ?").run(req.params.id);
  db.prepare("DELETE FROM remates WHERE id = ?").run(req.params.id);
  avisarActualizacion();
  res.json({ ok: true });
});

const COMISION = 0.183;

// Estadísticas de un remate — solo el rematador dueño o un administrador.
// Todos los números salen de datos reales que ya guardamos; no se inventa nada
// (por eso no hay "visitas" ni "avisos SMS": no medimos esas cosas).
router.get("/:id/estadisticas", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const remate = db.prepare("SELECT * FROM remates WHERE id = ?").get(req.params.id);
  if (!remate) return res.status(404).json({ error: "Remate no encontrado." });
  if (remate.rematador_id !== req.usuario.id && req.usuario.rol !== "administrador") {
    return res.status(403).json({ error: "No tenés permiso para ver las estadísticas de este remate." });
  }

  const lotes = db.prepare("SELECT * FROM lotes WHERE remate_id = ?").all(remate.id);
  const lotesVendidos = lotes.filter((l) => l.estado === "finalizada" && l.ganador_id);
  const totalFacturado = lotesVendidos.reduce((suma, l) => suma + l.oferta_actual, 0);

  const loteIds = lotes.map((l) => l.id);
  let totalOfertas = 0;
  let ofertasAutomaticas = 0;
  let primeraOferta = null;
  let ultimaOferta = null;

  if (loteIds.length > 0) {
    const marcadores = loteIds.map(() => "?").join(",");
    totalOfertas = db.prepare(`SELECT COUNT(*) AS n FROM ofertas WHERE lote_id IN (${marcadores})`).get(...loteIds).n;
    ofertasAutomaticas = db.prepare(`SELECT COUNT(*) AS n FROM ofertas_automaticas WHERE lote_id IN (${marcadores})`).get(...loteIds).n;
    const rango = db.prepare(`SELECT MIN(fecha) AS primera, MAX(fecha) AS ultima FROM ofertas WHERE lote_id IN (${marcadores})`).get(...loteIds);
    primeraOferta = rango.primera;
    ultimaOferta = rango.ultima;
  }

  let duracionMinutos = null;
  let promedioSegundosPorLote = null;
  if (primeraOferta && ultimaOferta) {
    duracionMinutos = Math.round((new Date(ultimaOferta) - new Date(primeraOferta)) / 60000);
    if (lotesVendidos.length > 0) {
      promedioSegundosPorLote = Math.round((new Date(ultimaOferta) - new Date(primeraOferta)) / 1000 / lotesVendidos.length);
    }
  }

  res.json({
    totalLotes: lotes.length,
    lotesVendidos: lotesVendidos.length,
    porcentajeVendido: lotes.length > 0 ? Math.round((lotesVendidos.length / lotes.length) * 100) : 0,
    totalFacturado,
    comisionGenerada: Math.round(totalFacturado * COMISION),
    totalOfertas,
    ofertasAutomaticas,
    duracionMinutos,
    promedioSegundosPorLote,
    moneda: remate.moneda,
  });
});

// Dashboard de ganadores de un remate
router.get("/:id/ganadores", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const remate = db.prepare("SELECT * FROM remates WHERE id = ?").get(req.params.id);
  if (!remate) return res.status(404).json({ error: "Remate no encontrado." });

  const ganadores = db.prepare(`
    SELECT l.id, l.numero, l.titulo, l.oferta_actual, l.moneda, l.pago_confirmado,
           u.nombre AS ganador_nombre, u.email AS ganador_email, u.cedula AS ganador_cedula
    FROM lotes l
    JOIN usuarios u ON u.id = l.ganador_id
    WHERE l.remate_id = ? AND l.estado = 'finalizada' AND l.ganador_id IS NOT NULL
    ORDER BY CAST(REPLACE(REPLACE(l.numero, '#', ''), ' ', '') AS INTEGER) ASC
  `).all(req.params.id);

  const pendientes = db.prepare(`
    SELECT l.id, l.numero, l.titulo, l.oferta_actual, l.moneda
    FROM lotes l
    WHERE l.remate_id = ? AND l.estado = 'finalizada' AND l.ganador_id IS NULL
    ORDER BY CAST(REPLACE(REPLACE(l.numero, '#', ''), ' ', '') AS INTEGER) ASC
  `).all(req.params.id);

  res.json({ remate, ganadores, sinGanador: pendientes });
});

// Estadísticas generales del administrador
router.get("/estadisticas-generales", requireAuth, requireRole("administrador"), (req, res) => {
  const totalUsuarios = db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'publico'").get().n;
  const usuariosActivos = db.prepare("SELECT COUNT(DISTINCT usuario_id) AS n FROM ofertas WHERE fecha > datetime('now', '-30 days')").get().n;
  const totalRemates = db.prepare("SELECT COUNT(*) AS n FROM remates").get().n;
  const totalLotes = db.prepare("SELECT COUNT(*) AS n FROM lotes").get().n;
  const totalOfertas = db.prepare("SELECT COUNT(*) AS n FROM ofertas").get().n;
  const lotesVendidos = db.prepare("SELECT * FROM lotes WHERE estado = 'finalizada' AND ganador_id IS NOT NULL").all();
  const totalRecaudado = lotesVendidos.reduce((s, l) => s + (l.oferta_actual || 0), 0);
  const comisionTotal = Math.round(totalRecaudado * 0.183);
  const lotesTop = db.prepare(`
    SELECT l.titulo, l.numero, COUNT(o.id) AS total_ofertas, l.oferta_actual, r.titulo AS remate_titulo, r.moneda
    FROM lotes l
    LEFT JOIN ofertas o ON o.lote_id = l.id
    LEFT JOIN remates r ON r.id = l.remate_id
    GROUP BY l.id ORDER BY total_ofertas DESC LIMIT 5
  `).all();

  res.json({ totalUsuarios, usuariosActivos, totalRemates, totalLotes, totalOfertas, totalRecaudado, comisionTotal, lotesTop });
});

// Exportar ganadores de un remate como CSV
router.get("/:id/exportar-ganadores", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const remate = db.prepare("SELECT * FROM remates WHERE id = ?").get(req.params.id);
  if (!remate) return res.status(404).json({ error: "Remate no encontrado." });

  const lotes = db.prepare(`
    SELECT l.numero, l.titulo, l.oferta_actual, l.moneda, u.nombre AS ganador_nombre, u.email AS ganador_email, u.cedula AS ganador_cedula
    FROM lotes l
    LEFT JOIN usuarios u ON u.id = l.ganador_id
    WHERE l.remate_id = ? AND l.estado = 'finalizada' AND l.ganador_id IS NOT NULL
    ORDER BY CAST(REPLACE(REPLACE(l.numero, '#', ''), ' ', '') AS INTEGER) ASC
  `).all(req.params.id);

  const moneda = remate.moneda === "USD" ? "US$" : "$";
  let csv = "Lote,Título,Monto ganador,Ganador,Email,Cédula\n";
  lotes.forEach((l) => {
    csv += `"${l.numero}","${l.titulo}","${moneda} ${l.oferta_actual.toLocaleString("es-UY")}","${l.ganador_nombre}","${l.ganador_email}","${l.ganador_cedula}"\n`;
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ganadores-${remate.titulo.replace(/\s+/g, "-")}.csv"`);
  res.send("\uFEFF" + csv); // BOM para que Excel lo abra bien
});

module.exports = router;
