const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const carpetaSubidas = process.env.UPLOADS_PATH || path.join(__dirname, "..", "uploads");
if (!fs.existsSync(carpetaSubidas)) fs.mkdirSync(carpetaSubidas, { recursive: true });

const tiposPermitidos = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, carpetaSubidas),
  filename: (req, file, cb) => {
    const sufijo = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // La extensión se decide por el mimetype ya validado, nunca por el
    // nombre de archivo que manda el usuario — evita subir un .svg/.html
    // con contenido ejecutable disfrazado de imagen.
    const extension = tiposPermitidos[file.mimetype] || ".jpg";
    cb(null, `foto-${sufijo}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB máximo por foto
  fileFilter: (req, file, cb) => {
    if (!tiposPermitidos[file.mimetype]) {
      return cb(new Error("Formato no permitido. Usá JPG, PNG, WEBP o GIF."));
    }
    cb(null, true);
  },
});

// Subir una foto — solo rematador o administrador logueados
router.post("/", requireAuth, requireRole("rematador", "administrador"), (req, res) => {
  upload.single("foto")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "No se pudo subir la foto." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió ninguna foto." });
    }
    const url = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    res.status(201).json({ url });
  });
});

module.exports = router;
