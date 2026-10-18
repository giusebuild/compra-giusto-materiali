/* Calcoli puri: numeri, misure, confezioni e costi. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MaterialiCalc = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const labels = {
    tiles: { name: 'Piastrelle', unit: 'scatole', measure: 'm²' },
    paint: { name: 'Pittura', unit: 'barattoli', measure: 'm²' },
    linear: { name: 'Battiscopa e profili', unit: 'pezzi', measure: 'm' },
    compound: { name: 'Colla e fugante', unit: 'sacchi', measure: 'm²' }
  };
  // Un punto singolo è decimale: "1.44" significa 1,44, non 144.
  function parseNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const raw = String(value ?? '').trim().replace(/[\s\u00a0]/g, '');
    if (!raw || !/^[+-]?\d[\d.,]*$/.test(raw)) return null;
    const dots = (raw.match(/\./g) || []).length;
    const commas = (raw.match(/,/g) || []).length;
    let normalized = raw;
    if (dots && commas) {
      const decimal = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ',';
      const thousands = decimal === '.' ? ',' : '.';
      const pieces = raw.split(decimal);
      if (pieces.length !== 2 || !/^\d+$/.test(pieces[1])) return null;
      const grouped = pieces[0].replace(/^[+-]/, '').split(thousands);
      if (grouped.length > 1 && !(grouped[0].length >= 1 && grouped[0].length <= 3 && grouped.slice(1).every(v => /^\d{3}$/.test(v)))) return null;
      normalized = pieces[0].split(thousands).join('') + '.' + pieces[1];
    } else if (dots > 1 || commas > 1) {
      const sep = dots ? '.' : ',';
      const groups = raw.replace(/^[+-]/, '').split(sep);
      if (!/^\d{1,3}$/.test(groups[0]) || !groups.slice(1).every(v => /^\d{3}$/.test(v))) return null;
      normalized = raw.split(sep).join('');
    } else {
      normalized = raw.replace(',', '.');
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function positive(value) {
    const n = parseNumber(value);
    return n !== null && n > 0 ? n : null;
  }
  function nonNegative(value, fallback = null) {
    if (value === '' || value == null) return fallback;
    const n = parseNumber(value);
    return n !== null && n >= 0 ? n : null;
  }
  function measure(input) {
    const mode = input.mode || 'known';
    const linear = input.kind === 'linear';
    if (mode === 'known') {
      const amount = positive(input.amount);
      return amount === null ? { error: linear ? 'Inserisci i metri da coprire.' : 'Inserisci i metri quadrati.' } : { value: amount };
    }
    if (mode === 'rect' || mode === 'walls') {
      const length = positive(input.length);
      const width = positive(input.width);
      if (!length || !width) return { error: 'Inserisci lunghezza e larghezza.' };
      if (mode === 'rect') return { value: linear ? 2 * (length + width) : length * width };
      if (linear) return { error: 'Per i profili scegli un altro tipo di misura.' };
      const height = positive(input.height);
      if (!height) return { error: 'Inserisci anche l’altezza delle pareti.' };
      const openings = nonNegative(input.openings, 0);
      if (openings === null) return { error: 'Controlla i m² di porte e finestre.' };
      const gross = 2 * (length + width) * height;
      if (openings >= gross) return { error: 'Le aperture non possono superare la superficie delle pareti.' };
      return { value: gross - openings };
    }
    if (mode === 'parts') {
      const rows = String(input.parts || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      if (!rows.length) return { error: 'Inserisci almeno una misura.' };
      let sum = 0;
      for (const row of rows) {
        const terms = row.split(/\s*[x×*]\s*/i);
        if (terms.length > 2) return { error: 'Controlla le misure: usa 3,2 × 2,1 oppure 4,5.' };
        const values = terms.map(positive);
        if (values.some(v => v === null)) return { error: 'Controlla le misure: usa 3,2 × 2,1 oppure 4,5.' };
        sum += values.reduce((a, b) => a * b, 1);
      }
      return { value: sum };
    }
    return { error: 'Seleziona un tipo di misura.' };
  }
  function estimate(input) {
    const info = labels[input.kind];
    if (!info) return { error: 'Scegli il materiale.' };
    const dimension = measure(input);
    if (dimension.error) return { error: dimension.error };
    const waste = nonNegative(input.waste, 10);
    if (waste === null || waste > 100) return { error: 'Lo sfrido deve essere fra 0 e 100%.' };
    const price = nonNegative(input.price, null);
    if (String(input.price ?? '').trim() && price === null) return { error: 'Controlla il prezzo.' };
    const base = dimension.value;
    const factor = 1 + waste / 100;
    let needed, pack, quantityUnit;
    if (input.kind === 'tiles') {
      pack = positive(input.packArea);
      if (!pack) return { error: 'Indica quanti m² ci sono in una scatola.' };
      needed = base * factor;
      quantityUnit = 'm²';
    } else if (input.kind === 'paint') {
      const yieldArea = positive(input.paintYield);
      pack = positive(input.paintCan);
      const coats = positive(input.coats);
      if (!yieldArea || !pack || !coats || !Number.isInteger(coats)) return { error: 'Controlla resa, litri per barattolo e numero di mani.' };
      needed = base * coats / yieldArea * factor;
      quantityUnit = 'L';
    } else if (input.kind === 'linear') {
      pack = positive(input.pieceLength);
      if (!pack) return { error: 'Indica la lunghezza di ogni pezzo.' };
      needed = base * factor;
      quantityUnit = 'm';
    } else {
      const rate = positive(input.rate);
      pack = positive(input.bagWeight);
      if (!rate || !pack) return { error: 'Indica consumo al m² e kg per sacco.' };
      needed = base * rate * factor;
      quantityUnit = 'kg';
    }
    const units = Math.ceil(needed / pack - 1e-10);
    if (!Number.isFinite(units) || units < 1 || units > 1000000) return { error: 'Controlla le quantità inserite.' };
    const bought = units * pack;
    return {
      kind: input.kind, material: info.name, base, measureUnit: info.measure,
      needed, bought, extra: Math.max(0, bought - needed), quantityUnit,
      units, unitLabel: info.unit, price, cost: price === null ? null : units * price, waste
    };
  }
  function format(value, digits = 2) {
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: digits }).format(value);
  }
  function euros(value) {
    return value === null ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
  }
  return { parseNumber, measure, estimate, format, euros, labels };
});
