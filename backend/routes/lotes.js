const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const db = require("../db");
const { avisarActualizacion } = require("../socket");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sanitizarTexto } = require("../sanitizar");

const router = express.Router();
const uploadPlanilla = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Ver todos los lotes ─────────────────────────────────────────────────────
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
  sql += " ORDER BY CAST(REPLACE(REPLACE(lotes.numero, '#', ''), ' ', '') AS INTEGER) ASC, lotes.id ASC";

  const lotes = db.prepare(sql).all(...params);
  res.json(lotes);
});

// ─── Plantilla de importación ────────────────────────────────────────────────
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

// ─── Ver lote por ID ─────────────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado." });
  res.json(lote);
});

// ─── Crear lote ──────────────────────────────────────────────────────────────
router.post("/", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const { remateId, numero, titulo, descripcion, imagen, precioInicial, cierre, condicion, marcaModelo, material, dimensiones, anio } = req.body;

  if (!remateId || !numero || !titulo || !precioInicial || !cierre) {
    return res.status(400).json({ error: "Faltan datos obligatorios del lote (incluyendo a qué remate pertenece)." });
  }

  // Fix 4: validar precioInicial como número finito positivo
  const precioNum = Number(precioInicial);
  if (!Number.isFinite(precioNum) || precioNum <= 0) {
    return res.status(400).json({ error: "El precio inicial debe ser un número mayor a cero." });
  }

  // Fix 5: validar que el cierre sea una fecha futura válida
  const cierreDate = new Date(cierre);
  if (isNaN(cierreDate.getTime()) || cierreDate <= new Date()) {
    return res.status(400).json({ error: "La fecha de cierre debe ser una fecha futura válida." });
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
    .run(remateId, sanitizarTexto(numero), sanitizarTexto(titulo), sanitizarTexto(descripcion), imagen || "", precioNum, precioNum, cierreDate.toISOString(), remate.rematador_id,
      sanitizarTexto(condicion), sanitizarTexto(marcaModelo), sanitizarTexto(material), sanitizarTexto(dimensiones), sanitizarTexto(anio));

  avisarActualizacion();
  res.status(201).json({ id: resultado.lastInsertRowid });
});

// ─── Editar lote ─────────────────────────────────────────────────────────────
router.put("/:id", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const lote = db.prepare("SELECT * FROM lotes WHERE id = ?").get(req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado." });

  const esDueño = lote.rematador_id === req.usuario.id;
  if (!esDueño && req.usuario.rol !== "administrador") {
    return res.status(403).json({ error: "Solo el rematador dueño del lote o un administrador puede editarlo." });
  }

  const { titulo, descripcion, imagen, cierre, condicion, marcaModelo, material, dimensiones, anio } = req.body;

  // Fix 5: validar cierre si se está actualizando
  let cierreValido = lote.cierre;
  if (cierre !== undefined) {
    const cierreDate = new Date(cierre);
    if (isNaN(cierreDate.getTime())) {
      return res.status(400).json({ error: "La fecha de cierre no es válida." });
    }
    cierreValido = cierreDate.toISOString();
  }

  db.prepare(
    `UPDATE lotes SET titulo = ?, descripcion = ?, imagen = ?, cierre = ?, condicion = ?, marca_modelo = ?, material = ?, dimensiones = ?, anio = ? WHERE id = ?`
  ).run(
    titulo !== undefined ? sanitizarTexto(titulo) : lote.titulo,
    descripcion !== undefined ? sanitizarTexto(descripcion) : lote.descripcion,
    imagen ?? lote.imagen,
    cierreValido,
    condicion !== undefined ? sanitizarTexto(condicion) : lote.condicion,
    marcaModelo !== undefined ? sanitizarTexto(marcaModelo) : lote.marca_modelo,
    material !== undefined ? sanitizarTexto(material) : lote.material,
    dimensiones !== undefined ? sanitizarTexto(dimensiones) : lote.dimensiones,
    anio !== undefined ? sanitizarTexto(anio) : lote.anio,
    lote.id
  );

  avisarActualizacion();
  res.json({ ok: true });
});

