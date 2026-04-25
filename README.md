# CompraGiusto Materiali — PWA unica con Gumroad License Key

Questa versione usa una sola PWA:

- parte in modalità Free;
- limita i salvataggi gratuiti;
- rimanda a Gumroad per l’acquisto;
- verifica la license key con una funzione Netlify;
- sblocca Pro nella stessa PWA.

## File principali

```text
index.html
styles.css
app.js
manifest.webmanifest
sw.js
icons/
netlify/functions/verify-license.js
netlify.toml
```

## Prima cosa da cambiare

In `app.js`, sostituisci il link Gumroad:

```js
const CONFIG = {
  gumroadUrl: 'https://gumroad.com/l/compra-giusto-materiali'
};
```

con il link reale del tuo prodotto.

## Setup Gumroad

1. Crea un prodotto su Gumroad.
2. Attiva le license key nelle impostazioni del prodotto.
3. Copia il `product_id` mostrato da Gumroad.
4. Su Netlify aggiungi una variabile ambiente:

```text
GUMROAD_PRODUCT_ID=il_tuo_product_id
```

Il `product_id` resta su Netlify, non dentro la PWA.

## Deploy su Netlify

1. Carica questa cartella su Netlify.
2. Verifica che Netlify rilevi `netlify.toml`.
3. Imposta la variabile ambiente `GUMROAD_PRODUCT_ID`.
4. Fai deploy.
5. Apri il sito HTTPS.

La funzione sarà disponibile qui:

```text
/.netlify/functions/verify-license
```

## Test locale

Per testare la parte UI:

```bash
python3 -m http.server 3000
```

Poi apri:

```text
http://localhost:3000
```

La verifica Gumroad completa funziona correttamente quando il progetto è deployato con la funzione Netlify e la variabile ambiente configurata.

## Modalità Free

La versione Free consente 3 calcoli salvati.

Blocchi Free:

- salvataggio oltre 3 calcoli;
- export backup;
- report con watermark.

## Modalità Pro

La versione Pro sblocca:

- calcoli illimitati;
- export backup;
- report pulito;
- ri-verifica periodica soft.

La Pro resta attiva offline dopo l’attivazione. La PWA prova a riverificare la licenza ogni 14 giorni quando internet è disponibile.
