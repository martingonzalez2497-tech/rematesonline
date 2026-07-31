let ioInstance = null;

function setIO(io) {
  ioInstance = io;
}

// Aviso genérico de "algo cambió" — el frontend, al recibirlo, vuelve a pedir
// los lotes/remates actualizados. Más simple y menos propenso a bugs que
// armar un payload distinto para cada tipo de cambio.
function avisarActualizacion() {
  if (ioInstance) ioInstance.emit("actualizar");
}

module.exports = { setIO, avisarActualizacion };
