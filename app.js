
'use strict';

const CONFIG = {
  version: '3.4.2',
  freeLimit: 3,
  gumroadUrl: 'https://giusebuild.gumroad.com/l/compragiusto-materiali-pro',
  verifyEndpoint: '/.netlify/functions/verify-license',
  publicJwk: window.COMPRA_GIUSTO_LICENSE_PUBLIC_JWK || null,
  recheckDays: 30,
  // Inserisci qui il link del form unico (Tally/Google Form/Typeform).
  // Esempio: 'https://tally.so/r/ABC123'
  feedbackUrl: 'https://tally.so/r/EkBJJB',
  toolLinks: {
    cash: '',
    expenses: '',
    finishes: ''
  }
};

const STORAGE_KEY = 'cg_materiali_v3_state';
const LICENSE_KEY = 'cg_materiali_v3_license';

const state = {
  tab: 'calculate',
  material: 'boxes',
  measureMode: 'known',
  activeStep: 1,
  items: [],
  lastSavedAt: null,
  current: {
    room: '',
    quantity: '',
    length: '',
    width: '',
    height: '',
    doors: '',
    windows: '',
    parts: '',
    waste: '10',
    packArea: '1,44',
    paintYield: '10',
    canLiters: '5',
    coats: '2',
    pieceLength: '2,4',
    kgPerMq: '4',
    kgPack: '25',
    unitPrice: '',
    notes: ''
  },
  license: { status: 'free', certificate: null, payload: null, lastVerifiedAt: null }
};

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function parseNum(value) {
  if (value === null || value === undefined) return 0;
  const normalized = String(value).trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNum(value, decimals = 2) {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(Number(value) || 0);
}

function euro(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
}

function safe(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function verifyCertificate(certificate) {
  if (!certificate || !CONFIG.publicJwk || !window.crypto?.subtle) return null;
  const parts = certificate.split('.');
  if (parts.length !== 2) return null;

  try {
    const [payloadPart, signaturePart] = parts;
    const key = await crypto.subtle.importKey(
      'jwk',
      CONFIG.publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlToBytes(signaturePart),
      new TextEncoder().encode(payloadPart)
    );

    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart)));
    if (payload.status !== 'pro') return null;
    if (payload.expiresAt && Date.now() > Date.parse(payload.expiresAt)) return null;
    return payload;
  } catch (error) {
    console.warn('Certificate verification failed', error);
    return null;
  }
}

async function refreshLicenseFromStorage() {
  const stored = readLicense();
  if (!stored?.certificate) {
    state.license = { status: 'free', certificate: null, payload: null, lastVerifiedAt: null };
    return;
  }

  const payload = await verifyCertificate(stored.certificate);
  if (!payload) {
    state.license = { status: 'free', certificate: null, payload: null, lastVerifiedAt: null };
    return;
  }

  state.license = {
    status: 'pro',
    certificate: stored.certificate,
    payload,
    lastVerifiedAt: stored.lastVerifiedAt || null
  };
}

