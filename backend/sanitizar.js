// Utilidad de sanitización de texto — escapa caracteres HTML peligrosos.
// Úsala en cualquier campo de texto libre antes de guardarlo en la DB.
// No usamos sanitize-html ni DOMPurify para no agregar dependencias —
// para campos de texto plano (sin HTML intencional) esto es suficiente y más seguro.

function sanitizarTexto(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim();
}

module.exports = { sanitizarTexto };
