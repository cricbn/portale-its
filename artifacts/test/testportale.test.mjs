// Test di correttezza del generatore.
// Coprono i difetti BLD-02 (totale ore), SEC-04 (escaping) e DAT-02 (validazione)
// individuati dalla perizia: servono a impedire che rientrino.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, totaleOre, esc, validateDati } from '../build.mjs';

const dati = JSON.parse(readFileSync(new URL('../corsi.json', import.meta.url), 'utf8'));

// --- totaleOre (BLD-02) ---------------------------------------------------

test('totaleOre: totale corretto sui dati reali', () => {
  // 60+40+36+48+60+76 = 320. La perizia rilevava 260 per uno slice(1) di troppo.
  assert.equal(totaleOre(dati.corsi), 320);
});

test('totaleOre: nessun corso viene scartato', () => {
  const somma = dati.corsi.reduce((a, c) => a + c.ore, 0);
  assert.equal(totaleOre(dati.corsi), somma);
});

test('totaleOre: array vuoto vale 0', () => {
  assert.equal(totaleOre([]), 0);
});

test('totaleOre: rifiuta un non-array', () => {
  assert.throws(() => totaleOre(null), TypeError);
  assert.throws(() => totaleOre({ ore: 1 }), TypeError);
});

// --- validazione dei dati in ingresso (DAT-02) ----------------------------

test('validateDati: accetta i dati reali', () => {
  assert.equal(validateDati(dati), dati);
});

for (const [nome, mutazione] of [
  ['ore mancante', (d) => { delete d.corsi[0].ore; }],
  ['ore come stringa', (d) => { d.corsi[0].ore = '60'; }],
  ['ore negative', (d) => { d.corsi[0].ore = -5; }],
  ['ore a zero', (d) => { d.corsi[0].ore = 0; }],
  ['codice mancante', (d) => { delete d.corsi[0].codice; }],
  ['titolo vuoto', (d) => { d.corsi[0].titolo = '   '; }],
  ['corsi non array', (d) => { d.corsi = 'niente'; }],
  ['corsi vuoto', (d) => { d.corsi = []; }],
  ['istituto mancante', (d) => { delete d.istituto; }],
  ['biennio mancante', (d) => { delete d.biennio; }],
]) {
  test(`validateDati: rifiuta ${nome}`, () => {
    const rotto = structuredClone(dati);
    mutazione(rotto);
    assert.throws(() => validateDati(rotto), TypeError, `"${nome}" doveva fallire`);
  });
}

test('validateDati: nessun NaN puo raggiungere il totale', () => {
  // DAT-02: prima un corso senza "ore" produceva NaN pubblicato in pagina.
  const rotto = structuredClone(dati);
  delete rotto.corsi[2].ore;
  assert.throws(() => validateDati(rotto), TypeError);
  assert.ok(Number.isFinite(totaleOre(dati.corsi)));
});

// --- render (contenuto) ---------------------------------------------------

test('render: include tutti i corsi con codice, titolo e ore', () => {
  const html = render(dati, 'locale');
  for (const c of dati.corsi) {
    assert.ok(html.includes(esc(c.codice)), `manca il codice ${c.codice}`);
    assert.ok(html.includes(esc(c.titolo)), `manca il titolo ${c.titolo}`);
    assert.ok(html.includes(`${c.ore} h`), `mancano le ore di ${c.codice}`);
  }
  assert.equal(html.match(/<tr><td class="cod"/g).length, dati.corsi.length);
});

test('render: pubblica il totale corretto in pagina', () => {
  const html = render(dati, 'locale');
  assert.ok(html.includes('Totale ore erogate'));
  assert.ok(html.includes('320 h'));
  assert.ok(!html.includes('260 h'));
});

test('render: rifiuta dati non validi invece di produrre pagine rotte', () => {
  assert.throws(() => render({ istituto: 'x', biennio: 'y', corsi: [{ codice: 'A' }] }, 'v'), TypeError);
});