function readLicense() {
  try {
    return JSON.parse(localStorage.getItem(LICENSE_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeLicense(certificate, payload) {
  const stored = {
    certificate,
    payloadHint: {
      email: payload.email || null,
      expiresAt: payload.expiresAt || null
    },
    activatedAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString()
  };
  localStorage.setItem(LICENSE_KEY, JSON.stringify(stored));
}

function clearLicense() {
  localStorage.removeItem(LICENSE_KEY);
  state.license = { status: 'free', certificate: null, payload: null, lastVerifiedAt: null };
  render();
}

function isPro() {
  return state.license.status === 'pro';
}

function remainingFreeSaves() {
  return Math.max(0, CONFIG.freeLimit - state.items.length);
}

function canSaveMore() {
  return isPro() || state.items.length < CONFIG.freeLimit;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (Array.isArray(saved.items)) state.items = saved.items;
    if (saved.current) state.current = { ...state.current, ...saved.current };
    if (saved.material) state.material = saved.material;
    if (saved.measureMode) state.measureMode = saved.measureMode;
    if (saved.lastSavedAt) state.lastSavedAt = saved.lastSavedAt;
  } catch (error) {
    console.warn('Cannot load state', error);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    items: state.items,
    current: state.current,
    material: state.material,
    measureMode: state.measureMode,
    lastSavedAt: state.lastSavedAt
  }));
}

function getCurrentValue(name) {
  const el = $(name);
  return el ? el.value : state.current[name];
}

function syncCurrentFromForm() {
  Object.keys(state.current).forEach((key) => {
    const el = $(key);
    if (el) state.current[key] = el.value;
  });
}

function fillFormFromState() {
  $('material').value = state.material;
  Object.keys(state.current).forEach((key) => {
    const el = $(key);
    if (el) el.value = state.current[key] ?? '';
  });
  setMeasureMode(state.measureMode, false);
  updateMaterialFields();
}

function parseParts(text) {
  const rows = String(text || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
  let total = 0;

  rows.forEach((row) => {
    const normalized = row.toLowerCase().replace(/,/g, '.').replace(/\s/g, '');
    const match = normalized.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
    if (match) {
      total += Number(match[1]) * Number(match[2]);
    } else {
      total += parseNum(row);
    }
  });

  return total;
}

function calculateBaseQuantity(material = state.material, mode = state.measureMode) {
  if (mode === 'known') return parseNum(getCurrentValue('quantity'));

  if (mode === 'parts') return parseParts(getCurrentValue('parts'));

  const length = parseNum(getCurrentValue('length'));
  const width = parseNum(getCurrentValue('width'));
  const height = parseNum(getCurrentValue('height'));

  if (mode === 'rect') {
    if (material === 'linear') return Math.max(0, 2 * (length + width));
    return Math.max(0, length * width);
  }

  if (mode === 'walls') {
    const doors = parseNum(getCurrentValue('doors'));
    const windows = parseNum(getCurrentValue('windows'));
    const openings = doors * 0.8 * 2.1 + windows * 1.2 * 1.2;
    return Math.max(0, 2 * (length + width) * height - openings);
  }

  return 0;
}

function calculate(input = null) {
  const data = input || getCalculationInput();
  const material = data.material;
  const base = Math.max(0, Number(data.base) || 0);
  const waste = Math.max(0, Number(data.waste) || 0);
  const unitPrice = Math.max(0, Number(data.unitPrice) || 0);

  let needed = base * (1 + waste / 100);
  let units = 0;
  let bought = 0;
  let extra = 0;
  let cost = 0;
  let unitLabel = 'confezioni';
  let quantityLabel = 'mq';

  if (material === 'paint') {
    const coats = Math.max(1, Number(data.coats) || 1);
    const yieldMq = Math.max(0.01, Number(data.paintYield) || 1);
    const canLiters = Math.max(0.01, Number(data.canLiters) || 1);
    needed = (base * coats) / yieldMq;
    units = Math.ceil(needed / canLiters);
    bought = units * canLiters;
    extra = bought - needed;
    cost = units * unitPrice;
    unitLabel = 'barattoli';
    quantityLabel = 'litri';
  } else if (material === 'linear') {
    const pieceLength = Math.max(0.01, Number(data.pieceLength) || 1);
    units = Math.ceil(needed / pieceLength);
    bought = units * pieceLength;
    extra = bought - base;
    cost = units * unitPrice;
    unitLabel = 'pezzi';
    quantityLabel = 'm';
  } else if (material === 'kg') {
    const kgPerMq = Math.max(0, Number(data.kgPerMq) || 0);
    const kgPack = Math.max(0.01, Number(data.kgPack) || 1);
    needed = base * kgPerMq * (1 + waste / 100);
    units = Math.ceil(needed / kgPack);
    bought = units * kgPack;
    extra = bought - needed;
    cost = units * unitPrice;
    unitLabel = 'sacchi';
    quantityLabel = 'kg';
  } else {
    const packArea = Math.max(0.01, Number(data.packArea) || 1);
    units = Math.ceil(needed / packArea);
    bought = units * packArea;
    extra = bought - base;
    cost = units * unitPrice;
    unitLabel = 'confezioni';
    quantityLabel = 'mq';
  }

  return {
    ...data,
    base,
    needed,
    units,
    bought,
    extra,
    cost,
    unitLabel,
    quantityLabel
  };
}

function getCalculationInput() {
  syncCurrentFromForm();
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    room: state.current.room.trim(),
    material: state.material,
    measureMode: state.measureMode,
    base: calculateBaseQuantity(),
    waste: parseNum(state.current.waste),
    packArea: parseNum(state.current.packArea),
    paintYield: parseNum(state.current.paintYield),
    canLiters: parseNum(state.current.canLiters),
    coats: parseNum(state.current.coats),
    pieceLength: parseNum(state.current.pieceLength),
    kgPerMq: parseNum(state.current.kgPerMq),
    kgPack: parseNum(state.current.kgPack),
    unitPrice: parseNum(state.current.unitPrice),
    notes: state.current.notes.trim()
  };
}

function materialLabel(material) {
  return {
    boxes: 'Pavimento / rivestimento',
    paint: 'Pittura',
    linear: 'Battiscopa / profili',
    kg: 'Colla / fugante'
  }[material] || material;
}

function modeLabel(mode) {
  return {
    known: 'Dato già noto',
    rect: 'Rettangolo',
    parts: 'Superfici sommate',
    walls: 'Pareti'
  }[mode] || mode;
}

function quantityWithUnit(value, unit, decimals = 2) {
  return `${formatNum(value, decimals)} ${unit}`;
}

function setTab(tab) {
  state.tab = tab;
  $$('.tab').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
  $$('.tabPanel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
}

function setMeasureMode(mode, shouldRender = true) {
  state.measureMode = mode;
  $$('.choice[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });

  $('knownFields').classList.toggle('hidden', mode !== 'known');
  $('rectFields').classList.toggle('hidden', !(mode === 'rect' || mode === 'walls'));
  $('partsFields').classList.toggle('hidden', mode !== 'parts');
  $('wallsFields').classList.toggle('hidden', mode !== 'walls');

  if (shouldRender) renderCalculation();
}

function setMaterial(material) {
  state.material = material;
  updateMaterialFields();
  renderCalculation();
}

function updateMaterialFields() {
  const material = state.material;

  $('knownLabel').textContent = material === 'linear' ? 'Metri lineari già noti' : material === 'paint' ? 'Mq da pitturare' : 'Mq da coprire';
  $('knownHint').textContent = material === 'linear'
    ? 'Esempio: misura il perimetro già corretto, esclusi passaggi e porte.'
    : 'Esempio: dato del rilievo, preventivo o scheda tecnica.';

  $('sellBoxes').classList.toggle('hidden', material !== 'boxes');
  $('sellPaint').classList.toggle('hidden', material !== 'paint');
  $('sellLinear').classList.toggle('hidden', material !== 'linear');
  $('sellKg').classList.toggle('hidden', material !== 'kg');

  $$('.choice[data-mode="walls"]').forEach((button) => {
    button.classList.toggle('hidden', material === 'linear');
  });

  if (material === 'linear' && state.measureMode === 'walls') {
    setMeasureMode('known', false);
  }
}

function openStep(number) {
  state.activeStep = number;
  $$('.stepCard').forEach((card) => card.classList.toggle('open', Number(card.dataset.step) === number));
}

function renderLicenseStatus() {
  const pro = isPro();
  document.documentElement.dataset.license = pro ? 'pro' : 'free';

  $('licenseBadge').textContent = pro ? 'Pro attiva' : 'Free';
  $('licenseBadge').classList.toggle('pro', pro);
  $('heroLicenseBadge').textContent = pro ? 'Pro' : 'Free';
  $('heroLicenseBadge').classList.toggle('pro', pro);

  $('topProBtn').classList.toggle('hidden', pro);
  $('heroLicenseTitle').textContent = pro ? 'Pro attiva' : `${remainingFreeSaves()} calcoli gratuiti rimasti`;
  $('heroLicenseText').textContent = pro
    ? 'Calcoli illimitati, export backup e report senza watermark.'
    : 'Sblocca Pro per calcoli illimitati, export backup e report pulito.';

  $('proCta').classList.toggle('hidden', pro);
  $('manageLicenseBtn').classList.toggle('hidden', !pro);
  $('archiveProNotice').classList.toggle('hidden', pro);
  $('freeContextAd').classList.toggle('show', !pro);
  $('bottomUpgrade').classList.toggle('hidden', pro);

  const freeText = pro ? 'Pro attiva' : `${remainingFreeSaves()} calcoli rimasti`;
  $('mobileFreeText').textContent = freeText;
}

function archiveTotals() {
  return state.items.reduce((acc, item) => {
    const calc = calculate(item);
    acc.cost += calc.cost;
    acc.units += calc.units;
    acc.base += calc.base;
    acc.needed += calc.needed;
    acc.extra += Math.max(0, calc.extra);
    acc.rooms.add(item.room || 'Casa');
    acc.materials.add(materialLabel(item.material));
    return acc;
  }, { cost: 0, units: 0, base: 0, needed: 0, extra: 0, rooms: new Set(), materials: new Set() });
}

function renderSummaryCards() {
  const totals = archiveTotals();

  const legacySaved = $('summarySaved');
  if (legacySaved) legacySaved.textContent = String(state.items.length);
  const legacySavedSub = $('summarySavedSub');
  if (legacySavedSub) legacySavedSub.textContent = isPro() ? 'illimitati' : `${remainingFreeSaves()} rimasti`;
  const legacyCost = $('summaryCost');
  if (legacyCost) legacyCost.textContent = euro(totals.cost);
  const legacyUnits = $('summaryUnits');
  if (legacyUnits) legacyUnits.textContent = formatNum(totals.units, 0);

  const count = $('archiveCount');
  if (count) count.textContent = String(state.items.length);
  const cost = $('archiveCost');
  if (cost) cost.textContent = euro(totals.cost);
  const units = $('archiveUnits');
  if (units) units.textContent = formatNum(totals.units, 0);
  const coverage = $('archiveCoverage');
  if (coverage) coverage.textContent = quantityWithUnit(totals.needed, 'mq');
  const rooms = $('archiveRooms');
  if (rooms) rooms.textContent = String(totals.rooms.size);
  const materials = $('archiveMaterials');
  if (materials) materials.textContent = totals.materials.size ? Array.from(totals.materials).slice(0, 3).join(', ') : '—';

  const insight = $('archiveInsight');
  if (insight) {
    if (!state.items.length) {
      insight.innerHTML = '<strong>Archivio vuoto.</strong> Salva un calcolo per costruire una lista acquisto confrontabile.';
    } else {
      insight.innerHTML = `<strong>Lista acquisto pronta.</strong> Hai ${state.items.length} calcoli, ${formatNum(totals.units, 0)} unità da comprare e ${euro(totals.cost)} di costo stimato.`;
    }
  }
}

function renderCalculation() {
  syncCurrentFromForm();
  saveState();
  const calc = calculate();

  const canCalc = calc.base > 0;
  const answer = canCalc ? `Compra ${calc.units} ${calc.unitLabel}` : 'Inserisci misure e confezione';
  $('resultAnswer').textContent = answer;
  $('resultAnswer').className = `answer ${canCalc ? 'ok' : 'warn'}`;

  $('resultSub').textContent = canCalc
    ? `Costo stimato ${euro(calc.cost)}. Avanzo circa ${quantityWithUnit(Math.max(0, calc.extra), calc.quantityLabel)}.`
    : 'Parti dal dato che conosci davvero: mq, rettangolo o superfici da sommare.';

  $('kpiBase').textContent = quantityWithUnit(calc.base, state.material === 'linear' ? 'm' : 'mq');
  $('kpiNeeded').textContent = quantityWithUnit(calc.needed, calc.quantityLabel);
  $('kpiBought').textContent = quantityWithUnit(calc.bought, calc.quantityLabel);
  $('kpiCost').textContent = euro(calc.cost);

  renderChecks(calc);
  renderStepState(calc);
  renderContextualTools(calc);
}

function renderChecks(calc) {
  const checks = [];

  if (calc.base <= 0) {
    checks.push('Inserisci una quantità maggiore di zero.');
  }

  if (state.material === 'boxes' && calc.packArea <= 0) {
    checks.push('Aggiungi i mq per confezione.');
  }

  if (calc.unitPrice <= 0) {
    checks.push('Aggiungi il prezzo per vedere il costo stimato.');
  }

  if (calc.base > 0 && calc.extra > calc.base * 0.25 && state.material !== 'paint') {
    checks.push('Avanzo alto: verifica sfrido e quantità per confezione.');
  }

  if (calc.base > 0 && checks.length === 0) {
    checks.push('Verifica sempre formato, lotto e codice prodotto prima di ordinare.');
    if (state.material === 'boxes') checks.push('Se il materiale è difficile da reperire, valuta una confezione extra.');
    if (state.material === 'paint') checks.push('Controlla che la resa indicata sia coerente con supporto e numero di mani.');
  }

  $('checkList').innerHTML = checks.map((text) => `<div class="checkItem">${safe(text)}</div>`).join('');
}

function renderStepState(calc) {
  $('stateMaterial').textContent = materialLabel(state.material);
  $('stateMeasure').textContent = calc.base > 0 ? quantityWithUnit(calc.base, state.material === 'linear' ? 'm' : 'mq') : modeLabel(state.measureMode);
  $('stateSale').textContent = calc.units > 0 ? `${calc.units} ${calc.unitLabel}` : 'Da completare';
  $('stateResult').textContent = calc.cost > 0 ? euro(calc.cost) : 'Pronto quando compili';
}

function renderContextualTools(calc) {
  const shouldShow = !isPro() && calc.cost > 0;
  $('freeContextAd').classList.toggle('show', shouldShow);
  if (!shouldShow) return;
  $('freeContextAdText').textContent = `Hai stimato ${euro(calc.cost)} di materiale. Ora puoi controllare se quel pagamento entra nel mese giusto.`;
}

function setSaveFeedback(message = '', type = 'info') {
  const el = $('saveFeedback');
  if (!el) return;
  el.textContent = message;
  el.className = `saveFeedback ${type}`;
}

function focusField(id) {
  const el = $(id);
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function validationTargetForMeasure() {
  if (state.measureMode === 'parts') return 'parts';
  return 'quantity';
}

function validationTargetForSale() {
  if (state.material === 'paint') return 'paintYield';
  if (state.material === 'linear') return 'pieceLength';
  if (state.material === 'kg') return 'kgPerMq';
  return 'packArea';
}

function validateBeforeSave(calc) {
  if (calc.base <= 0) {
    return {
      ok: false,
      step: 2,
      field: validationTargetForMeasure(),
      message: 'Inserisci prima una misura reale. Puoi usare mq già noti, rettangolo o parti da sommare.'
    };
  }

  if (calc.units <= 0) {
    return {
      ok: false,
      step: 3,
      field: validationTargetForSale(),
      message: 'Completa come viene venduto il materiale: confezione, resa, pezzo o sacco.'
    };
  }

  return { ok: true };
}

function addCalculation() {
  const input = getCalculationInput();
  const calc = calculate(input);
  const validation = validateBeforeSave(calc);

  if (!validation.ok) {
    openStep(validation.step);
    setSaveFeedback(validation.message, 'error');
    toast(validation.message);
    window.setTimeout(() => focusField(validation.field), 80);
    return;
  }

  if (!canSaveMore()) {
    setSaveFeedback('Hai finito i calcoli gratuiti. Sblocca Pro per continuare.', 'error');
    showUpgradeModal('limit');
    return;
  }

  const item = {
    ...input,
    id: uid(),
    createdAt: new Date().toISOString()
  };

  state.items.unshift(item);
  state.lastSavedAt = new Date().toISOString();
  saveState();
  setSaveFeedback('Salvato. Lo trovi in Archivio.', 'success');
  render();
  toast(isPro() ? 'Calcolo salvato in Archivio.' : `Calcolo salvato. ${remainingFreeSaves()} gratuiti rimasti.`);
  showPostSaveNudge();
  window.setTimeout(() => setTab('archive'), 420);
}

function showPostSaveNudge() {
  if (isPro()) return;
  $('postSaveNudge').classList.remove('hidden');
  setTimeout(() => $('postSaveNudge').classList.add('hidden'), 9000);
}

function duplicateItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  if (!canSaveMore()) {
    showUpgradeModal('limit');
    return;
  }

  state.items.unshift({ ...item, id: uid(), createdAt: new Date().toISOString(), room: `${item.room || 'Calcolo'} copia` });
  saveState();
  render();
  toast('Calcolo duplicato.');
}

function editItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  state.current = {
    ...state.current,
    room: item.room || '',
    quantity: String(item.base || ''),
    waste: String(item.waste ?? '10'),
    packArea: String(item.packArea || ''),
    paintYield: String(item.paintYield || ''),
    canLiters: String(item.canLiters || ''),
    coats: String(item.coats || ''),
    pieceLength: String(item.pieceLength || ''),
    kgPerMq: String(item.kgPerMq || ''),
    kgPack: String(item.kgPack || ''),
    unitPrice: String(item.unitPrice || ''),
    notes: item.notes || ''
  };
  state.material = item.material || 'boxes';
  state.measureMode = 'known';

  fillFormFromState();
  setTab('calculate');
  openStep(1);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteItem(id) {
  if (!confirm('Eliminare questo calcolo?')) return;
  state.items = state.items.filter((entry) => entry.id !== id);
  saveState();
  render();
  toast('Calcolo eliminato.');
}

function renderArchive() {
  const archiveTab = document.querySelector('[data-tab="archive"]');
  if (archiveTab) archiveTab.textContent = state.items.length ? `Archivio (${state.items.length})` : 'Archivio';
  const list = $('archiveList');
  if (!state.items.length) {
    list.innerHTML = `
      <div class="empty">
        <strong>Nessun calcolo salvato.</strong><br>
        Salva il primo materiale: lo ritroverai qui per confrontarlo, duplicarlo o stamparlo.
      </div>
    `;
    return;
  }

  list.innerHTML = state.items.map((item) => {
    const calc = calculate(item);
    const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString('it-IT') : '';
    return `
      <article class="savedItem">
        <div class="savedTop">
          <div>
            <h4>${safe(item.room || 'Ambiente senza nome')}</h4>
            <p>${safe(materialLabel(item.material))} · ${safe(modeLabel(item.measureMode))} · ${date}</p>
          </div>
          <span class="badge">${calc.units} ${safe(calc.unitLabel)}</span>
        </div>
        <div class="savedMetrics">
          <div class="savedMetric"><small>Da coprire</small><b>${safe(quantityWithUnit(calc.needed, calc.quantityLabel))}</b></div>
          <div class="savedMetric"><small>Comprato</small><b>${safe(quantityWithUnit(calc.bought, calc.quantityLabel))}</b></div>
          <div class="savedMetric"><small>Avanzo</small><b>${safe(quantityWithUnit(Math.max(0, calc.extra), calc.quantityLabel))}</b></div>
          <div class="savedMetric"><small>Costo</small><b>${euro(calc.cost)}</b></div>
        </div>
        ${item.notes ? `<p class="sub">${safe(item.notes)}</p>` : ''}
        <div class="itemActions noPrint">
          <button class="btn small" type="button" data-edit="${item.id}">Apri</button>
          <button class="btn small" type="button" data-duplicate="${item.id}">Duplica</button>
          <button class="btn small danger" type="button" data-delete="${item.id}">Elimina</button>
        </div>
      </article>
    `;
  }).join('');

  $$('[data-edit]', list).forEach((button) => button.addEventListener('click', () => editItem(button.dataset.edit)));
  $$('[data-duplicate]', list).forEach((button) => button.addEventListener('click', () => duplicateItem(button.dataset.duplicate)));
  $$('[data-delete]', list).forEach((button) => button.addEventListener('click', () => deleteItem(button.dataset.delete)));
}

function feedbackUrl(params = {}) {
  const base = CONFIG.feedbackUrl || '';
  if (!base || base === '#') return '';
  try {
    const currentHref = window.location?.href || (typeof location !== 'undefined' ? location.href : 'https://app.local/');
    const url = new URL(base, currentHref);
    const enrichedParams = {
      versione: CONFIG.version,
      ...params
    };
    Object.entries(enrichedParams).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    return url.toString();
  } catch (error) {
    console.warn('Feedback URL non valido', error);
    return base;
  }
}

function openFeedback(params = {}) {
  const url = feedbackUrl(params);
  if (!url) {
    toast('Modulo richieste non ancora collegato.');
    return;
  }
  window.open(url, '_blank', 'noopener');
}

function renderTools() {
  const tools = [
    {
      key: 'cash',
      icon: '€',
      eyebrow: 'Cassa e pagamenti',
      title: 'Cassa Sicura Cantiere',
      text: 'Capisci se i pagamenti previsti ti lasciano abbastanza liquidità mese per mese.',
      bullets: ['mese fragile', 'gap da coprire', 'pagamenti da spostare'],
      interest: 'Cassa Sicura Cantiere'
    },
    {
      key: 'expenses',
      icon: 'S',
      eyebrow: 'Acquisti reali',
      title: 'Spese Sotto Controllo',
      text: 'Segna cosa hai comprato, cosa manca e dove il budget sta scappando.',
      bullets: ['budget vs reale', 'mancanti', 'pagato non consegnato'],
      interest: 'Spese Sotto Controllo'
    },
    {
      key: 'finishes',
      icon: 'F',
      eyebrow: 'Colori e prodotti',
      title: 'Scelte Finiture',
      text: 'Organizza colori, materiali, codici prodotto e stato delle scelte.',
      bullets: ['codici prodotto', 'ambienti incompleti', 'scelte pronte'],
      interest: 'Scelte Finiture'
    }
  ];

  const grid = $('toolsGrid');
  if (!grid) return;

  grid.innerHTML = tools.map((tool) => {
    const href = CONFIG.toolLinks[tool.key] || '';
    const hasProductLink = href && href !== '#';
    return `
      <article class="toolCard">
        <div class="toolCardTop">
          <div class="toolIcon">${safe(tool.icon)}</div>
          <span class="toolEyebrow">${safe(tool.eyebrow)}</span>
        </div>
        <div>
          <h3>${safe(tool.title)}</h3>
          <p>${safe(tool.text)}</p>
        </div>
        <div class="toolBullets">
          ${tool.bullets.map((bullet) => `<span>${safe(bullet)}</span>`).join('')}
        </div>
        ${hasProductLink
          ? `<a class="btn soft" href="${safe(href)}" target="_blank" rel="noopener">Apri strumento</a>`
          : `<button class="btn soft" type="button" data-feedback-type="tool" data-feedback-tool="${safe(tool.interest)}">Avvisami</button>`}
      </article>
    `;
  }).join('');

  $$('[data-feedback-type]', grid).forEach((button) => {
    button.addEventListener('click', () => openFeedback({
      tipo: button.dataset.feedbackType,
      strumento: button.dataset.feedbackTool || '',
      origine: 'tab-strumenti'
    }));
  });
}

function exportBackup() {
  if (!isPro()) {
    showUpgradeModal('export');
    return;
  }

  const payload = {
    app: 'CompraGiusto Materiali',
    version: CONFIG.version,
    exportedAt: new Date().toISOString(),
    items: state.items
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'compragiusto-materiali-backup.json';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(items)) throw new Error('Invalid backup');
      state.items = items;
      saveState();
      render();
      toast('Backup importato.');
    } catch {
      toast('Backup non valido.');
    }
  };
  reader.readAsText(file);
}

function printReport() {
  if (!isPro()) {
    document.body.classList.add('printingFree');
  }
  window.print();
}

function showUpgradeModal(reason = 'manual') {
  const title = {
    limit: 'Hai finito i calcoli gratuiti',
    export: 'Export disponibile in Pro',
    report: 'Report pulito disponibile in Pro',
    manual: 'Attiva Pro'
  }[reason] || 'Attiva Pro';

  $('modalTitle').textContent = title;
  $('licenseError').textContent = '';
  $('licenseSuccess').textContent = '';
  $('licenseKey').value = '';
  $('upgradeModal').classList.remove('hidden');
  $('licenseKey').focus();
}

function closeUpgradeModal() {
  $('upgradeModal').classList.add('hidden');
  $('licenseError').textContent = '';
  $('licenseSuccess').textContent = '';
  $('licenseKey').value = '';
}

async function activateLicense() {
  const licenseKey = $('licenseKey').value.trim();
  $('licenseError').textContent = '';
  $('licenseSuccess').textContent = '';

  if (!licenseKey) {
    $('licenseError').textContent = 'Inserisci la license key.';
    return;
  }

  if (!CONFIG.publicJwk) {
    $('licenseError').textContent = 'Chiave pubblica non configurata. Esegui tools/generate-license-keys.js e aggiorna license-public-key.js.';
    return;
  }

  $('activateBtn').disabled = true;
  $('activateBtn').textContent = 'Verifica...';

  try {
    const response = await fetch(CONFIG.verifyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !data.certificate) {
      throw new Error(data.message || 'License key non valida.');
    }

    const payload = await verifyCertificate(data.certificate);
    if (!payload) {
      throw new Error('Licenza ricevuta ma firma non valida.');
    }

    writeLicense(data.certificate, payload);
    await refreshLicenseFromStorage();
    closeUpgradeModal();
    render();
    toast('Pro attiva.');
  } catch (error) {
    $('licenseError').textContent = error.message || 'Verifica non riuscita.';
  } finally {
    $('activateBtn').disabled = false;
    $('activateBtn').textContent = 'Attiva Pro';
  }
}

async function maybeRecheckLicense() {
  if (!isPro()) return;
  const stored = readLicense();
  const last = stored?.lastVerifiedAt ? Date.parse(stored.lastVerifiedAt) : 0;
  const age = Date.now() - last;
  if (age < CONFIG.recheckDays * 24 * 60 * 60 * 1000) return;
  if (!navigator.onLine) return;
  // Soft check intentionally omitted without storing raw license key.
  // The signed certificate expiry controls offline validity.
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  window.clearTimeout(toast._timer);
  toast._timer = window.setTimeout(() => $('toast').classList.remove('show'), 2400);
}

function render() {
  renderLicenseStatus();
  renderSummaryCards();
  renderCalculation();
  renderArchive();
  renderTools();
}

function setupEvents() {
  $$('.tab').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));

  $$('.stepHead').forEach((button) => {
    button.addEventListener('click', () => openStep(Number(button.closest('.stepCard').dataset.step)));
  });

  $$('.choice[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      setMeasureMode(button.dataset.mode);
      openStep(2);
      const target = button.dataset.mode === 'parts'
        ? 'parts'
        : button.dataset.mode === 'known'
          ? 'quantity'
          : 'length';
      window.setTimeout(() => focusField(target), 80);
    });
  });

  $('material').addEventListener('change', () => {
    setMaterial($('material').value);
    openStep(2);
  });

  $$('input, select, textarea').forEach((input) => {
    input.addEventListener('input', () => {
      setSaveFeedback('', 'info');
      renderCalculation();
    });
    input.addEventListener('change', () => {
      setSaveFeedback('', 'info');
      renderCalculation();
    });
  });

  $('saveCalcBtn').addEventListener('click', addCalculation);
  $('clearBtn').addEventListener('click', () => {
    state.current = {
      ...state.current,
      room: '',
      quantity: '',
      length: '',
      width: '',
      height: '',
      doors: '',
      windows: '',
      parts: '',
      unitPrice: '',
      notes: ''
    };
    fillFormFromState();
    openStep(1);
    render();
  });

  $('exampleBtn').addEventListener('click', () => {
    state.material = 'boxes';
    state.measureMode = 'known';
    state.current = {
      ...state.current,
      room: 'Bagno principale',
      quantity: '6,72',
      waste: '10',
      packArea: '1,44',
      unitPrice: '52',
      notes: 'Gres pavimento 60x60'
    };
    fillFormFromState();
    openStep(4);
    render();
    toast('Esempio caricato.');
  });

  $('exportBtn').addEventListener('click', exportBackup);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (event) => importBackup(event.target.files[0]));
  $('printBtn').addEventListener('click', printReport);

  $('proCta').addEventListener('click', () => showUpgradeModal('manual'));
  $('topProBtn').addEventListener('click', () => showUpgradeModal('manual'));
  $('bottomProBtn').addEventListener('click', () => showUpgradeModal('manual'));
  $('manageLicenseBtn').addEventListener('click', () => {
    if (confirm('Vuoi rimuovere la licenza Pro da questo dispositivo?')) {
      clearLicense();
      toast('Licenza rimossa.');
    }
  });

  $('closeModalBtn').addEventListener('click', closeUpgradeModal);
  $('upgradeModal').addEventListener('click', (event) => {
    if (event.target === $('upgradeModal')) closeUpgradeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('upgradeModal').classList.contains('hidden')) closeUpgradeModal();
  });
  $('activateBtn').addEventListener('click', activateLicense);
  $('buyBtn').addEventListener('click', () => window.open(CONFIG.gumroadUrl, '_blank', 'noopener'));

  $$('[data-feedback-action]').forEach((button) => {
    button.addEventListener('click', () => openFeedback({
      tipo: button.dataset.feedbackAction,
      strumento: button.dataset.feedbackTool || 'CompraGiusto Materiali',
      origine: button.dataset.feedbackOrigin || 'app'
    }));
  });

  $('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('cg_theme', next);
    document.documentElement.dataset.theme = next;
  });

  setupInstall();
}

let deferredInstallPrompt = null;
function setupInstall() {
  const installButton = $('installBtn');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.classList.remove('hidden');
  });

  installButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      toast('Usa il menu del browser per installarla.');
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.classList.add('hidden');
  });
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  }
}

async function init() {
  document.documentElement.dataset.theme = localStorage.getItem('cg_theme') || 'light';
  loadState();
  await refreshLicenseFromStorage();
  fillFormFromState();
  setupEvents();
  setTab('calculate');
  openStep(1);
  render();
  maybeRecheckLicense();
  registerServiceWorker();
}

window.setTab = setTab;
window.showUpgradeModal = showUpgradeModal;
document.addEventListener('DOMContentLoaded', init);
