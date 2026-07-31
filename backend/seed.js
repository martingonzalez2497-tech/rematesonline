require("dotenv").config();
const readline = require("readline");
const bcrypt = require("bcryptjs");
const db = require("./db");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pregunta = (texto) => new Promise((resolve) => rl.question(texto, resolve));

async function main() {
  console.log("== Crear el primer administrador ==\n");

  const nombre = await pregunta("Nombre: ");
  const email = (await pregunta("Email: ")).toLowerCase();
  const password = await pregunta("Contraseña (mínimo 6 caracteres): ");

  rl.close();

  if (!nombre || !email || !password || password.length < 6) {
    console.error("\nDatos inválidos. Cancelado.");
    process.exit(1);
  }

  const existente = db.prepare("SELECT id FROM usuarios WHERE email = ?").get(email);
  if (existente) {
    console.error("\nYa existe un usuario con ese email.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  db.prepare(
    "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'administrador')"
  ).run(nombre, email, hash);

  console.log(`\nListo. Administrador "${nombre}" (${email}) creado correctamente.`);
}

main();
