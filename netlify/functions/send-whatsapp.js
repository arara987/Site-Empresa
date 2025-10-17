// netlify/functions/wa-obra-created.js
import admin from "firebase-admin";

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

const WHATSAPP_TOKEN   = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID  = process.env.PHONE_NUMBER_ID;

function toE164(num) {
  const d = String(num || "").replace(/\D/g, "");
  if (!d) return null;
  return d.startsWith("55") ? `+${d}` : `+55${d}`;
}
function parseDataFlex(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0,10);
}

async function callWA(payload) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(txt || `HTTP ${r.status}`);
  return txt;
}

// 1) envia TEMPLATE para iniciar conversa
async function sendTemplate(to, obraDesc, entregaBR) {
  // Use um template aprovado. Para testar já, use o default "hello_world" (en_US).
  // Depois você pode trocar para um template seu, ex: "obra_cadastrada_belfort" (pt_BR).
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "obra_cadastrada_belfort",
language: { code: "pt_BR" },
components: [{
  type: "body",
  parameters: [
    { type: "text", text: descricao || "—" },
    { type: "text", text: entregaBR }
  ]
}]

    }
  };
  return callWA(payload);
}

// 2) opcional: depois do template, manda um texto com detalhes
async function sendText(to, titulo, body) {
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: `*${titulo}*\n${body}` }
  };
  return callWA(payload);
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST")
      return { statusCode: 405, body: "Method Not Allowed" };

    const { obraId, clienteId, descricao, data_entrega_obra, sistemas } = JSON.parse(event.body || "{}");
    if (!clienteId) return { statusCode: 400, body: "clienteId obrigatório" };

    // 0) sanity check env
    for (const v of ["WHATSAPP_TOKEN","PHONE_NUMBER_ID","FIREBASE_PROJECT_ID","FIREBASE_CLIENT_EMAIL","FIREBASE_PRIVATE_KEY"]) {
      if (!process.env[v]) return { statusCode: 500, body: `Variável de ambiente ausente: ${v}` };
    }

    // 1) cliente
    const cli = await db.collection("clientes").doc(clienteId).get();
    if (!cli.exists) return { statusCode: 404, body: "Cliente não encontrado" };
    const c = cli.data();
    const to = toE164(c?.telefone);
    const nome = c?.nome || "Cliente";
    if (!to) return { statusCode: 400, body: "Telefone inválido" };

    // 2) montar texto (para a segunda mensagem)
    const s0 = Array.isArray(sistemas) && sistemas.length ? sistemas[0] : null;
    const entregaISO = parseDataFlex(data_entrega_obra);
    const entregaBR  = entregaISO ? entregaISO.split("-").reverse().join("/") : "—";
    const manuISO    = s0?.data_manutencao ? parseDataFlex(s0.data_manutencao) : null;
    const manuBR     = manuISO ? manuISO.split("-").reverse().join("/") : null;

    const titulo = "Obra cadastrada";
    const msg =
      `Olá ${nome}! 👷‍♂️\n` +
      `Sua obra *${descricao || "—"}* foi cadastrada pela *Belfort Engenharia*.\n` +
      `Data de entrega: *${entregaBR}*.` +
      (manuBR ? `\nManutenção preventiva do sistema *${s0?.nome || "—"}*: *${manuBR}*.` : "") +
      `\nQualquer ajuste, responda esta mensagem.`;

    // 3) Enviar TEMPLATE primeiro (inicia a conversa)
    await sendTemplate(to, descricao || "—", entregaBR);

    // 4) (opcional) Em seguida, o texto detalhado
    await sendText(to, titulo, msg);

    return { statusCode: 200, body: JSON.stringify({ ok: true, obraId }) };
  } catch (e) {
    console.error("[wa-obra-created] erro:", e.message);
    return { statusCode: 500, body: e.message || "Erro interno" };
  }
};
