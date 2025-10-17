// netlify/functions/send-whatsapp.js
import admin from "firebase-admin";

// ✅ Inicializa Firebase uma vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

// ✅ Variáveis de ambiente do Netlify
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// 🔹 Função pra converter telefone pra formato +55DDDNÚMERO
function toE164(num) {
  const d = String(num || "").replace(/\D/g, "");
  if (!d) return null;
  return d.startsWith("55") ? `+${d}` : `+55${d}`;
}

// 🔹 Formata datas (de "DD/MM/AAAA" ou ISO)
function parseDataFlex(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

// 🔹 Faz a chamada pro Graph API
async function callWA(payload) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(txt || `HTTP ${r.status}`);
  return txt;
}

// 🔹 1) Envia TEMPLATE pra iniciar conversa
async function sendTemplate(to) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "hello_world", // 🧩 Troque pelo seu template quando tiver aprovado
      language: { code: "en_US" }, // ou pt_BR se o template for em português
    },
  };
  return callWA(payload);
}

// 🔹 2) Envia a mensagem com detalhes da obra
async function sendText(to, titulo, body) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: `*${titulo}*\n${body}` },
  };
  return callWA(payload);
}

// 🧩 Função principal do Netlify
export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST")
      return { statusCode: 405, body: "Method Not Allowed" };

    const data = JSON.parse(event.body || "{}");
    const { obraId, clienteId, descricao, data_entrega_obra, sistemas } = data;

    if (!clienteId)
      return { statusCode: 400, body: "clienteId obrigatório" };

    // ✅ Busca cliente no Firestore
    const cliSnap = await db.collection("clientes").doc(clienteId).get();
    if (!cliSnap.exists)
      return { statusCode: 404, body: "Cliente não encontrado" };

    const cliente = cliSnap.data();
    const telefone = toE164(cliente.telefone);
    if (!telefone)
      return { statusCode: 400, body: "Telefone inválido" };

    const nome = cliente.nome || "Cliente";
    const entregaISO = parseDataFlex(data_entrega_obra);
    const entregaBR = entregaISO ? entregaISO.split("-").reverse().join("/") : "—";
    const s0 = Array.isArray(sistemas) && sistemas.length ? sistemas[0] : null;
    const manuISO = s0?.data_manutencao ? parseDataFlex(s0.data_manutencao) : null;
    const manuBR = manuISO ? manuISO.split("-").reverse().join("/") : "—";

    // ✅ Monta texto
    const titulo = "Obra cadastrada";
    const msg =
      `Olá ${nome}! 👷‍♂️\n` +
      `Sua obra *${descricao || "—"}* foi cadastrada pela *Belfort Engenharia*.\n` +
      `Data de entrega: *${entregaBR}*.` +
      (manuBR && s0?.nome ? `\nManutenção preventiva do sistema *${s0.nome}*: *${manuBR}*.` : "") +
      `\nQualquer dúvida, estamos à disposição.`;

    // ✅ Envia TEMPLATE pra abrir conversa
    await sendTemplate(telefone);

    // ✅ Envia mensagem com os dados
    await sendText(telefone, titulo, msg);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, obraId }),
    };
  } catch (e) {
    console.error("[send-whatsapp] Erro:", e.message);
    return {
      statusCode: 500,
      body: e.message || "Erro interno",
    };
  }
};
