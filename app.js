const CONFIG = {
  appVersion: '1.0.0-license',
  freeLimit: 3,
  gumroadUrl: 'https://gumroad.com/l/compra-giusto-materiali',
  verifyEndpoint: '/.netlify/functions/verify-license',
  recheckDays: 14
};

const STORAGE_KEY = 'cg_materiali_state_v1';
const LICENSE_KEY = 'cg_materiali_license_v1';

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const defaults = {
  items: [],
  theme: 'light'
};

let state = loadState();
let license = loadLicense();
let editingId = null;

function loadState() {
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) }; }
  catch { return { ...defaults }; }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function loadLicense() {
  try { return JSON.parse(localStorage.getItem(LICENSE_KEY)) || { status: 'free' }; }
  catch { return { status: 'free' }; }
}

function saveLicense(next) {
  license = next;
  localStorage.setItem(LICENSE_KEY, JSON.stringify(license));
  render();
}

function isPro() {
  return license && license.status === 'pro';
}

function numberFromInput(value) {
  if (value === null || value === undefined) return 0;
  const clean = String(value).trim().replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const valueNumber = parseFloat(clean);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function euro(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
}

function formatNumber(value, decimals = 2) {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function parsePieces(text) {
  return String(text || '').split(/\n+/).reduce((total, rawLine) => {
    const line = rawLine.trim().replace(',', '.');
    if (!line) return total;
    const match = line.match(/^([0-9.]+)\s*[xX*]\s*([0-9.]+)$/);
    if (match) return total + (parseFloat(match[1]) * parseFloat(match[2]));
    return total + numberFromInput(line);
  }, 0);
}

function materialLabel(type) {
  return {
    tiles: 'Pavimento / rivestimento',
    paint: 'Pittura',
    linear: 'Battiscopa / profili',
    kg: 'Colla / fugante / rasante'
  }[type] || type;
}

function unitLabel(type) {
  return {
    tiles: 'confezioni',
    paint: 'barattoli',
    linear: 'pezzi',
    kg: 'confezioni'
  }[type] || 'unità';
}

function quantityLabel(type) {
  return {
    tiles: 'mq',
    paint: 'litri',
    linear: 'm',
    kg: 'kg'
  }[type] || 'unità';
}

function baseAmountFromForm() {
  const type = $('materialType').value;
  const mode = $('measureMode').value;

  if (mode === 'known') return numberFromInput($('knownAmount').value);
  if (mode === 'parts') return parsePieces($('parts').value);
  if (mode === 'walls') return Math.max(0, parsePieces($('walls').value) - numberFromInput($('wallOpenings').value));

  const length = numberFromInput($('length').value);
  const width = numberFromInput($('width').value);
  const height = numberFromInput($('height').value);
  const openings = numberFromInput($('openings').value);

  if (type === 'linear') return Math.max(0, 2 * (length + width) - openings);
  if (type === 'paint') return Math.max(0, (2 * (length + width) * height + length * width) - openings);
  if (type === 'tiles' || type === 'kg') return Math.max(0, length * width);

  return Math.max(0, length * width);
}

function formData() {
  return {
    id: editingId || uid(),
    room: $('room').value.trim(),
    materialType: $('materialType').value,
    measureMode: $('measureMode').value,
    baseAmount: baseAmountFromForm(),
    waste: numberFromInput($('waste').value),
    packMq: numberFromInput($('packMq').value),
    paintYield: numberFromInput($('paintYield').value),
    canLiters: numberFromInput($('canLiters').value),
    coats: numberFromInput($('coats').value) || 1,
    pieceMeters: numberFromInput($('pieceMeters').value),
    kgPerMq: numberFromInput($('kgPerMq').value),
    kgPack: numberFromInput($('kgPack').value),
    price: numberFromInput($('price').value),
    notes: $('notes').value.trim(),
    createdAt: new Date().toISOString()
  };
}

function compute(item) {
  const type = item.materialType;
  const base = Number(item.baseAmount) || 0;
  const wasteMultiplier = 1 + ((Number(item.waste) || 0) / 100);
  let need = base * wasteMultiplier;
  let units = 0;
  let bought = 0;
  let unit = unitLabel(type);
  let qLabel = quantityLabel(type);

  if (type === 'paint') {
    need = (base * (Number(item.coats) || 1)) / (Number(item.paintYield) || 1);
    units = Math.ceil(need / (Number(item.canLiters) || 1));
    bought = units * (Number(item.canLiters) || 0);
  } else if (type === 'linear') {
    units = Math.ceil(need / (Number(item.pieceMeters) || 1));
    bought = units * (Number(item.pieceMeters) || 0);
  } else if (type === 'kg') {
    need = base * (Number(item.kgPerMq) || 0) * wasteMultiplier;
    units = Math.ceil(need / (Number(item.kgPack) || 1));
    bought = units * (Number(item.kgPack) || 0);
  } else {
    units = Math.ceil(need / (Number(item.packMq) || 1));
    bought = units * (Number(item.packMq) || 0);
  }

  const cost = units * (Number(item.price) || 0);
  const extra = Math.max(0, bought - need);

  return { base, need, units, bought, extra, cost, unit, qLabel };
}

function canSaveMore() {
  return isPro() || state.items.length < CONFIG.freeLimit || editingId;
}

function remainingFreeUses() {
  return Math.max(0, CONFIG.freeLimit - state.items.length);
}

function showUpgradeModal(message) {
  $('licenseModal').classList.remove('hidden');
  $('licenseMessage').className = 'licenseMessage';
  $('licenseMessage').textContent = message || 'Inserisci la license key ricevuta dopo l’acquisto.';
  setTimeout(() => $('licenseKeyInput').focus(), 50);
}

function hideUpgradeModal() {
  $('licenseModal').classList.add('hidden');
  $('licenseKeyInput').value = '';
  $('licenseMessage').textContent = '';
}

function updateVisibility() {
  const mode = $('measureMode').value;
  const type = $('materialType').value;

  $$('.measureBlock').forEach((block) => block.classList.toggle('hidden', block.dataset.mode !== mode));
  $$('.typeField').forEach((field) => field.classList.toggle('hidden', field.dataset.type !== type));

  const showWallRect = mode === 'rect' && (type === 'paint');
  $$('.wallOnly').forEach((el) => el.classList.toggle('hidden', !showWallRect));

  const showWallMeasure = mode === 'walls';
  $$('.wallMeasureOnly').forEach((el) => el.classList.toggle('hidden', !showWallMeasure));

  const knownLabel = type === 'linear' ? 'Metri lineari già noti' : 'Metri quadri già noti';
  $('knownLabel').textContent = knownLabel;

  renderLiveResult();
}

function renderLicense() {
  document.body.classList.toggle('free-mode', !isPro());
  $('buyBtn').href = CONFIG.gumroadUrl;
  $('buyBtnModal').href = CONFIG.gumroadUrl;

  if (isPro()) {
    $('editionLabel').textContent = 'Pro attiva';
    $('statusBadge').textContent = 'Pro';
    $('statusBadge').classList.add('pro');
    $('licenseTitle').textContent = 'Versione completa attiva';
    $('licenseText').textContent = 'Calcoli illimitati, export backup e report senza watermark.';
    $('buyBtn').classList.add('hidden');
    $('activateBtn').textContent = 'Licenza attiva';
  } else {
    const left = remainingFreeUses();
    $('editionLabel').textContent = `Free · ${left} calcoli gratuiti rimasti`;
    $('statusBadge').textContent = 'Free';
    $('statusBadge').classList.remove('pro');
    $('licenseTitle').textContent = `${left} calcoli gratuiti rimasti`;
    $('licenseText').textContent = 'La Pro sblocca calcoli illimitati, export backup e report senza watermark.';
    $('buyBtn').classList.remove('hidden');
    $('activateBtn').textContent = 'Attiva Pro';
  }
}

function renderMetrics() {
  let totalCost = 0;
  let totalUnits = 0;
  let totalBase = 0;
  let riskyWaste = 0;

  state.items.forEach((item) => {
    const calc = compute(item);
    totalCost += calc.cost;
    totalUnits += calc.units;
    totalBase += calc.base;
    if (calc.base > 0 && calc.extra > calc.base * 0.25) riskyWaste += 1;
  });

  $('metrics').innerHTML = `
    <article class="metric"><small>Calcoli salvati</small><strong>${state.items.length}</strong><em>${isPro() ? 'illimitati' : `${remainingFreeUses()} free rimasti`}</em></article>
    <article class="metric"><small>Costo stimato</small><strong>${euro(totalCost)}</strong><em>somma materiali</em></article>
    <article class="metric"><small>Unità da comprare</small><strong>${totalUnits}</strong><em>confezioni, pezzi o sacchi</em></article>
    <article class="metric ${riskyWaste ? 'warn' : 'ok'}"><small>Avanzi alti</small><strong>${riskyWaste}</strong><em>controlla prima di ordinare</em></article>
  `;
}

function renderLiveResult() {
  const item = formData();
  const calc = compute(item);
  const hasBase = calc.base > 0;
  const missingUnit = hasBase && calc.units <= 0;
  const extraRatio = calc.need > 0 ? calc.extra / calc.need : 0;
  const statusClass = !hasBase || missingUnit ? 'warn' : extraRatio > 0.25 ? 'warn' : 'ok';
  const big = hasBase && !missingUnit ? `${calc.units} ${calc.unit}` : 'Inserisci i dati';

  $('resultPanel').innerHTML = `
    <h3>Risultato immediato</h3>
    <p>Si aggiorna mentre compili.</p>
    <div class="bigResult ${statusClass}">${big}</div>
    <div class="miniGrid">
      <div class="mini"><small>Base</small><b>${formatAmount(calc.base, item.materialType, 'base')}</b></div>
      <div class="mini"><small>Da coprire</small><b>${formatAmount(calc.need, item.materialType, 'need')}</b></div>
      <div class="mini"><small>Acquistato</small><b>${formatAmount(calc.bought, item.materialType, 'need')}</b></div>
      <div class="mini"><small>Costo</small><b>${euro(calc.cost)}</b></div>
    </div>
    <div class="callout ${statusClass}">${resultMessage(item, calc)}</div>
  `;

  renderTodo(item, calc);
}

function formatAmount(value, type, mode) {
  if (type === 'paint' && mode === 'need') return `${formatNumber(value, 2)} l`;
  if (type === 'kg' && mode === 'need') return `${formatNumber(value, 1)} kg`;
  if (type === 'linear') return `${formatNumber(value, 2)} m`;
  return `${formatNumber(value, 2)} mq`;
}

function resultMessage(item, calc) {
  if (calc.base <= 0) return 'Parti dalla misura che conosci: mq già noti, rettangolo, superfici da sommare o pareti singole.';
  if (calc.units <= 0) return 'Manca il dato della confezione: mq per confezione, litri, kg o metri per pezzo.';
  if (calc.extra > calc.need * 0.25) return 'Avanzo alto: controlla confezione e sfrido prima di ordinare.';
  return `Compra ${calc.units} ${calc.unit}. Prima di ordinare verifica sempre il dato sulla confezione reale.`;
}

function renderTodo(item, calc) {
  const tips = [];

  if (calc.base <= 0) tips.push('Inserisci una quantità maggiore di zero. Se la stanza è irregolare, usa “sommo più pezzi”.');
  if (item.materialType === 'tiles' && !item.packMq) tips.push('Aggiungi i mq per confezione: li trovi sulla scheda prodotto o sulla scatola.');
  if (item.materialType === 'paint' && (!item.paintYield || !item.canLiters)) tips.push('Per la pittura servono resa mq/litro e litri per barattolo.');
  if (item.materialType === 'kg' && (!item.kgPerMq || !item.kgPack)) tips.push('Per colle/fuganti servono consumo kg/mq e kg per confezione.');
  if (calc.base > 0 && calc.extra > calc.need * 0.25) tips.push('L’avanzo è alto: prova a ridurre sfrido o verifica se esistono confezioni più piccole.');
  if (!tips.length) tips.push('Salva il calcolo e usalo come lista d’acquisto prima di andare in negozio.');
  if (!isPro() && remainingFreeUses() <= 1) tips.push('Stai finendo i calcoli gratuiti: la Pro sblocca salvataggi illimitati.');

  $('todoList').innerHTML = tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('');
}

function renderItems() {
  if (!state.items.length) {
    $('itemsList').innerHTML = '<div class="empty">Nessun calcolo salvato. Aggiungi il primo materiale per ottenere quantità, avanzo e costo.</div>';
    return;
  }

  $('itemsList').innerHTML = state.items.map((item) => {
    const calc = compute(item);
    return `
      <article class="item">
        <div class="itemHead">
          <div>
            <h4>${escapeHtml(item.room || 'Ambiente senza nome')}</h4>
            <p>${materialLabel(item.materialType)}${item.notes ? ' · ' + escapeHtml(item.notes) : ''}</p>
          </div>
          <span class="pill">${calc.units} ${calc.unit}</span>
        </div>
        <div class="miniGrid">
          <div class="mini"><small>Base</small><b>${formatAmount(calc.base, item.materialType, 'base')}</b></div>
          <div class="mini"><small>Da coprire</small><b>${formatAmount(calc.need, item.materialType, 'need')}</b></div>
          <div class="mini"><small>Avanzo</small><b>${formatAmount(calc.extra, item.materialType, 'need')}</b></div>
          <div class="mini"><small>Costo</small><b>${euro(calc.cost)}</b></div>
        </div>
        <div class="actions">
          <button class="btn small" type="button" onclick="editItem('${item.id}')">Modifica</button>
          <button class="btn small" type="button" onclick="duplicateItem('${item.id}')">Duplica</button>
          <button class="btn small danger" type="button" onclick="deleteItem('${item.id}')">Elimina</button>
        </div>
      </article>
    `;
  }).join('');
}

function render() {
  renderLicense();
  renderMetrics();
  renderLiveResult();
  renderItems();
  $('exportBtn').disabled = !isPro();
  $('printBtn').textContent = isPro() ? 'Stampa / PDF' : 'Stampa / PDF Free';
}

function saveCalculation(event) {
  event.preventDefault();
  const item = formData();
  const calc = compute(item);

  if (calc.base <= 0) {
    alert('Inserisci una misura valida prima di salvare.');
    return;
  }

  if (!canSaveMore()) {
    showUpgradeModal(`Hai usato i ${CONFIG.freeLimit} calcoli gratuiti. Sblocca Pro per salvare calcoli illimitati.`);
    return;
  }

  const index = state.items.findIndex((entry) => entry.id === item.id);
  if (index >= 0) state.items[index] = item;
  else state.items.unshift(item);

  clearForm();
  saveState();
}

function clearForm() {
  editingId = null;
  $('calcForm').reset();
  $('materialType').value = 'tiles';
  $('measureMode').value = 'known';
  $('waste').value = '10';
  $('coats').value = '2';
  updateVisibility();
}

function fillForm(item) {
  editingId = item.id;
  $('room').value = item.room || '';
  $('materialType').value = item.materialType || 'tiles';
  $('measureMode').value = 'known';
  $('knownAmount').value = item.baseAmount || '';
  $('waste').value = item.waste ?? 10;
  $('packMq').value = item.packMq || '';
  $('paintYield').value = item.paintYield || '';
  $('canLiters').value = item.canLiters || '';
  $('coats').value = item.coats || 2;
  $('pieceMeters').value = item.pieceMeters || '';
  $('kgPerMq').value = item.kgPerMq || '';
  $('kgPack').value = item.kgPack || '';
  $('price').value = item.price || '';
  $('notes').value = item.notes || '';
  updateVisibility();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.editItem = function editItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (item) fillForm(item);
};

window.duplicateItem = function duplicateItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  if (!canSaveMore()) {
    showUpgradeModal(`Hai usato i ${CONFIG.freeLimit} calcoli gratuiti. Sblocca Pro per duplicare altri calcoli.`);
    return;
  }
  state.items.unshift({ ...item, id: uid(), room: `${item.room || 'Ambiente'} copia`, createdAt: new Date().toISOString() });
  saveState();
};

window.deleteItem = function deleteItem(id) {
  if (!confirm('Eliminare questo calcolo?')) return;
  state.items = state.items.filter((entry) => entry.id !== id);
  saveState();
};

function loadExample() {
  if (!canSaveMore() && !isPro()) {
    showUpgradeModal(`Hai usato i ${CONFIG.freeLimit} calcoli gratuiti. Sblocca Pro per aggiungere altri esempi e calcoli.`);
    return;
  }
  state.items.unshift({
    id: uid(),
    room: 'Bagno principale',
    materialType: 'tiles',
    measureMode: 'known',
    baseAmount: 6.72,
    waste: 10,
    packMq: 1.44,
    price: 52,
    notes: 'Gres pavimento 60×60',
    createdAt: new Date().toISOString()
  });
  saveState();
}

function exportBackup() {
  if (!isPro()) {
    showUpgradeModal('L’export backup è incluso nella versione Pro.');
    return;
  }
  const blob = new Blob([JSON.stringify({ version: CONFIG.appVersion, state }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'compra-giusto-materiali-backup.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function printReport() {
  if (!isPro()) {
    if (!confirm('La versione Free stampa con watermark. Sbloccare Pro per un report pulito?')) return;
  }
  window.print();
}

async function verifyLicense() {
  const key = $('licenseKeyInput').value.trim();
  const message = $('licenseMessage');

  if (!key) {
    message.className = 'licenseMessage bad';
    message.textContent = 'Inserisci una license key.';
    return;
  }

  message.className = 'licenseMessage';
  message.textContent = 'Verifica in corso...';
  $('verifyLicenseBtn').disabled = true;

  try {
    const response = await fetch(CONFIG.verifyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: key, mode: 'activate' })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'License key non valida.');
    }

    saveLicense({
      status: 'pro',
      licenseKey: key,
      activatedAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      purchaseEmail: data.email || null,
      uses: data.uses || null
    });

    message.className = 'licenseMessage ok';
    message.textContent = 'Pro attivata. Puoi chiudere questa finestra.';
    setTimeout(hideUpgradeModal, 900);
  } catch (error) {
    message.className = 'licenseMessage bad';
    message.textContent = error.message || 'Errore durante la verifica.';
  } finally {
    $('verifyLicenseBtn').disabled = false;
  }
}

async function recheckLicenseIfNeeded() {
  if (!isPro() || !license.licenseKey) return;

  const last = license.lastVerifiedAt ? new Date(license.lastVerifiedAt).getTime() : 0;
  const days = (Date.now() - last) / (1000 * 60 * 60 * 24);
  if (days < CONFIG.recheckDays) return;

  try {
    const response = await fetch(CONFIG.verifyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: license.licenseKey, mode: 'check' })
    });
    const data = await response.json();
    if (response.ok && data.ok) {
      saveLicense({ ...license, lastVerifiedAt: new Date().toISOString(), uses: data.uses || license.uses });
    }
  } catch {
    // Offline or network error: keep Pro active. Do not punish users in cantiere.
  }
}

