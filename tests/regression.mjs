import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('app.js','utf8');
const sw = fs.readFileSync('sw.js','utf8');
const html = fs.readFileSync('index.html','utf8');
const fn = fs.readFileSync('netlify/functions/verify-license.js','utf8');

const results=[];
function test(name, condition, detail='') { results.push({name, ok: Boolean(condition), detail}); }
function includes(s, text){ return s.includes(text); }

// Static regression checks
test('app.js starts clean', !/^D?["']use strict/.test(app.trim()) || app.trim().startsWith("'use strict';") || app.trim().startsWith('"use strict";'), app.slice(0,30));
test('No D before use strict', !app.trimStart().startsWith('D"use strict"') && !app.trimStart().startsWith("D'use strict'"));
test('Version updated 3.4.0', includes(app, "version: '3.4.0'"));
test('Gumroad URL configured', includes(app, "https://giusebuild.gumroad.com/l/compragiusto-materiali-pro"));
test('Tally feedback URL configured', includes(app, "https://tally.so/r/EkBJJB"));
test('Feedback URL enriches versione', includes(app, 'versione: CONFIG.version'));
test('Step 2 mode selection stays on step 2', includes(app, 'openStep(2);') && !includes(app, "setMeasureMode(button.dataset.mode);\n      openStep(3);"));
test('Step 2 focuses fields after mode choice', includes(app, "button.dataset.mode === 'parts'") && includes(app, "focusField(target)"));
test('Archive render has null-safe summary', includes(app, 'const legacySaved = $(\'summarySaved\')') || includes(app, 'const legacySaved = $("summarySaved")'));
test('Tools use Avvisami fallback', includes(app, 'Avvisami'));
test('Feedback action buttons wired', includes(html, 'data-feedback-action="problema"') && includes(html, 'data-feedback-action="nuova-app"'));
test('Index references app version', includes(html, 'app.js?v=3.4.0'));
test('Index references css version', includes(html, 'styles.css?v=3.4.0'));
test('Service worker cache version updated', includes(sw, 'compra-giusto-materiali-v3-4-0'));
test('Verify function has lifetime default', includes(fn, '3650') || includes(fs.readFileSync('.env.example','utf8'), '3650'));
test('No private key value committed', !/LICENSE_PRIVATE_JWK\s*=\s*\{/.test(app + sw + html + fn + fs.readFileSync('README.md','utf8')));

// JS syntax already validated by node --check externally; run pure calculation tests in VM.
const context={
  window:{COMPRA_GIUSTO_LICENSE_PUBLIC_JWK:null,setTab:null,showUpgradeModal:null,open:null},
  document:{addEventListener(){}, getElementById(){return null}, querySelectorAll(){return []}},
  console, localStorage:{getItem(){return null},setItem(){},removeItem(){}},
  Intl, Number, Date, Math, JSON, String, Array, Object, RegExp, URL,
  setTimeout(){}, clearTimeout(){}, navigator:{onLine:true}, crypto:{subtle:null}, TextEncoder, TextDecoder, atob, btoa
};
vm.createContext(context);
try {
  vm.runInContext(app, context);
  test('VM load app.js senza crash', true);
  test('parseNum italiano', context.parseNum('1.234,56 €') === 1234.56);
  test('parseParts somma righe e moltiplicazioni', Math.abs(context.parseParts('3,2x2,1\n1,4\n0,8') - 8.92) < 1e-9);
  const boxes = context.calculate({material:'boxes',base:6.72,waste:10,packArea:1.44,unitPrice:52});
  test('Calcolo confezioni corretto', boxes.units === 6 && Math.abs(boxes.cost - 312) < 1e-9, JSON.stringify(boxes));
  const paint = context.calculate({material:'paint',base:48,waste:0,paintYield:10,canLiters:5,coats:2,unitPrice:42});
  test('Calcolo pittura corretto', paint.units === 2 && paint.cost === 84, JSON.stringify(paint));
  const linear = context.calculate({material:'linear',base:12,waste:10,pieceLength:2.4,unitPrice:8});
  test('Calcolo lineare corretto', linear.units === 6 && linear.cost === 48, JSON.stringify(linear));
  const kg = context.calculate({material:'kg',base:10,waste:10,kgPerMq:4,kgPack:25,unitPrice:25});
  test('Calcolo kg corretto', kg.units === 2 && kg.cost === 50, JSON.stringify(kg));
  const url = context.feedbackUrl({tipo:'tool',strumento:'Cassa Sicura Cantiere',origine:'tab-strumenti'});
  test('Feedback URL contiene Tally', url.startsWith('https://tally.so/r/EkBJJB?'), url);
  test('Feedback URL contiene versione', url.includes('versione=3.4.0'), url);
  test('Feedback URL contiene tipo', url.includes('tipo=tool'), url);
} catch (e) {
  test('VM load app.js senza crash', false, e.stack || e.message);
}

console.table(results.map(r=>({ok:r.ok?'OK':'FAIL', test:r.name, detail:r.detail?.slice?.(0,80)||''})));
const failed=results.filter(r=>!r.ok);
if (failed.length) {
  console.error('\nFAILED TESTS:', failed);
  process.exit(1);
}
console.log(`\nAll ${results.length} tests passed.`);
