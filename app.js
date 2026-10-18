'use strict';
/* Casa / Materiali. Nessun account, nessuna licenza, dati solo locali. */
const C = window.MaterialiCalc;
const KEY = 'casa_materiali_v4';
const LEGACY_KEY = 'cg_materiali_v3_state';
const fields = ['amount','length','width','height','openings','parts','packArea','paintYield','paintCan','coats','pieceLength','rate','bagWeight','waste','price','room','details'];
const defaults = () => ({
  kind:'tiles',mode:'known',amount:'',length:'',width:'',height:'',openings:'',parts:'',
  packArea:'',paintYield:'',paintCan:'',coats:'2',pieceLength:'',rate:'',bagWeight:'',
  waste:'10',price:'',room:'',details:''
});
const state = { items:[], draft:defaults(), editingId:null, tab:'calc' };
const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const text = value => typeof value === 'number' || typeof value === 'string' ? String(value) : '';
const numberText = value => value == null || value === '' ? '' : String(value).replace('.', ',');
const labelUnits = kind => ({tiles:'scatola',paint:'barattolo',linear:'pezzo',compound:'sacco'}[kind] || 'unità');

function id() {
  return window.crypto && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}
function cleanedInput(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const clean = defaults();
  for (const key of fields) {
    clean[key] = text(raw[key]).slice(0, key === 'details' ? 200 : key === 'room' ? 80 : key === 'parts' ? 3000 : 100);
  }
  clean.kind = C.labels[raw.kind] ? raw.kind : 'tiles';
  clean.mode = ['known','rect','walls','parts'].includes(raw.mode) ? raw.mode : 'known';
  if (clean.kind === 'linear' && clean.mode === 'walls') clean.mode = 'known';
  return clean;
}
function legacyInput(item) {
  const mapping = {boxes:'tiles',paint:'paint',linear:'linear',kg:'compound'};
  return cleanedInput({
    kind: mapping[item.material] || 'tiles', mode:'known', amount:numberText(item.base),
    packArea:numberText(item.packArea), paintYield:numberText(item.paintYield),
    paintCan:numberText(item.canLiters), coats:numberText(item.coats) || '2',
    pieceLength:numberText(item.pieceLength), rate:numberText(item.kgPerMq),
    bagWeight:numberText(item.kgPack), waste:numberText(item.waste) || '0',
    price:numberText(item.unitPrice), room:text(item.room), details:text(item.notes)
  });
}
function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const input = item.input ? cleanedInput(item.input) : item.material ? legacyInput(item) : cleanedInput(item);
  if (C.estimate(input).error) return null;
  return {
    id: typeof item.id === 'string' && item.id.length < 100 ? item.id : id(),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    input
  };
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version:4, items:state.items, draft:state.draft }));
    return true;
  } catch {
    toast('Non riesco a salvare sul dispositivo. Esporta una copia della lista.');
    return false;
  }
}
function restore() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (stored && Array.isArray(stored.items)) {
      state.items = stored.items.slice(0,1000).map(normalizeItem).filter(Boolean);
      state.draft = cleanedInput(stored.draft || defaults());
      return;
    }
    // Migrazione non distruttiva: conserviamo anche i dati della versione precedente.
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (old && Array.isArray(old.items)) {
      state.items = old.items.slice(0,1000).map(normalizeItem).filter(Boolean);
      state.draft = defaults();
      persist();
      if (state.items.length) toast('Abbiamo recuperato i tuoi calcoli precedenti.');
    }
  } catch {
    toast('Alcuni dati salvati non sono leggibili. Puoi importare una copia.');
  }
}
function fillForm() {
  const form = $('calcForm');
  for (const key of fields) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = state.draft[key];
  $('optionalFields').open = Boolean(state.draft.room || state.draft.details);
  syncChoices();
}
function readForm() {
  const values = {...state.draft};
  for (const key of fields) {
    const el = $('calcForm').elements.namedItem(key);
    if (el) values[key] = el.value;
  }
  state.draft = cleanedInput(values);
}
function syncChoices() {
  const {kind,mode} = state.draft;
  $$('[data-kind]').forEach(b => {
    const active = b.dataset.kind === kind;
    b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active));
  });
  $$('[data-mode]').forEach(b => {
    const active = b.dataset.mode === mode;
    b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active));
    b.classList.toggle('hidden',b.dataset.mode === 'walls' && kind === 'linear');
  });
  ['known','rect','walls','parts'].forEach(name => {
    const visible = name === mode || name === 'rect' && mode === 'walls';
    $(name+'Fields').classList.toggle('hidden',!visible);
  });
  ['tiles','paint','linear','compound'].forEach(name =>
    $(name+'Fields').classList.toggle('hidden',name !== kind));
  $('amountLabel').textContent = kind === 'linear' ? 'Metri lineari (m)' : 'Superficie (m²)';
  $('priceLabel').innerHTML = 'Prezzo per '+labelUnits(kind)+' (€) <span class="muted">(facoltativo)</span>';
}
function renderEstimate() {
  const result = C.estimate(state.draft);
  const valid = !result.error;
  $('saveBtn').disabled = !valid;
  $('mobileSaveBtn').disabled = !valid;
  $('saveBtn').firstChild.textContent = state.editingId ? 'Salva modifiche ' : 'Aggiungi alla lista ';
  $('mobileSaveBtn').firstChild.textContent = state.editingId ? 'Salva ' : 'Aggiungi ';
  $('cancelEditBtn').classList.toggle('hidden',!state.editingId);
  $('resultQuantity').textContent = valid ? result.units+' '+result.unitLabel : '—';
  $('mobileQty').textContent = valid ? result.units+' '+result.unitLabel : '—';
  $('resultError').textContent = valid ? 'Con '+C.format(result.waste)+'% di sfrido.' : result.error;
  $('resultError').classList.toggle('error',!valid && Boolean(state.draft.amount || state.draft.length || state.draft.parts));
  $('resultBase').textContent = valid ? C.format(result.base)+' '+result.measureUnit : '—';
  $('resultNeeded').textContent = valid ? C.format(result.needed)+' '+result.quantityUnit : '—';
  $('resultExtra').textContent = valid ? C.format(result.extra)+' '+result.quantityUnit : '—';
  $('resultCost').textContent = valid ? C.euros(result.cost) : '—';
}
function setTab(tab) {
  state.tab = tab;
  document.body.dataset.tab = tab;
  $('calcPanel').classList.toggle('active',tab === 'calc');
  $('listPanel').classList.toggle('active',tab === 'list');
  $$('[data-tab]').forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active',active);
    if (active) b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });
  if (tab === 'list') renderList();
  window.scrollTo({top:0,behavior:'instant'});
}
function setKind(kind) {
  if (!C.labels[kind]) return;
  readForm();
  state.draft.kind = kind;
  if (kind === 'linear' && state.draft.mode === 'walls') state.draft.mode = 'known';
  syncChoices(); renderEstimate(); persist();
}
function setMode(mode) {
  if (!['known','rect','walls','parts'].includes(mode)) return;
  if (mode === 'walls' && state.draft.kind === 'linear') return;
  readForm(); state.draft.mode = mode;
  syncChoices(); renderEstimate(); persist();
}
function save() {
  readForm();
  const result = C.estimate(state.draft);
  if (result.error) {
    $('resultError').textContent = result.error;
    toast(result.error);
    return;
  }
  const item = { id:state.editingId || id(), createdAt:new Date().toISOString(), input:cleanedInput(state.draft) };
  const old = state.items;
  if (state.editingId) {
    const index = state.items.findIndex(x => x.id === state.editingId);
    if (index < 0) { state.editingId = null; toast('Elemento non trovato.'); return; }
    item.createdAt = state.items[index].createdAt;
    state.items = state.items.map(x => x.id === state.editingId ? item : x);
  } else {
    state.items = [item,...state.items];
  }
  if (!persist()) {state.items = old; return;}
  state.editingId = null;
  updateCount();
  setTab('list');
  toast(old.some(x => x.id === item.id) ? 'Modifiche salvate.' : 'Aggiunto alla lista.');
}
function resetDraft() {
  state.editingId = null;
  state.draft = defaults();
  fillForm(); renderEstimate(); persist();
}
function edit(itemId) {
  const item = state.items.find(x => x.id === itemId);
  if (!item) return;
  state.editingId = item.id;
  state.draft = cleanedInput(item.input);
  fillForm(); renderEstimate(); persist(); setTab('calc');
  $('calcForm').scrollIntoView({block:'start',behavior:'instant'});
}
function remove(itemId) {
  if (!confirm('Eliminare questo materiale dalla lista?')) return;
  const old = state.items;
  state.items = old.filter(x => x.id !== itemId);
  if (!persist()) {state.items = old; return;}
  updateCount(); renderList(); toast('Materiale eliminato.');
}
function copy(itemId) {
  const item = state.items.find(x => x.id === itemId);
  if (!item) return;
  state.editingId = null;
  state.draft = {...cleanedInput(item.input)};
  fillForm(); renderEstimate(); persist(); setTab('calc');
  toast('Controlla i dati e aggiungi una nuova voce.');
}
function updateCount() {
  const count = state.items.length;
  $('listCount').textContent = String(count);
  $('listCount').classList.toggle('hidden',count === 0);
}
function itemCard(item) {
  const calc = C.estimate(item.input);
  if (calc.error) return null;
  const card = document.createElement('article');
  card.className = 'item';
  const info = document.createElement('div');
  info.className = 'itemInfo';
  const heading = document.createElement('strong');
  heading.textContent = item.input.details || calc.material;
  const line = document.createElement('span');
  line.textContent = [item.input.details ? calc.material : '', item.input.room, C.format(calc.base)+' '+calc.measureUnit].filter(Boolean).join(' · ');
  info.append(heading,line);
  const right = document.createElement('div');
  right.className = 'itemResult';
  const numbers = document.createElement('div');
  numbers.className = 'itemNums';
  const units = document.createElement('strong');
  units.textContent = calc.units+' '+calc.unitLabel;
  const cost = document.createElement('small');
  cost.textContent = calc.cost === null ? 'Prezzo da aggiungere' : C.euros(calc.cost);
  numbers.append(units,cost);
  const actions = document.createElement('div');
  actions.className = 'itemButtons';
  [['Modifica',()=>edit(item.id),''],['Copia',()=>copy(item.id),''],['Elimina',()=>remove(item.id),'danger']].forEach(([label,handler,cls])=>{
    const button = document.createElement('button');
    button.type = 'button';button.textContent = label;button.className = cls;button.addEventListener('click',handler);actions.append(button);
  });
  right.append(numbers,actions);card.append(info,right);
  return card;
}
function renderList() {
  $('summaryCount').textContent = String(state.items.length);
  const calculations = state.items.map(x => C.estimate(x.input)).filter(x => !x.error);
  const priced = calculations.filter(x => x.cost !== null);
  const total = priced.reduce((sum,item)=>sum+item.cost,0);
  $('summaryCost').textContent = priced.length ? C.euros(total) : '—';
  const missing = calculations.length - priced.length;
  $('summaryMissing').textContent = missing ? missing+' senza prezzo'+(priced.length ? ' · totale parziale' : '') : '';
  const root = $('listItems');
  root.replaceChildren();
  if (!state.items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const title = document.createElement('strong');
    title.textContent = 'La lista è vuota';
    const tip = document.createElement('span');
    tip.textContent = 'Calcola il primo materiale e aggiungilo qui.';
    empty.append(title,tip);root.append(empty);return;
  }
  state.items.forEach(item=>{const card=itemCard(item);if(card)root.append(card);});
}
function exportList() {
  const payload = {app:'Casa Materiali',version:4,exportedAt:new Date().toISOString(),items:state.items};
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const link = document.createElement('a');
  link.href=url;link.download='casa-materiali-lista.json';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function importList(file) {
  if (!file) return;
  try {
    if (file.size > 2000000) throw Error('File troppo grande.');
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length > 1000) throw Error('Formato non valido.');
    const entries = parsed.items.map(normalizeItem);
    if (entries.some(x => x === null)) throw Error('La lista contiene dati non validi.');
    const ids = new Set();
    for (const item of entries) {
      if (ids.has(item.id)) item.id = id();
      ids.add(item.id);
    }
    if (!confirm('Sostituire la lista attuale con '+entries.length+' materiali? Esporta prima una copia se vuoi conservarla.')) return;
    const previous = state.items;
    state.items = entries;
    if (!persist()) {state.items=previous;return;}
    state.editingId=null;
    updateCount();renderList();toast('Lista importata.');
  } catch (error) {
    toast(error.message || 'Impossibile importare il file.');
  } finally {
    $('importFile').value='';
  }
}
let toastTimer;
function toast(message) {
  const box = $('toast');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>box.classList.remove('show'),3000);
}
function init() {
  restore();
  fillForm();
  renderEstimate();
  updateCount();
  $$('[data-kind]').forEach(b=>b.addEventListener('click',()=>setKind(b.dataset.kind)));
  $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $$('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  $('calcForm').addEventListener('input',()=>{readForm();renderEstimate();persist();});
  $('saveBtn').addEventListener('click',save);
  $('mobileSaveBtn').addEventListener('click',save);
  $('cancelEditBtn').addEventListener('click',()=>{resetDraft();toast('Modifica annullata.');});
  $('newBtn').addEventListener('click',()=>{resetDraft();setTab('calc');});
  $('clearBtn').addEventListener('click',()=>{resetDraft();});
  $('exportBtn').addEventListener('click',exportList);
  $('importBtn').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',e=>importList(e.target.files[0]));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}
document.addEventListener('DOMContentLoaded',init);
