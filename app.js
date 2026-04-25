'use strict';

const KEY = 'compra_giusto_materiali_pwa_v1';
let deferredInstallPrompt = null;
let state = loadState();
let editingId = null;

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).trim().replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value, decimals = 2) {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(Number(value) || 0);
}

function money(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && Array.isArray(saved.items)) return saved;
  } catch (error) {}
  return { project: '', items: [] };
}

function saveState() {
  state.project = $('project').value.trim();
  localStorage.setItem(KEY, JSON.stringify(state));
  const status = $('saveState');
  status.textContent = 'Salvato ora';
  setTimeout(() => { status.textContent = 'Salvataggio automatico attivo'; }, 1200);
}

function getMaterialLabel(type) {
  return {
    tiles: 'Pavimento / rivestimento',
    paint: 'Pittura',
    linear: 'Battiscopa / profili',
    kg: 'Colla / fugante / rasante'
  }[type] || type;
}

function getUnitLabel(type) {
  return {
    tiles: 'confezioni',
    paint: 'barattoli',
    linear: 'pezzi',
    kg: 'sacchi/confezioni'
  }[type] || 'unità';
}

function parseParts(text, type) {
  return String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .reduce((total, line) => {
      const normalized = line.replace(',', '.');
      const match = normalized.match(/^([0-9.]+)\s*[xX*]\s*([0-9.]+)$/);
      if (match) return total + parseFloat(match[1]) * parseFloat(match[2]);
      return total + parseNumber(line);
    }, 0);
}

function calculateBaseAmount() {
  const type = $('materialType').value;
  const mode = $('measureMode').value;

  if (mode === 'known') return parseNumber($('knownAmount').value);
  if (mode === 'parts') return parseParts($('partsInput').value, type);

  const length = parseNumber($('length').value);
  const width = parseNumber($('width').value);

  if (type === 'linear') return Math.max(0, 2 * (length + width));

  const height = parseNumber($('height').value);
  const rectangleKind = $('rectangleKind').value;
  const doorsArea = parseNumber($('doors').value) * 0.8 * 2.1;
  const windowsArea = parseNumber($('windows').value) * 1.2 * 1.2;

  if (rectangleKind === 'floor') return Math.max(0, length * width);
  if (rectangleKind === 'walls') return Math.max(0, 2 * (length + width) * height - doorsArea - windowsArea);
  if (rectangleKind === 'wallsCeiling') return Math.max(0, 2 * (length + width) * height + length * width - doorsArea - windowsArea);

  return 0;
}

function getCurrentInput() {
  return {
    id: editingId || uid(),
    project: $('project').value.trim(),
    room: $('room').value.trim() || 'Ambiente senza nome',
    materialName: $('materialName').value.trim() || getMaterialLabel($('materialType').value),
    materialType: $('materialType').value,
    measureMode: $('measureMode').value,
    baseAmount: calculateBaseAmount(),
    waste: parseNumber($('waste').value),
    packCoverage: parseNumber($('packCoverage').value),
    paintYield: parseNumber($('paintYield').value),
    coats: parseNumber($('coats').value) || 1,
    canLiters: parseNumber($('canLiters').value),
    pieceLength: parseNumber($('pieceLength').value),
    kgPerSqm: parseNumber($('kgPerSqm').value),
    kgPack: parseNumber($('kgPack').value),
    unitPrice: parseNumber($('unitPrice').value),
    notes: $('notes').value.trim(),
    savedAt: new Date().toISOString()
  };
}

