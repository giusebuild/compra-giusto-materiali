# Casa / Materiali

**Quanto devi comprare?** Inserisci le misure: l'app calcola confezioni, avanzo e costo e prepara una lista materiali per casa.

Questa è la sezione **Materiali** di una futura piattaforma modulare per la gestione della casa. Il nome dell'ecosistema “Casa” è provvisorio; l'app resta utilizzabile da sola. Niente account, licenze o pagamenti.

## Funzionalità

- Piastrelle, pittura, battiscopa/profili, colla/fugante.
- Misura nota, rettangolo, pareti con aperture da sottrarre, somma di più superfici.
- Sfrido configurabile; confezioni arrotondate per eccesso; prezzi facoltativi.
- Lista illimitata con modifica vera, copia, cancellazione e costo complessivo (con indicazione quando mancano prezzi).
- Dati esclusivamente locali; esportazione e importazione JSON gratuite; PWA offline.
- Migrazione automatica e non distruttiva degli elementi salvati dalla precedente versione `cg_materiali_v3_state`.

## iPhone e PWA

Apri il sito con Safari → Condividi → **Aggiungi alla schermata Home**. L'icona iPhone dedicata è `icons/apple-touch-icon.png` (180 × 180); le altre icone PWA (192 e 512) usano lo stesso simbolo. La modalità `standalone` evita l'interfaccia del browser quando si apre dalla Home. Chi ha già installato la vecchia icona potrebbe doverla rimuovere e aggiungerla nuovamente.

## Avvio

```bash
python3 -m http.server 3000
# Apri http://localhost:3000
```

## Test

```bash
npm test
```

Non richiede dipendenze: i test usano il runner integrato di Node.js (18+).

## Deploy

Sito statico su Netlify: impostare la directory di pubblicazione alla root (già definita in `netlify.toml`).
Dopo un aggiornamento dei file statici, aggiornare la versione di cache nel service worker.

## Dati e compatibilità

- Chiave principale: `casa_materiali_v4`; i dati della versione precedente vengono letti ma mai cancellati.
- L'importazione **sostituisce** la lista locale solo dopo conferma esplicita.
- Svuotare i dati del browser elimina la lista se non è stato esportato un backup.
- Non carica dati personali su server. Qualunque analytics o sincronizzazione futura richiederà una scelta esplicita.

## Identità

- Brand dell'ecosistema: **Casa** (segnaposto, non validato commercialmente).
- Modulo: **Materiali**.
- Promessa: **“Quanto devi comprare?”**
- Simbolo: quattro riquadri che richiamano materiali/ambienti e una verifica di acquisto.

## Manutenzione

Niente framework e niente backend: `calc.js` contiene tutta la matematica testabile in isolamento, `app.js` gestisce dati e interfaccia, `styles.css` contiene il design.

Il vecchio flusso Gumroad/Pro è stato rimosso intenzionalmente. Prima di introdurre funzioni ulteriori, validare l'utilizzo con utenti reali.
