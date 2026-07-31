const express = require("express");
const db = require("../db");
const { avisarActualizacion } = require("../socket");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Ver todos los remates — público, no requiere login
router.get("/", (req, res) => {
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
  const { titulo, rubro, descripcion, moneda } = req.body;
  if (!titulo || !rubro) {
    return res.status(400).json({ error: "Faltan datos: título y rubro son obligatorios." });
  }

  const resultado = db
    .prepare("INSERT INTO remates (titulo, rubro, descripcion, moneda, rematador_id) VALUES (?, ?, ?, ?, ?)")
    .run(titulo, rubro, descripcion || "", moneda === "USD" ? "USD" : "UYU", req.usuario.id);

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

  const { titulo, rubro, descripcion, moneda } = req.body;
  db.prepare("UPDATE remates SET titulo = ?, rubro = ?, descripcion = ?, moneda = ? WHERE id = ?").run(
    titulo ?? remate.titulo,
    rubro ?? remate.rubro,
    descripcion ?? remate.descripcion,
    moneda === "USD" || moneda === "UYU" ? moneda : remate.moneda,
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

module.exports = router;