function calculate(item) {
  const type = item.materialType;
  const base = Number(item.baseAmount) || 0;
  const wasteMultiplier = 1 + (Number(item.waste) || 0) / 100;

  let need = base * wasteMultiplier;
  let units = 0;
  let bought = 0;
  let cost = 0;
  let measureLabel = type === 'linear' ? 'm' : 'mq';

  if (type === 'tiles') {
    const pack = Number(item.packCoverage) || 0;
    units = pack > 0 ? Math.ceil(need / pack) : 0;
    bought = units * pack;
  }

  if (type === 'paint') {
    const litersNeeded = base * (Number(item.coats) || 1) / (Number(item.paintYield) || 1);
    need = litersNeeded;
    const can = Number(item.canLiters) || 0;
    units = can > 0 ? Math.ceil(litersNeeded / can) : 0;
    bought = units * can;
    measureLabel = 'l';
  }

  if (type === 'linear') {
    const piece = Number(item.pieceLength) || 0;
    units = piece > 0 ? Math.ceil(need / piece) : 0;
    bought = units * piece;
    measureLabel = 'm';
  }

  if (type === 'kg') {
    const kgNeeded = base * (Number(item.kgPerSqm) || 0) * wasteMultiplier;
    need = kgNeeded;
    const packKg = Number(item.kgPack) || 0;
    units = packKg > 0 ? Math.ceil(kgNeeded / packKg) : 0;
    bought = units * packKg;
    measureLabel = 'kg';
  }

  cost = units * (Number(item.unitPrice) || 0);
  const extra = Math.max(0, bought - need);

  return {
    base,
    need,
    units,
    bought,
    cost,
    extra,
    unitLabel: getUnitLabel(type),
    measureLabel
  };
}

function updateVisibility() {
  const type = $('materialType').value;
  const mode = $('measureMode').value;

  $$('[data-mode]').forEach(el => el.classList.toggle('hidden', el.dataset.mode !== mode));
  $$('[data-type]').forEach(el => el.classList.toggle('hidden', el.dataset.type !== type));
  $$('[data-non-linear]').forEach(el => el.classList.toggle('hidden', type === 'linear' || mode !== 'rectangle'));

  $('knownAmountLabel').textContent = type === 'linear' ? 'Metri lineari già noti' : 'Metri quadri già noti';
  $('partsLabel').textContent = type === 'linear' ? 'Lati da sommare in metri' : 'Superfici da sommare in mq';

  renderLive();
}

function renderSummary() {
  const totals = state.items.reduce((acc, item) => {
    const c = calculate(item);
    acc.count += 1;
    acc.units += c.units;
    acc.cost += c.cost;
    acc.extra += c.extra;
    if (c.base > 0 && c.extra / Math.max(c.need, 1) > 0.25) acc.highWaste += 1;
    return acc;
  }, { count: 0, units: 0, cost: 0, extra: 0, highWaste: 0 });

  $('summaryCards').innerHTML = `
    <div class="metric"><small>Calcoli salvati</small><strong>${totals.count}</strong><em>voci materiale</em></div>
    <div class="metric"><small>Unità da comprare</small><strong>${formatNumber(totals.units, 0)}</strong><em>confezioni, pezzi o sacchi</em></div>
    <div class="metric"><small>Costo stimato</small><strong>${money(totals.cost)}</strong><em>totale lista</em></div>
    <div class="metric ${totals.highWaste ? 'warn' : 'ok'}"><small>Avanzi alti</small><strong>${totals.highWaste}</strong><em>da ricontrollare</em></div>
  `;
}

function renderLive() {
  const item = getCurrentInput();
  const c = calculate(item);
  const hasBase = c.base > 0;
  const hasUnit = c.units > 0;
  const extraRatio = c.need > 0 ? c.extra / c.need : 0;
  const status = !hasBase ? 'warn' : extraRatio > 0.25 ? 'warn' : 'ok';

  $('liveResult').innerHTML = `
    <h3>Risultato immediato</h3>
    <p class="hint">Si aggiorna mentre compili.</p>
    <div class="answer ${status}">${hasUnit ? `Compra ${c.units} ${c.unitLabel}` : 'Inserisci confezione e misura'}</div>
    <div class="mini-grid">
      <div class="mini"><small>Quantità reale</small><b>${formatNumber(c.base, 2)} ${item.materialType === 'linear' ? 'm' : 'mq'}</b></div>
      <div class="mini"><small>Da coprire</small><b>${formatNumber(c.need, 2)} ${c.measureLabel}</b></div>
      <div class="mini"><small>Acquistato</small><b>${formatNumber(c.bought, 2)} ${c.measureLabel}</b></div>
      <div class="mini"><small>Costo</small><b>${money(c.cost)}</b></div>
    </div>
    <div class="callout ${status}">
      ${hasBase ? `Avanzo stimato: <b>${formatNumber(c.extra, 2)} ${c.measureLabel}</b>. ${extraRatio > 0.25 ? 'Sembra alto: controlla sfrido e dimensione confezione.' : 'Margine leggibile.'}` : 'Parti dalla misura che hai davvero: mq già noti, rettangolo o superfici da sommare.'}
    </div>
  `;

  renderTodo(item, c);
}

