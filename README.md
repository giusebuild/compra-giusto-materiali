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
LICENSE_CERT_DAYS=3650
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

## Form feedback, richieste e strumenti in arrivo

Nel tab **Strumenti** ci sono card per prodotti collegati e una sezione **Segnala o richiedi**.

Per collegare un form unico, crea un modulo Tally / Google Form / Typeform con questi campi consigliati:

- tipo richiesta: problema, strumento in arrivo, nuova app, feedback
- strumento: CompraGiusto Materiali, Cassa Sicura Cantiere, Spese Sotto Controllo, Scelte Finiture, Altro
- messaggio
- email
- priorità
- fase della ristrutturazione

Poi in `app.js` imposta:

```js
feedbackUrl: 'https://tally.so/r/TUO_FORM_ID'
```

I pulsanti **Avvisami**, **Segnala problema** e **Proponi app** apriranno quel form passando alcuni parametri in query string (`tipo`, `strumento`, `origine`).

Se `feedbackUrl` resta vuoto, i pulsanti mostrano un messaggio non bloccante e l'app continua a funzionare.
