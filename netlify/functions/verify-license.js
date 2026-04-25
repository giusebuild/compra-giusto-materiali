
const { webcrypto } = require('crypto');

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(payload)
  };
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlJson(obj) {
  return base64Url(Buffer.from(JSON.stringify(obj), 'utf8'));
}

async function sha256Base64Url(value) {
  const digest = await webcrypto.subtle.digest('SHA-256', Buffer.from(String(value), 'utf8'));
  return base64Url(Buffer.from(digest));
}

async function signCertificate(payload) {
  if (!process.env.LICENSE_PRIVATE_JWK) {
    throw new Error('LICENSE_PRIVATE_JWK non configurata.');
  }

  const jwk = JSON.parse(process.env.LICENSE_PRIVATE_JWK);
  const key = await webcrypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const payloadPart = base64UrlJson(payload);
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    Buffer.from(payloadPart, 'utf8')
  );

  return `${payloadPart}.${base64Url(Buffer.from(signature))}`;
}

async function verifyOnGumroad(licenseKey) {
  const productId = process.env.GUMROAD_PRODUCT_ID;
  if (!productId) {
    throw new Error('GUMROAD_PRODUCT_ID non configurato.');
  }

  const body = new URLSearchParams();
  body.append('product_id', productId);
  body.append('license_key', licenseKey);
  body.append('increment_uses_count', String(process.env.GUMROAD_INCREMENT_USES || 'false'));

  const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.success) {
    return { ok: false, message: 'License key non valida.' };
  }

  const purchase = data.purchase || {};
  if (purchase.refunded || purchase.chargebacked || purchase.disputed) {
    return { ok: false, message: 'Questa licenza non è più attiva.' };
  }

  const maxUses = Number(process.env.MAX_LICENSE_USES || 0);
  if (maxUses > 0 && Number(data.uses || 0) > maxUses) {
    return { ok: false, message: 'Limite attivazioni raggiunto.' };
  }

  return { ok: true, data, purchase };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Metodo non consentito.' });

  try {
    const request = JSON.parse(event.body || '{}');
    const licenseKey = String(request.licenseKey || '').trim();

    if (!licenseKey) {
      return json(400, { ok: false, message: 'Inserisci una license key.' });
    }

    const gumroad = await verifyOnGumroad(licenseKey);
    if (!gumroad.ok) {
      return json(400, gumroad);
    }

    const days = Math.max(1, Number(process.env.LICENSE_CERT_DAYS || 60));
    const now = new Date();
    const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const purchase = gumroad.purchase;
    const data = gumroad.data;

    const payload = {
      iss: 'compragiusto-materiali',
      status: 'pro',
      productId: process.env.GUMROAD_PRODUCT_ID,
      licenseHash: await sha256Base64Url(licenseKey),
      email: purchase.email || null,
      purchaseId: purchase.id || null,
      uses: data.uses || 0,
      issuedAt: now.toISOString(),
      expiresAt: expires.toISOString()
    };

    const certificate = await signCertificate(payload);

    return json(200, {
      ok: true,
      certificate,
      expiresAt: payload.expiresAt,
      email: payload.email
    });
  } catch (error) {
    console.error(error);
    return json(500, {
      ok: false,
      message: error.message || 'Errore verifica licenza.'
    });
  }
};
