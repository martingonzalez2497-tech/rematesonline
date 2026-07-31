const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const db = require("../db");
const { avisarActualizacion } = require("../socket");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const uploadPlanilla = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Ver todos los lotes — público, no requiere login.
// Cada lote trae los datos de su remate (título, rubro) para poder agruparlos en el frontend.
router.get("/", (req, res) => {
  let sql = `
    SELECT lotes.*, usuarios.nombre AS rematador_nombre,
           remates.titulo AS remate_titulo, remates.rubro AS remate_rubro, remates.moneda AS remate_moneda,
           (SELECT COUNT(*) FROM ofertas WHERE ofertas.lote_id = lotes.id) AS cantidad_ofertas,
           (SELECT ofertas.usuario_id FROM ofertas WHERE ofertas.lote_id = lotes.id
             ORDER BY ofertas.monto DESC, ofertas.id DESC LIMIT 1) AS ganador_actual_id,
           (SELECT GROUP_CONCAT(url, '|') FROM fotos_lote WHERE fotos_lote.lote_id = lotes.id) AS fotos_extra
    FROM lotes
    JOIN usuarios ON usuarios.id = lotes.rematador_id
    JOIN remates ON remates.id = lotes.remate_id
  `;
  const params = [];
  if (req.query.remateId) {
    sql += " WHERE lotes.remate_id = ?";
    params.push(req.query.remateId);
  }
  sql += " ORDER BY lotes.creado_en DESC, lotes.id DESC";

  const lotes = db.prepare(sql).all(...params);
  res.json(lotes);
});

// Descargar la plantilla en blanco para cargar lotes masivamente
router.get("/plantilla-importacion", (req, res) => {
  const encabezados = [
    "numero", "titulo", "descripcion", "precioInicial", "cierre",
    "condicion", "marcaModelo", "material", "dimensiones", "anio",
  ];
  const ejemplo = [
    "1", "Ejemplo: Jeep Wrangler", "Descripción del lote", "50000", "2026-12-31 20:00",
    "Usado, buen estado", "Jeep Wrangler 2019", "", "", "2019",
  ];
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ejemplo]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Lotes");
  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Disposition", "attachment; filename=plantilla-lotes.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});

router.get("/:id", (req, res) => {
  const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado." });
  res.json(lote);
});

