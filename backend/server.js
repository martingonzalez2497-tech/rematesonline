require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
const { setIO } = require("./socket");
const db = require("./db");

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

async function crearAdminSiNoExiste() {
  const yaHayAdmin = db.prepare("SELECT id FROM usuarios WHERE rol = 'administrador'").get();
  if (yaHayAdmin) return;
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  db.prepare("INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'administrador')").run(
    ADMIN_NOMBRE || "Admin", ADMIN_EMAIL.toLowerCase(), hash
  );
  console.log(`Admin creado: ${ADMIN_EMAIL}`);
}
crearAdminSiNoExiste();

const authRoutes = require("./routes/auth");
const lotesRoutes = require("./routes/lotes");
const remateRoutes = require("./routes/remates");
const ofertasRoutes = require("./routes/ofertas");
const usuariosRoutes = require("./routes/usuarios");
const uploadsRoutes = require("./routes/uploads");
const newsletterRoutes = require("./routes/newsletter");
const contactoRoutes = require("./routes/contacto");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
app.use(express.json());

app.get("/api/salud", (req, res) => res.json({ ok: true }));

app.get("/sitemap.xml", (req, res) => {
  const lotes = db.prepare("SELECT id, titulo, creado_en FROM lotes WHERE estado = 'activa'").all();
  const base = process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get("host")}`;
  const urls = [
    `<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...lotes.map(l => `<url><loc>${base}/lote/${l.id}</loc><lastmod>${l.creado_en.split("T")[0]}</lastmod><changefreq>hourly</changefreq><priority>0.8</priority></url>`)
  ].join("\n");
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
});

app.get("/lote/:id", (req, res) => {
  const lote = db.prepare(`SELECT lotes.*, remates.titulo AS remate_titulo, remates.moneda AS remate_moneda FROM lotes JOIN remates ON remates.id = lotes.remate_id WHERE lotes.id = ?`).get(req.params.id);
  const base = process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get("host")}`;
  const path = require("path");
  const carpetaFrontend = path.join(__dirname, "..");
  if (!lote) return res.sendFile(path.join(carpetaFrontend, "index.html"));
  const moneda = lote.remate_moneda === "USD" ? "US$" : "$";
  const precio = `${moneda} ${Number(lote.oferta_actual).toLocaleString("es-UY")}`;
  const imagen = lote.imagen || `${base}/fotos/og-default.png`;
  const titulo = `${lote.titulo} - Lote ${lote.numero}`;
  const descripcion = `${lote.cantidad_ofertas > 0 ? "Oferta actual: " + precio : "Precio inicial: " + precio} - ${lote.remate_titulo}`;
  const fs = require("fs");
  let html = fs.readFileSync(path.join(carpetaFrontend, "index.html"), "utf8");
  const ogTags = `<meta property="og:title" content="${titulo}"><meta property="og:description" content="${descripcion}"><meta property="og:image" content="${imagen}"><meta property="og:url" content="${base}/lote/${lote.id}"><meta property="og:type" content="website"><title>${titulo} - Remate Directo</title>`;
  html = html.replace("<title>Remate Directo - Subastas en Línea</title>", ogTags);
  res.type("text/html").send(html);
});

app.use("/api/auth", authRoutes);
app.use("/api/remates", remateRoutes);
app.use("/api/lotes", lotesRoutes);
app.use("/api/ofertas", ofertasRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/contacto", contactoRoutes);

const path = require("path");
const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsDir));
const carpetaFrontend = path.join(__dirname, "..");
app.use(express.static(carpetaFrontend));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(carpetaFrontend, "index.html"));
});

app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada." }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

const PORT = process.env.PORT || 3000;
const servidorHttp = http.createServer(app);
const io = new Server(servidorHttp, { cors: { origin: process.env.FRONTEND_ORIGIN || "*" } });
setIO(io);
servidorHttp.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});
