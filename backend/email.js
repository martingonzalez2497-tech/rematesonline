// Envía emails reales usando Resend (https://resend.com — plan gratis: 3.000
// emails/mes). Si todavía no configuraste RESEND_API_KEY en tu .env, cae
// automáticamente a imprimir el mensaje en la consola, para que el resto
// del sitio siga funcionando en desarrollo sin necesitar la cuenta ya.
async function enviarEmail({ para, asunto, texto }) {
  const apiKey = process.env.RESEND_API_KEY;
  const desde = process.env.RESEND_FROM || "Remate Directo <onboarding@resend.dev>";

  if (!apiKey) {
    console.log("\n=== EMAIL (simulado, sin RESEND_API_KEY configurada) ===");
    console.log(`Para: ${para}`);
    console.log(`Asunto: ${asunto}`);
    console.log(texto);
    console.log("=========================================================\n");
    return { simulado: true };
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: desde,
        to: [para],
        subject: asunto,
        text: texto,
      }),
    });

    if (!resp.ok) {
      const detalle = await resp.text();
      console.error("No se pudo enviar el email por Resend:", detalle);
      return { error: true };
    }
    return { ok: true };
  } catch (err) {
    console.error("Error de red al enviar email por Resend:", err.message);
    return { error: true };
  }
}

module.exports = { enviarEmail };