// Crear lote dentro de un remate existente — solo rematador o administrador,
// y solo dentro de un remate del que sea dueño (o cualquiera, si es admin).
router.post("/", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const { remateId, numero, titulo, descripcion, imagen, precioInicial, cierre, condicion, marcaModelo, material, dimensiones, anio } = req.body;

  if (!remateId || !numero || !titulo || !precioInicial || !cierre) {
    return res.status(400).json({ error: "Faltan datos obligatorios del lote (incluyendo a qué remate pertenece)." });
  }

  const remate = db.prepare("SELECT * FROM remates WHERE id = ?").get(remateId);
  if (!remate) return res.status(404).json({ error: "El remate indicado no existe." });

  const esDueño = remate.rematador_id === req.usuario.id;
  if (!esDueño && req.usuario.rol !== "administrador") {
    return res.status(403).json({ error: "Solo el rematador dueño del remate o un administrador puede agregarle lotes." });
  }

  const resultado = db
    .prepare(
      `INSERT INTO lotes (remate_id, numero, titulo, descripcion, imagen, precio_inicial, oferta_actual, cierre, rematador_id, condicion, marca_modelo, material, dimensiones, anio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(remateId, numero, titulo, descripcion || "", imagen || "", precioInicial, precioInicial, cierre, remate.rematador_id,
      condicion || "", marcaModelo || "", material || "", dimensiones || "", anio || "");

  avisarActualizacion();
  res.status(201).json({ id: resultado.lastInsertRowid });
});

// Editar lote — el rematador dueño del lote, o cualquier administrador
router.put("/:id", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado." });

  const esDueño = lote.rematador_id === req.usuario.id;
  if (!esDueño && req.usuario.rol !== "administrador") {
    return res.status(403).json({ error: "Solo el rematador dueño del lote o un administrador puede editarlo." });
  }

  const { titulo, descripcion, imagen, cierre, condicion, marcaModelo, material, dimensiones, anio } = req.body;
  db.prepare(
    `UPDATE lotes SET titulo = ?, descripcion = ?, imagen = ?, cierre = ?, condicion = ?, marca_modelo = ?, material = ?, dimensiones = ?, anio = ? WHERE id = ?`
  ).run(
    titulo ?? lote.titulo,
    descripcion ?? lote.descripcion,
    imagen ?? lote.imagen,
    cierre ?? lote.cierre,
    condicion ?? lote.condicion,
    marcaModelo ?? lote.marca_modelo,
    material ?? lote.material,
    dimensiones ?? lote.dimensiones,
    anio ?? lote.anio,
    lote.id
  );

  avisarActualizacion();
  res.json({ ok: true });
});

// Marcar como finalizada (cierre manual anticipado) — dueño o admin
router.post("/:id/finalizar", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado." });

  const esDueño = lote.rematador_id === req.usuario.id;
  if (!esDueño && req.usuario.rol !== "administrador") {
    return res.status(403).json({ error: "No autorizado." });
  }

  const mejorOferta = db
    .prepare("SELECT * FROM ofertas WHERE lote_id = ? ORDER BY monto DESC LIMIT 1")
    .get(lote.id);

  db.prepare("UPDATE lotes SET estado = 'finalizada', ganador_id = ? WHERE id = ?").run(
    mejorOferta ? mejorOferta.usuario_id : null,
    lote.id
  );

  avisarActualizacion();
  res.json({ ok: true, ganador_id: mejorOferta ? mejorOferta.usuario_id : null });
});

// Eliminar lote — solo administrador
router.delete("/:id", requireAuth, requireRole("administrador"), (req, res) => {
  db.prepare("DELETE FROM ofertas WHERE lote_id = ?").run(req.params.id);
  db.prepare("DELETE FROM lotes WHERE id = ?").run(req.params.id);
  avisarActualizacion();
  res.json({ ok: true });
});

// Fotos adicionales de un lote (galería) — la primera foto sigue siendo lotes.imagen
router.get("/:id/fotos", (req, res) => {
  const fotos = db.prepare("SELECT id, url FROM fotos_lote WHERE lote_id = ? ORDER BY id").all(req.params.id);
  res.json(fotos);
});

router.post("/:id/fotos", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Falta la URL de la foto." });
  const resultado = db.prepare("INSERT INTO fotos_lote (lote_id, url) VALUES (?, ?)").run(req.params.id, url);
  avisarActualizacion();
  res.status(201).json({ id: resultado.lastInsertRowid });
});

// Marcar si el ganador de un lote finalizado pagó o no — el rematador dueño
// o un administrador. De esto sale el puntaje de confianza del cliente.
router.patch("/:id/pago", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado." });
  if (lote.estado !== "finalizada" || !lote.ganador_id) {
    return res.status(400).json({ error: "Este lote todavía no tiene un ganador confirmado." });
  }
  const esDueño = lote.rematador_id === req.usuario.id;
  if (!esDueño && req.usuario.rol !== "administrador") {
    return res.status(403).json({ error: "Solo el rematador dueño del lote o un administrador puede marcar el pago." });
  }

  const { pagado } = req.body;
  db.prepare("UPDATE lotes SET pago_confirmado = ? WHERE id = ?").run(pagado ? 1 : 0, lote.id);
  res.json({ ok: true });
});

router.delete("/fotos/:fotoId", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  db.prepare("DELETE FROM fotos_lote WHERE id = ?").run(req.params.fotoId);
  avisarActualizacion();
  res.json({ ok: true });
});


// Importar muchos lotes de una vez desde una planilla Excel/CSV — mismas
// reglas y permisos que cargar un lote individual, solo que en lote (nunca mejor dicho).
router.post(
  "/:remateId/importar",
  requireAuth,
  requireRole("rematador", "administrador"),
  uploadPlanilla.single("planilla"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió ninguna planilla." });
    }

    const remate = db.prepare("SELECT * FROM remates WHERE id = ?").get(req.params.remateId);
    if (!remate) return res.status(404).json({ error: "El remate indicado no existe." });

    const esDueño = remate.rematador_id === req.usuario.id;
    if (!esDueño && req.usuario.rol !== "administrador") {
      return res.status(403).json({ error: "Solo el rematador dueño del remate o un administrador puede importarle lotes." });
    }

    let filas;
    try {
      const libro = XLSX.read(req.file.buffer, { type: "buffer" });
      const primeraHoja = libro.Sheets[libro.SheetNames[0]];
      filas = XLSX.utils.sheet_to_json(primeraHoja, { defval: "" });
    } catch (err) {
      return res.status(400).json({ error: "No se pudo leer el archivo. ¿Es un Excel o CSV válido?" });
    }

    const insertar = db.prepare(
      `INSERT INTO lotes (remate_id, numero, titulo, descripcion, imagen, precio_inicial, oferta_actual, cierre, rematador_id, condicion, marca_modelo, material, dimensiones, anio)
       VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const errores = [];
    let importados = 0;

    filas.forEach((fila, indice) => {
      const numeroFila = indice + 2; // +2 porque la fila 1 es el encabezado
      const numero = String(fila.numero || "").trim();
      const titulo = String(fila.titulo || "").trim();
      const precioInicial = Number(fila.precioInicial);

      let cierre = null;
      if (typeof fila.cierre === "number") {
        // Viene de un Excel real: número serial que codifica fecha + hora.
        const partes = XLSX.SSF.parse_date_code(fila.cierre);
        if (partes) {
          cierre = new Date(partes.y, partes.m - 1, partes.d, partes.H || 0, partes.M || 0);
        }
      } else {
        const cierreTexto = String(fila.cierre || "").trim();
        if (cierreTexto) cierre = new Date(cierreTexto.replace(" ", "T"));
      }

      if (!numero || !titulo || !precioInicial || precioInicial <= 0 || !cierre || isNaN(cierre.getTime())) {
        errores.push(`Fila ${numeroFila}: faltan datos obligatorios o el precio/fecha no son válidos.`);
        return;
      }

      insertar.run(
        req.params.remateId,
        numero,
        titulo,
        String(fila.descripcion || ""),
        precioInicial,
        precioInicial,
        cierre.toISOString(),
        remate.rematador_id,
        String(fila.condicion || ""),
        String(fila.marcaModelo || ""),
        String(fila.material || ""),
        String(fila.dimensiones || ""),
        String(fila.anio || "")
      );
      importados++;
    });

    if (importados > 0) avisarActualizacion();

    res.status(errores.length > 0 && importados === 0 ? 400 : 201).json({
      ok: true,
      importados,
      totalFilas: filas.length,
      errores,
    });
  }
);

module.exports = router;
