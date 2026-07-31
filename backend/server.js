require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { setIO } = require("./socket");

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

const authRoutes = require("./routes/auth");
const lotesRoutes = require("./routes/lotes");
const remateRoutes = require("./routes/remates");
const ofertasRoutes = require("./routes/ofertas");
const usuariosRoutes = require("./routes/usuarios");
const uploadsRoutes = require("./routes/uploads");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
app.use(express.json());

app.get("/api/salud", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/remates", remateRoutes);
app.use("/api/lotes", lotesRoutes);
app.use("/api/ofertas", ofertasRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/uploads", uploadsRoutes);
const path = require("path");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Servir el frontend (index.html, styles.css, script.js, fotos/) desde el
// mismo servidor, así al desplegar es un solo lugar y no hace falta CORS.
const carpetaFrontend = path.join(__dirname, "..");
app.use(express.static(carpetaFrontend));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(carpetaFrontend, "index.html"));
});

app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

// Manejo de errores no capturados, para no exponer detalles internos
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

const PORT = process.env.PORT || 3000;
const servidorHttp = http.createServer(app);
const io = new Server(servidorHttp, {
  cors: { origin: process.env.FRONTEND_ORIGIN || "*" },
});
setIO(io);

servidorHttp.listen(PORT, () => {
  console.log(`Backend de Remate Directo escuchando en http://localhost:${PORT}`);
});