// ─── Finalizar lote manualmente ──────────────────────────────────────────────
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

// ─── Eliminar lote ───────────────────────────────────────────────────────────
router.delete("/:id", requireAuth, requireRole("administrador"), (req, res) => {
  // Fix 1: verificar que el lote exista antes de borrar
  const lote = db.prepare("SELECT id FROM lotes WHERE id = ?").get(req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado." });

  db.prepare("DELETE FROM ofertas WHERE lote_id = ?").run(req.params.id);
  db.prepare("DELETE FROM lotes WHERE id = ?").run(req.params.id);
  avisarActualizacion();
  res.json({ ok: true });
});

// ─── Fotos adicionales ───────────────────────────────────────────────────────
router.get("/:id/fotos", (req, res) => {
  const fotos = db.prepare("SELECT id, url FROM fotos_lote WHERE lote_id = ? ORDER BY id").all(req.params.id);
  res.json(fotos);
});

router.post("/:id/fotos", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Falta la URL de la foto." });

  // Fix 6: validar que la URL sea http o https
  if (typeof url !== "string" || !url.startsWith("http")) {
    return res.status(400).json({ error: "La URL de la foto no es válida." });
  }

  // Fix 2: verificar ownership — solo el dueño del lote o un admin puede agregar fotos
  const lote = db.prepare("SELECT rematador_id FROM lotes WHERE id = ?").get(req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado." });
  if (lote.rematador_id !== req.usuario.id && req.usuario.rol !== "administrador") {
    return res.status(403).json({ error: "Solo el rematador dueño del lote o un administrador puede agregarle fotos." });
  }

  const resultado = db.prepare("INSERT INTO fotos_lote (lote_id, url) VALUES (?, ?)").run(req.params.id, url);
  avisarActualizacion();
  res.status(201).json({ id: resultado.lastInsertRowid });
});

// ─── Confirmar pago ──────────────────────────────────────────────────────────
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
  avisarActualizacion();
  res.json({ ok: true });
});

// ─── Eliminar foto ───────────────────────────────────────────────────────────
router.delete("/fotos/:fotoId", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  // Fix 3: verificar ownership antes de borrar la foto
  const foto = db.prepare(
    `SELECT fotos_lote.id, lotes.rematador_id
     FROM fotos_lote JOIN lotes ON lotes.id = fotos_lote.lote_id
     WHERE fotos_lote.id = ?`
  ).get(req.params.fotoId);

  if (!foto) return res.status(404).json({ error: "Foto no encontrada." });
  if (foto.rematador_id !== req.usuario.id && req.usuario.rol !== "administrador") {
    return res.status(403).json({ error: "Solo el rematador dueño del lote o un administrador puede borrar sus fotos." });
  }

  db.prepare("DELETE FROM fotos_lote WHERE id = ?").run(req.params.fotoId);
  avisarActualizacion();
  res.json({ ok: true });
});

// ─── Importar lotes desde Excel ──────────────────────────────────────────────
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
      const numeroFila = indice + 2;
      const numero = String(fila.numero || "").trim();
      const titulo = String(fila.titulo || "").trim();

      // Fix 4: validar precioInicial como número finito positivo
      const precioInicial = Number(fila.precioInicial);
      if (!Number.isFinite(precioInicial) || precioInicial <= 0) {
        errores.push(`Fila ${numeroFila}: el precio inicial no es válido.`);
        return;
      }

      let cierre = null;
      if (typeof fila.cierre === "number") {
        const partes = XLSX.SSF.parse_date_code(fila.cierre);
        if (partes) {
          cierre = new Date(partes.y, partes.m - 1, partes.d, partes.H || 0, partes.M || 0);
        }
      } else {
        const cierreTexto = String(fila.cierre || "").trim();
        if (cierreTexto) cierre = new Date(cierreTexto.replace(" ", "T"));
      }

      if (!numero || !titulo || !cierre || isNaN(cierre.getTime())) {
        errores.push(`Fila ${numeroFila}: faltan datos obligatorios o la fecha no es válida.`);
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