function renderTodo(item, c) {
  const list = [];
  if (c.base <= 0) list.push('Inserisci una misura maggiore di zero. Per stanze irregolari usa “Sommo più superfici”.');
  if (item.materialType === 'tiles' && item.packCoverage <= 0) list.push('Inserisci i mq per confezione: li trovi su scheda prodotto, scatola o sito del venditore.');
  if (item.materialType === 'paint' && (item.paintYield <= 0 || item.canLiters <= 0)) list.push('Per la pittura servono resa mq/litro e litri per barattolo.');
  if (item.materialType === 'linear' && item.pieceLength <= 0) list.push('Per battiscopa o profili serve la lunghezza del pezzo.');
  if (item.materialType === 'kg' && (item.kgPerSqm <= 0 || item.kgPack <= 0)) list.push('Per colla/fugante servono consumo kg/mq e kg per confezione.');
  if (item.waste < 5 && item.materialType !== 'paint') list.push('Sfrido molto basso: se ci sono tagli o formati grandi valuta 10–15%.');
  if (c.need > 0 && c.extra / c.need > 0.25) list.push('Avanzo oltre il 25%: prima di ordinare controlla confezione, sfrido e metodo di misura.');
  if (!list.length) list.push('Salva il calcolo e usalo come lista d’acquisto prima di ordinare.');

  $('todoList').innerHTML = list.map(item => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderSavedList() {
  if (!state.items.length) {
    $('savedList').innerHTML = '<div class="empty">Nessun calcolo salvato. Aggiungi un materiale: otterrai unità da comprare, avanzo e costo stimato.</div>';
    return;
  }

  $('savedList').innerHTML = state.items.map(item => {
    const c = calculate(item);
    return `
      <article class="item">
        <div class="item-head">
          <div>
            <h4>${escapeHtml(item.room)} · ${escapeHtml(item.materialName)}</h4>
            <p>${getMaterialLabel(item.materialType)}${item.notes ? ' · ' + escapeHtml(item.notes) : ''}</p>
          </div>
          <span class="pill">${c.units} ${c.unitLabel}</span>
        </div>
        <div class="mini-grid">
          <div class="mini"><small>Reale</small><b>${formatNumber(c.base, 2)} ${item.materialType === 'linear' ? 'm' : 'mq'}</b></div>
          <div class="mini"><small>Da coprire</small><b>${formatNumber(c.need, 2)} ${c.measureLabel}</b></div>
          <div class="mini"><small>Avanzo</small><b>${formatNumber(c.extra, 2)} ${c.measureLabel}</b></div>
          <div class="mini"><small>Costo</small><b>${money(c.cost)}</b></div>
        </div>
        <div class="actions no-print">
          <button class="btn" type="button" onclick="editItem('${item.id}')">Modifica</button>
          <button class="btn" type="button" onclick="duplicateItem('${item.id}')">Duplica</button>
          <button class="btn danger" type="button" onclick="deleteItem('${item.id}')">Elimina</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderAll() {
  renderSummary();
  renderLive();
  renderSavedList();
}

function clearForm() {
  editingId = null;
  $('materialForm').reset();
  $('project').value = state.project || '';
  $('waste').value = '10';
  $('paintYield').value = '10';
  $('coats').value = '2';
  $('canLiters').value = '5';
  $('kgPerSqm').value = '4';
  $('kgPack').value = '25';
  $('saveBtn').textContent = 'Salva calcolo';
  updateVisibility();
}

function saveCurrentItem(event) {
  event.preventDefault();
  const item = getCurrentInput();
  const c = calculate(item);

  if (c.base <= 0) {
    alert('Inserisci una misura valida prima di salvare.');
    return;
  }

  const index = state.items.findIndex(saved => saved.id === item.id);
  if (index >= 0) state.items[index] = item;
  else state.items.unshift(item);

  saveState();
  clearForm();
  renderAll();
}

window.editItem = function editItem(id) {
  const item = state.items.find(saved => saved.id === id);
  if (!item) return;
  editingId = item.id;

  $('project').value = state.project || item.project || '';
  $('room').value = item.room || '';
  $('materialName').value = item.materialName || '';
  $('materialType').value = item.materialType || 'tiles';
  $('measureMode').value = 'known';
  $('knownAmount').value = item.baseAmount || '';
  $('waste').value = item.waste || 10;
  $('packCoverage').value = item.packCoverage || '';
  $('paintYield').value = item.paintYield || 10;
  $('coats').value = item.coats || 2;
  $('canLiters').value = item.canLiters || 5;
  $('pieceLength').value = item.pieceLength || '';
  $('kgPerSqm').value = item.kgPerSqm || 4;
  $('kgPack').value = item.kgPack || 25;
  $('unitPrice').value = item.unitPrice || '';
  $('notes').value = item.notes || '';
  $('saveBtn').textContent = 'Aggiorna calcolo';
  updateVisibility();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.duplicateItem = function duplicateItem(id) {
  const item = state.items.find(saved => saved.id === id);
  if (!item) return;
  const copy = JSON.parse(JSON.stringify(item));
  copy.id = uid();
  copy.room = `${copy.room} copia`;
  state.items.unshift(copy);
  saveState();
  renderAll();
};

window.deleteItem = function deleteItem(id) {
  if (!confirm('Eliminare questo calcolo?')) return;
  state.items = state.items.filter(item => item.id !== id);
  saveState();
  renderAll();
};

function loadDemo() {
  state = {
    project: 'Ristrutturazione casa',
    items: [
      {
        id: uid(), project: 'Ristrutturazione casa', room: 'Bagno principale', materialName: 'Gres tortora 60x60',
        materialType: 'tiles', measureMode: 'known', baseAmount: 6.72, waste: 10, packCoverage: 1.44,
        paintYield: 10, coats: 2, canLiters: 5, pieceLength: 0, kgPerSqm: 0, kgPack: 0, unitPrice: 52,
        notes: 'Pavimento bagno'
      },
      {
        id: uid(), project: 'Ristrutturazione casa', room: 'Soggiorno', materialName: 'Pittura lavabile bianco caldo',
        materialType: 'paint', measureMode: 'known', baseAmount: 48, waste: 0, packCoverage: 0,
        paintYield: 10, coats: 2, canLiters: 5, pieceLength: 0, kgPerSqm: 0, kgPack: 0, unitPrice: 42,
        notes: 'Pareti + soffitto'
      }
    ]
  };
  $('project').value = state.project;
  saveState();
  renderAll();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'compra-giusto-materiali-backup.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported || !Array.isArray(imported.items)) throw new Error('Invalid backup');
      state = imported;
      $('project').value = state.project || '';
      saveState();
      renderAll();
    } catch (error) {
      alert('Backup non valido.');
    }
  };
  reader.readAsText(file);
}

function resetData() {
  if (!confirm('Cancellare tutti i calcoli salvati?')) return;
  state = { project: '', items: [] };
  localStorage.removeItem(KEY);
  clearForm();
  renderAll();
}

function initTheme() {
  const saved = localStorage.getItem('compra_giusto_theme') || 'light';
  document.documentElement.dataset.theme = saved;
  $('themeBtn').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('compra_giusto_theme', next);
  };
}

function initPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $('installBtn').hidden = false;
  });

  $('installBtn').onclick = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('installBtn').hidden = true;
  };
}

function initEvents() {
  $('materialForm').addEventListener('submit', saveCurrentItem);
  $('clearBtn').onclick = clearForm;
  $('demoBtn').onclick = loadDemo;
  $('exportBtn').onclick = exportData;
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) importData(file);
    event.target.value = '';
  };
  $('printBtn').onclick = () => window.print();
  $('resetBtn').onclick = resetData;

  ['input', 'change'].forEach(eventName => {
    document.addEventListener(eventName, (event) => {
      if (event.target.closest('#materialForm')) updateVisibility();
      if (event.target.id === 'project') {
        state.project = $('project').value.trim();
        localStorage.setItem(KEY, JSON.stringify(state));
      }
    });
  });
}

function init() {
  $('project').value = state.project || '';
  initTheme();
  initPwa();
  initEvents();
  updateVisibility();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
