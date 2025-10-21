// /.netlify/functions/send-whatsapp.js
// Corrigido com CORS, validação e retornos padronizados.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    }
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: CORS_HEADERS, body: "Method Not Allowed" };
    }

    const token = process.env.META_WA_TOKEN;
    const phoneId = process.env.PHONE_NUMBER_ID;

    if (!token || !phoneId) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Variáveis de ambiente ausentes" }) };
    }

    const payload = JSON.parse(event.body || "{}");
    const telefone = (payload.clienteTelefone || payload.to || "").toString().replace(/\D/g, "");
    if (!telefone) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Telefone ausente" }) };

    const nome = payload.nome || payload.cliente || "Cliente";
    const obra = payload.obra || "";
    const data = payload.dataEntrega || payload.data_entrega_obra || "";
    const msg = [`Olá, ${nome}!`, obra && `Obra: ${obra}`, data && `Entrega: ${data}`, "Mensagem automática via WhatsApp"].filter(Boolean).join("\n");

    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to: telefone,
      type: "text",
      text: { body: msg },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const dataResp = await resp.json();
    return { statusCode: resp.status, headers: CORS_HEADERS, body: JSON.stringify(dataResp) };
  } catch (e) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: String(e) }) };
  }
}
