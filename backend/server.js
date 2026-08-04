require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
const { setIO } = require("./socket");
const db = require("./db");

// Verificación de configuración crítica al arrancar — falla rápido y claro
// en vez de dejar el servidor corriendo de forma insegura.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error("FALTA JWT_SECRET (o es muy corto) en las variables de entorno. El servidor no puede arrancar de forma segura.");
  process.exit(1);
}

let rateLimit;
try {
  rateLimit = require("express-rate-limit");
} catch (e) {
  rateLimit = null;
}

let helmet;
try {
  helmet = require("helmet");
} catch (e) {
  helmet = null;
}

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

// Si no hay ningún administrador todavía y hay credenciales cargadas como
// variables de entorno (útil en hosting sin acceso a consola, como el plan
// gratis de Render), se crea automáticamente al arrancar.
async function crearAdminSiNoExiste() {
  const yaHayAdmin = db.prepare("SELECT id FROM usuarios WHERE rol = 'administrador'").get();
  if (yaHayAdmin) return;

  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  db.prepare("INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'administrador')").run(
    ADMIN_NOMBRE || "Admin",
    ADMIN_EMAIL.toLowerCase(),
    hash
  );
  console.log(`✅ Admin creado automáticamente: ${ADMIN_EMAIL}`);
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

// Detrás del proxy de Railway — necesario para que rate-limit y req.ip
// vean la IP real del cliente en vez de la IP interna del proxy.
app.set("trust proxy", 1);

// Headers de seguridad HTTP (X-Frame-Options, X-Content-Type-Options,
// oculta X-Powered-By, fuerza HTTPS en producción, etc.)
if (helmet) {
  app.use(
    helmet({
      contentSecurityPolicy: false, // el front usa scripts/estilos inline en varios lugares; se puede endurecer más adelante
      crossOriginResourcePolicy: { policy: "cross-origin" }, // permite que las fotos se vean embebidas en WhatsApp/redes
    })
  );
}

// CORS: si hay FRONTEND_ORIGIN configurado, solo se permite ese origen.
// Si no está configurado (fase de prueba), se permite cualquiera pero
// queda un aviso en consola para no olvidarse de restringirlo en producción.
const origenesPermitidos = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(",").map((o) => o.trim())
  : null;
if (!origenesPermitidos) {
  console.warn("FRONTEND_ORIGIN no configurado: CORS abierto a cualquier origen. Configurarlo antes de salir a producción.");
}
app.use(
  cors({
    origin: origenesPermitidos || "*",
  })
);

// Límite de tamaño del body — evita payloads gigantes usados para DoS
app.use(express.json({ limit: "1mb" }));

// Rate limiting
if (rateLimit) {
  // Límite general para toda la API — protege contra scraping agresivo y DoS básico
  const limiteGeneral = rateLimit.rateLimit({
    windowMs: 60 * 1000, max: 120,
    message: { error: "Demasiadas solicitudes. Esperá un momento." },
    standardHeaders: true, legacyHeaders: false,
  });
  app.use("/api", limiteGeneral);

  const limiteOfertas = rateLimit.rateLimit({
    windowMs: 60 * 1000, max: 10,
    message: { error: "Demasiadas ofertas. Esperá un momento." },
    standardHeaders: true, legacyHeaders: false,
  });
  const limiteAuth = rateLimit.rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    message: { error: "Demasiados intentos. Probá en unos minutos." },
    standardHeaders: true, legacyHeaders: false,
  });
  app.use("/api/ofertas", limiteOfertas);
  app.use("/api/auth/registro", limiteAuth);
  app.use("/api/auth/login", limiteAuth);

  // Envían emails a terceros — límite estricto para que no se use el
  // formulario como relay de spam hacia cualquier dirección de email.
  const limiteEmail = rateLimit.rateLimit({
    windowMs: 60 * 60 * 1000, max: 5,
    message: { error: "Demasiados envíos. Probá de nuevo más tarde." },
    standardHeaders: true, legacyHeaders: false,
  });
  app.use("/api/contacto", limiteEmail);
  app.use("/api/newsletter/suscribir", limiteEmail);
}

app.get("/api/salud", (req, res) => res.json({ ok: true }));

// Sitemap XML para Google
app.get("/sitemap.xml", (req, res) => {
  const lotes = db.prepare("SELECT id, titulo, creado_en FROM lotes WHERE estado = 'activa'").all();
  const base = process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get("host")}`;
  const urls = [
    `<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...lotes.map(l => `<url><loc>${base}/lote/${l.id}</loc><lastmod>${l.creado_en.split("T")[0]}</lastmod><changefreq>hourly</changefreq><priority>0.8</priority></url>`)
  ].join("\n");
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
});

