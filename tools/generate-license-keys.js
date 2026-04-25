#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');

async function main() {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const privateJwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);

  console.log('\nCopia questa variabile su Netlify:\n');
  console.log('LICENSE_PRIVATE_JWK=' + JSON.stringify(privateJwk));
  console.log('\nLa public key NON è segreta. Va nella PWA.\n');

  if (process.argv.includes('--write')) {
    const file = path.join(__dirname, '..', 'license-public-key.js');
    const content = `// Public key used by the browser to verify signed Pro certificates.\n// Generated at ${new Date().toISOString()}.\n// This key is public: keep LICENSE_PRIVATE_JWK only on Netlify.\nwindow.COMPRA_GIUSTO_LICENSE_PUBLIC_JWK = ${JSON.stringify(publicJwk, null, 2)};\n`;
    fs.writeFileSync(file, content);
    console.log('Aggiornato: license-public-key.js');
  } else {
    console.log('Per aggiornare automaticamente license-public-key.js esegui:');
    console.log('node tools/generate-license-keys.js --write\n');
    console.log('Public JWK:');
    console.log(JSON.stringify(publicJwk, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