function resetAll() {
  if (!confirm('Cancellare tutti i calcoli salvati? La licenza Pro resta attiva.')) return;
  state.items = [];
  saveState();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme || 'light');
}

function toggleTheme() {
  state.theme = (state.theme || 'light') === 'dark' ? 'light' : 'dark';
  saveState();
}

function bindEvents() {
  $('calcForm').addEventListener('submit', saveCalculation);
  $('clearBtn').addEventListener('click', clearForm);
  $('loadExampleBtn').addEventListener('click', loadExample);
  $('exportBtn').addEventListener('click', exportBackup);
  $('printBtn').addEventListener('click', printReport);
  $('resetBtn').addEventListener('click', resetAll);
  $('activateBtn').addEventListener('click', () => showUpgradeModal());
  $('closeLicenseModal').addEventListener('click', hideUpgradeModal);
  $('verifyLicenseBtn').addEventListener('click', verifyLicense);
  $('themeBtn').addEventListener('click', toggleTheme);

  ['materialType', 'measureMode'].forEach((id) => $(id).addEventListener('change', updateVisibility));
  $$('#calcForm input, #calcForm textarea, #calcForm select').forEach((field) => {
    field.addEventListener('input', renderLiveResult);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

applyTheme();
bindEvents();
updateVisibility();
render();
recheckLicenseIfNeeded();