// Open Graph dinámico para /lote/:id — el crawler de WhatsApp/Facebook recibe este HTML
app.get("/lote/:id", (req, res) => {
  const lote = db.prepare(`
    SELECT lotes.*, remates.titulo AS remate_titulo, remates.moneda AS remate_moneda
    FROM lotes JOIN remates ON remates.id = lotes.remate_id
    WHERE lotes.id = ?
  `).get(req.params.id);

  const base = process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get("host")}`;
  const carpetaFrontend = path.join(__dirname, "..");

  if (!lote) return res.sendFile(path.join(carpetaFrontend, "index.html"));

  const moneda = lote.remate_moneda === "USD" ? "US$" : "$";
  const precio = `${moneda} ${Number(lote.oferta_actual).toLocaleString("es-UY")}`;
  const imagen = lote.imagen || null;
  const titulo = `${lote.titulo} — Lote ${lote.numero}`;
  const descripcion = `${lote.cantidad_ofertas > 0 ? `Oferta actual: ${precio}` : `Precio inicial: ${precio}`} · ${lote.remate_titulo} · ¿Quién Da Más? Canal 10`;
  const urlCanonica = `${base}/lote/${lote.id}`;

  // Página completa con estilos inline — funciona en el browser de WhatsApp
  const html = `<!DOCTYPE html>
<html lang="es-UY">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo} — ¿Quién Da Más?</title>
<meta name="description" content="${descripcion}">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${descripcion}">
${imagen ? `<meta property="og:image" content="${imagen}">` : ""}
<meta property="og:url" content="${urlCanonica}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="¿Quién Da Más? — Canal 10 Uruguay">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${urlCanonica}">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #F7F5F0; color: #1A1612; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 1rem; }
  .card { background: #fff; border-radius: 16px; overflow: hidden; max-width: 28rem; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
  .foto { width: 100%; aspect-ratio: 16/10; object-fit: cover; display: block; background: #F0EDE8; }
  .foto-placeholder { width: 100%; aspect-ratio: 16/10; background: linear-gradient(145deg, #F0EDE8, #E8E3DC); display: flex; align-items: center; justify-content: center; font-size: 3rem; }
  .cuerpo { padding: 1.25rem; }
  .badge { display: inline-block; background: #1A3A6B; color: #fff; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 0.2rem 0.55rem; border-radius: 4px; margin-bottom: 0.75rem; }
  h1 { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.75rem; line-height: 1.3; }
  .etiqueta { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6B5F52; margin-bottom: 0.2rem; }
  .precio { font-size: 1.8rem; font-weight: 800; color: #1A3A6B; letter-spacing: -0.02em; margin-bottom: 0.5rem; }
  .ofertas { font-size: 0.82rem; color: #6B5F52; margin-bottom: 1.25rem; }
  .btn { display: block; width: 100%; padding: 0.9rem; background: #1A3A6B; color: #fff; text-align: center; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 1rem; }
  .marca { text-align: center; margin-top: 1.25rem; font-size: 0.8rem; color: #6B5F52; }
  .marca strong { color: #1A3A6B; }
</style>
</head>
<body>
<div class="card">
  ${imagen ? `<img class="foto" src="${imagen}" alt="${lote.titulo}">` : `<div class="foto-placeholder">🔨</div>`}
  <div class="cuerpo">
    <span class="badge">Lote ${lote.numero}</span>
    <h1>${lote.titulo}</h1>
    <p class="etiqueta">${lote.cantidad_ofertas > 0 ? "Oferta actual" : "Precio inicial"}</p>
    <p class="precio">${precio}</p>
    <p class="ofertas">${lote.cantidad_ofertas === 1 ? "1 oferta" : `${lote.cantidad_ofertas} ofertas`} · ${lote.remate_titulo}</p>
    <a class="btn" href="${urlCanonica}">Ver lote y ofertar →</a>
  </div>
</div>
<p class="marca"><strong>¿Quién Da Más?</strong> · Canal 10 Uruguay · Sábados 11:55hs</p>
</body>
</html>`;

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
const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsDir));

// Servir el frontend (index.html, styles.css, script.js, fotos/) desde el
// mismo servidor, así al desplegar es un solo lugar y no hace falta CORS.
const carpetaFrontend = path.join(__dirname, "..");
app.use(express.static(carpetaFrontend));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(carpetaFrontend, "index.html"));
});

app.use((req, res) => { if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Ruta no encontrada.' }); res.status(404).sendFile(path.join(__dirname, '..', 'index.html')); });

// Manejo de errores no capturados, para no exponer detalles internos
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

const PORT = process.env.PORT || 3000;
const servidorHttp = http.createServer(app);
const io = new Server(servidorHttp, {
  cors: { origin: origenesPermitidos || "*" },
});
setIO(io);

servidorHttp.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});

// ===== Cierre automático de lotes =====
// Cada minuto revisa si hay lotes cuya fecha de cierre ya pasó
// y los finaliza automáticamente asignando el ganador.
function cerrarLotesVencidos() {
  const ahora = new Date().toISOString();
  const lotesVencidos = db.prepare(
    `SELECT * FROM lotes WHERE estado = 'activa' AND cierre <= ?`
  ).all(ahora);

  if (lotesVencidos.length === 0) return;

  lotesVencidos.forEach((lote) => {
    const mejorOferta = db.prepare(
      `SELECT usuario_id, monto FROM ofertas WHERE lote_id = ? ORDER BY monto DESC, id DESC LIMIT 1`
    ).get(lote.id);

    db.prepare(
      `UPDATE lotes SET estado = 'finalizada', ganador_id = ? WHERE id = ?`
    ).run(mejorOferta ? mejorOferta.usuario_id : null, lote.id);

    console.log(`Lote #${lote.numero} "${lote.titulo}" cerrado automáticamente. Ganador: ${mejorOferta ? `usuario ${mejorOferta.usuario_id} con $${mejorOferta.monto}` : "sin ofertas"}`);
  });

  if (lotesVencidos.length > 0) {
    const { avisarActualizacion } = require("./socket");
    avisarActualizacion();
  }
}

// Ejecutar al arrancar y luego cada minuto
cerrarLotesVencidos();
setInterval(cerrarLotesVencidos, 60 * 1000);
