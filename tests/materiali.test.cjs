'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const calc = require('../calc.js');

const common = {kind:'tiles',mode:'known',amount:'6,72',packArea:'1,44',waste:'10',price:'52'};
test('Decimali con punto e virgola e migliaia',()=>{
  for (const [s,n] of [['1.44',1.44],['1,44',1.44],['1.234,56',1234.56],['1,234.56',1234.56],['12',12]]) assert.equal(calc.parseNumber(s),n);
  for (const s of ['', '12a','1,2,3','-','2.5.7']) assert.equal(calc.parseNumber(s),null);
});
test('Piastrelle: sei scatole da 1,44 m²',()=>{
  const x=calc.estimate(common);
  assert.equal(x.units,6);assert.equal(x.cost,312);
  assert.ok(Math.abs(x.bought-8.64)<1e-8);
  assert.ok(Math.abs(x.extra-(8.64-7.392))<1e-8);
});
test('Pittura: sfrido influisce davvero sul numero di barattoli',()=>{
  const item={kind:'paint',mode:'known',amount:'48',paintYield:'10',paintCan:'5',coats:'2',price:'42'};
  assert.equal(calc.estimate({...item,waste:'0'}).units,2);
  assert.equal(calc.estimate({...item,waste:'20'}).units,3);
});
test('Linear: calcola perimetro e pezzi',()=>{
  const x=calc.estimate({kind:'linear',mode:'rect',length:'3',width:'2',pieceLength:'2,4',waste:'10'});
  assert.equal(x.base,10);assert.equal(x.units,5);assert.equal(x.cost,null);
});
test('Colla: calcola consumo e sacchi',()=>{
  const x=calc.estimate({kind:'compound',mode:'known',amount:'10',rate:'4',bagWeight:'25',waste:'10',price:'25'});
  assert.equal(x.units,2);assert.equal(x.cost,50);
});
test('Pareti con apertura esplicita',()=>{
  const x=calc.measure({mode:'walls',kind:'tiles',length:'3',width:'2',height:'2,7',openings:'3'});
  assert.ok(Math.abs(x.value-24)<1e-8);
  assert.ok(calc.measure({mode:'walls',kind:'tiles',length:'3',width:'2',height:'2,7',openings:'30'}).error);
});
test('Più superfici: formule, numeri isolati, righe invalide',()=>{
  const x=calc.measure({kind:'tiles',mode:'parts',parts:'3,2×2,1\n1.4'});
  assert.ok(Math.abs(x.value-8.12)<1e-8);
  assert.ok(calc.measure({kind:'tiles',mode:'parts',parts:'3,2xciao'}).error);
});
test('Non accetta input impossibili; prezzo facoltativo',()=>{
  assert.ok(calc.estimate({...common,amount:'-2'}).error);
  assert.ok(calc.estimate({...common,packArea:'0'}).error);
  assert.ok(calc.estimate({...common,waste:'201'}).error);
  assert.equal(calc.estimate({...common,price:''}).cost,null);
  assert.equal(calc.estimate({...common,price:'0'}).cost,0);
});
test('Migrazione: la misura legacy non viene moltiplicata per 100',()=>{
  const context=vm.createContext({
    window:{MaterialiCalc:calc,crypto:{randomUUID:()=> 'test-id'}},
    document:{addEventListener(){}},
    localStorage:{getItem(){return null;},setItem(){}},
    console,Intl,Number,Date,Math,JSON,String,Array,Object,RegExp
  });
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  const restored=vm.runInContext("legacyInput({material:'boxes',base:6.72,packArea:1.44,unitPrice:52,waste:10})",context);
  assert.equal(restored.amount,'6,72');assert.equal(restored.packArea,'1,44');
  assert.equal(calc.estimate(restored).units,6);
  assert.equal(calc.estimate(restored).cost,312);
});
test('Nessuna traccia di Pro o Gumroad nella UI',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const js=fs.readFileSync('app.js','utf8');
  assert.ok(!/gumroad|sblocca pro|license.key|verify-license/i.test(html+js));
});
