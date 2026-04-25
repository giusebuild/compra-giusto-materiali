exports.handler = async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, message: 'Metodo non consentito.' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, message: 'Richiesta non valida.' }) };
  }

  const licenseKey = String(payload.licenseKey || '').trim();
  const mode = payload.mode === 'check' ? 'check' : 'activate';
  const productId = process.env.GUMROAD_PRODUCT_ID;

  if (!productId) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, message: 'GUMROAD_PRODUCT_ID non configurato.' }) };
  }

  if (!licenseKey) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, message: 'License key mancante.' }) };
  }

  const body = new URLSearchParams();
  body.append('product_id', productId);
  body.append('license_key', licenseKey);
  body.append('increment_uses_count', mode === 'activate' ? 'true' : 'false');

  try {
    const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      body
    });

    const data = await response.json();

    if (!data.success) {
      return { statusCode: 401, headers, body: JSON.stringify({ ok: false, message: 'License key non valida.' }) };
    }

    const purchase = data.purchase || {};
    if (purchase.refunded || purchase.chargebacked) {
      return { statusCode: 403, headers, body: JSON.stringify({ ok: false, message: 'Questa licenza non è più attiva.' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        license: 'pro',
        uses: data.uses || null,
        email: purchase.email || null,
        productName: purchase.product_name || null
      })
    };
  } catch (error) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, message: 'Verifica Gumroad non riuscita. Riprova tra poco.' }) };
  }
};
