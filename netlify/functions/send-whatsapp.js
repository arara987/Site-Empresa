const REQUIRED_ENV_VARS = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'];

function buildErrorResponse(statusCode, message) {
  return {
    statusCode,
    body: JSON.stringify({ error: message }),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  };
}

function normalizarTelefoneBrasil(telefone) {
  if (!telefone) return null;
  const numeros = telefone.replace(/\D/g, '');
  if (!numeros) return null;

  if (numeros.startsWith('55')) {
    return numeros;
  }

  if (numeros.length === 10 || numeros.length === 11) {
    return `55${numeros}`;
  }

  return numeros;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return buildErrorResponse(405, 'Method not allowed.');
  }

  try {
    const missingVar = REQUIRED_ENV_VARS.find((key) => !process.env[key]);
    if (missingVar) {
      console.warn(`Missing environment variable: ${missingVar}`);
      return buildErrorResponse(500, 'WhatsApp configuration is incomplete.');
    }

    const { clienteNome, clienteTelefone, obraDescricao, dataEntrega } = JSON.parse(event.body || '{}');

    if (!clienteNome || !clienteTelefone || !obraDescricao) {
      return buildErrorResponse(400, 'Missing required fields.');
    }

    const telefoneNormalizado = normalizarTelefoneBrasil(clienteTelefone);
    if (!telefoneNormalizado) {
      return buildErrorResponse(400, 'Telefone inválido.');
    }

    const bodyText = [
      `Olá ${clienteNome}, tudo bem?`,
      'A Belfort Engenharia acaba de cadastrar uma nova obra em seu nome.',
      `Projeto: ${obraDescricao}.`,
      dataEntrega ? `Previsão de entrega: ${dataEntrega}.` : null,
      'Entraremos em contato em breve com mais detalhes.',
    ]
      .filter(Boolean)
      .join('\n');

    const endpoint = process.env.WHATSAPP_API_URL || `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefoneNormalizado,
        type: 'text',
        text: { body: bodyText },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('WhatsApp API error:', errorText);
      return buildErrorResponse(response.status, 'Erro ao enviar mensagem pelo WhatsApp.');
    }

    const result = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, result }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    };
  } catch (error) {
    console.error('Unexpected error sending WhatsApp message:', error);
    return buildErrorResponse(500, 'Erro interno ao enviar mensagem.');
  }
};
