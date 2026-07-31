const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "remate.sqlite");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('publico', 'rematador', 'administrador')),
    cedula TEXT,
    aprobado INTEGER NOT NULL DEFAULT 1,
    email_verificado INTEGER NOT NULL DEFAULT 1,
    bloqueado INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS remates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    rubro TEXT NOT NULL,
    descripcion TEXT,
    moneda TEXT NOT NULL DEFAULT 'UYU' CHECK (moneda IN ('UYU', 'USD')),
    rematador_id INTEGER NOT NULL REFERENCES usuarios(id),
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remate_id INTEGER NOT NULL REFERENCES remates(id),
    numero TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    imagen TEXT,
    precio_inicial NUMERIC NOT NULL,
    oferta_actual NUMERIC NOT NULL,
    cierre TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'finalizada')),
    rematador_id INTEGER NOT NULL REFERENCES usuarios(id),
    ganador_id INTEGER REFERENCES usuarios(id),
    condicion TEXT,
    marca_modelo TEXT,
    material TEXT,
    dimensiones TEXT,
    anio TEXT,
    pago_confirmado INTEGER,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ofertas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL REFERENCES lotes(id),
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    monto NUMERIC NOT NULL,
    fecha TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ofertas_automaticas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL REFERENCES lotes(id),
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    monto_maximo NUMERIC NOT NULL,
    activa INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(lote_id, usuario_id)
  );

  CREATE TABLE IF NOT EXISTS fotos_lote (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL REFERENCES lotes(id),
    url TEXT NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recuperaciones_password (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    token TEXT NOT NULL UNIQUE,
    expira TEXT NOT NULL,
    usado INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS codigos_verificacion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    codigo TEXT NOT NULL,
    expira TEXT NOT NULL,
    usado INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migración simple: si la base de datos ya existía de una versión anterior
// (sin esta columna), se la agrega ahora en vez de fallar.
const columnasRemates = db.prepare("PRAGMA table_info(remates)").all().map((c) => c.name);
if (!columnasRemates.includes("moneda")) {
  db.exec("ALTER TABLE remates ADD COLUMN moneda TEXT NOT NULL DEFAULT 'UYU'");
}

const columnasLotes = db.prepare("PRAGMA table_info(lotes)").all().map((c) => c.name);
["condicion", "marca_modelo", "material", "dimensiones", "anio", "pago_confirmado"].forEach((columna) => {
  if (!columnasLotes.includes(columna)) {
    db.exec(`ALTER TABLE lotes ADD COLUMN ${columna} TEXT`);
  }
});

const columnasUsuarios = db.prepare("PRAGMA table_info(usuarios)").all().map((c) => c.name);
if (!columnasUsuarios.includes("cedula")) {
  db.exec("ALTER TABLE usuarios ADD COLUMN cedula TEXT");
}
if (!columnasUsuarios.includes("aprobado")) {
  // Los usuarios que ya existían (antes de este cambio) quedan aprobados
  // automáticamente, para no dejar a nadie afuera de golpe.
  db.exec("ALTER TABLE usuarios ADD COLUMN aprobado INTEGER NOT NULL DEFAULT 1");
}
if (!columnasUsuarios.includes("email_verificado")) {
  db.exec("ALTER TABLE usuarios ADD COLUMN email_verificado INTEGER NOT NULL DEFAULT 1");
}
if (!columnasUsuarios.includes("bloqueado")) {
  db.exec("ALTER TABLE usuarios ADD COLUMN bloqueado INTEGER NOT NULL DEFAULT 0");
}

module.exports = db;
