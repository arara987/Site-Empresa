// /.netlify/functions/send-whatsapp.js
// Netlify Functions (Node 18+) já tem "fetch" global habilitado.

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const token = process.env.META_WA_TOKEN;
    const phoneId = process.env.PHONE_NUMBER_ID;

    if (!token || !phoneId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Variáveis de ambiente ausentes: META_WA_TOKEN/PHONE_NUMBER_ID" })
      };
    }

    const payload = JSON.parse(event.body || "{}");
    const { to, templateName = "lembrete_manutencao", params = [], type = "template", text } = payload;

    if (!to) {
      return { statusCode: 400, body: JSON.stringify({ error: "Informe 'to' no formato +55DDDNÚMERO" }) };
    }

    // Monta o corpo da mensagem
    let body;
    if (type === "text") {
      // OBS: só funciona se a conversa estiver dentro da janela de 24h.
      if (!text) {
        return { statusCode: 400, body: JSON.stringify({ error: "Para type='text', envie o campo 'text'." }) };
      }
      body = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: String(text) }
      };
    } else {
      // Template para iniciar conversa fora da janela de 24h
      body = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: "pt_BR" },
          ...(params.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: params.map((p) => ({ type: "text", text: String(p) }))
                  }
                ]
              }
            : {})
        }
      };
    }

    const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify(data) };
    }

    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
}
