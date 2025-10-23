// netlify/functions/send-whatsapp.js  (CommonJS + CORS)
const CORS = {
  "Access-Control-Allow-Origin": "*",           // troque pelo seu domínio em prod
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: CORS, body: "" };
    }
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: CORS, body: "Method Not Allowed" };
    }

    const token   = process.env.META_WA_TOKEN;
    const phoneId = process.env.PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Variáveis ausentes" }) };
    }

    let payload = {};
    try { payload = JSON.parse(event.body || "{}"); } catch {}
    const telefone   = (payload.clienteTelefone || payload.to || "").toString().replace(/\D/g, "");
    const nome       = (payload.nome || payload.cliente || "Cliente").toString();
    const obra       = (payload.obra || "").toString();
    const descricao  = (payload.descricao || "").toString();
    const data       = (payload.dataEntrega || payload.data_entrega_obra || "").toString();

    if (!telefone) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Telefone ausente" }) };
    }

    const msg = [
      `Olá, ${nome}!`,
      obra && `Obra: ${obra}`,
      descricao && `Descrição: ${descricao}`,
      data && `Entrega: ${data}`,
      "Mensagem automática via WhatsApp",
    ].filter(Boolean).join("\n");

    const url  = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
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
    return { statusCode: resp.status, headers: CORS, body: JSON.stringify(dataResp) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(e) }) };
  }
};
