# CompraGiusto Materiali PWA

PWA unica Free/Pro con sblocco tramite license key Gumroad.

## Cosa contiene

- `index.html`
- `styles.css`
- `app.js`
- `license-public-key.js`
- `manifest.webmanifest`
- `sw.js`
- `icons/`
- `netlify/functions/verify-license.js`
- `tools/generate-license-keys.js`

## Avvio locale semplice

```bash
python3 -m http.server 3000
```

Apri:

```text
http://localhost:3000
```

In locale puoi testare UI, calcoli, limite Free, archivio e modal Pro.
La verifica reale della license key richiede Netlify Functions.

## Genera chiavi licenza

Serve una coppia ECDSA:

```bash
node tools/generate-license-keys.js --write
```

Il comando:
1. stampa `LICENSE_PRIVATE_JWK` da mettere su Netlify;
2. aggiorna `license-public-key.js` con la public key.

La public key può stare nella PWA. La private key deve stare solo su Netlify.

## Variabili Netlify

Imposta:

```text
GUMROAD_PRODUCT_ID=il_product_id_gumroad
LICENSE_PRIVATE_JWK=valore_generato_dal_tool
GUMROAD_INCREMENT_USES=false
MAX_LICENSE_USES=0
LICENSE_CERT_DAYS=60
```

Poi redeploy.

## Link Gumroad

In `app.js`, cambia:

```js
gumroadUrl: 'https://gumroad.com/l/compra-giusto-materiali'
```

con il tuo link reale.

## Test con Netlify CLI

```bash
npm install -g netlify-cli
netlify dev
```

## Deploy

```bash
git add .
git commit -m "Aggiorna CompraGiusto Materiali"
git push
```

Netlify farà il deploy automatico se il repo è collegato.

## Aggiornamenti

Ogni update importante cambia versione cache in `sw.js`:

```js
const CACHE_NAME = 'compra-giusto-materiali-v3-0-1';
```

Altrimenti il service worker può servire file vecchi.
