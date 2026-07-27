import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, totaleOre } from '../build.mjs';

const dati = JSON.parse(readFileSync(new URL('../corsi.json', import.meta.url), 'utf8'));

test('totale ore corretto', () => {
  assert.equal(totaleOre(dati.corsi), 320);
});

test('render include tutti i corsi', () => {
  const html = render(dati, 'locale');
  for (const c of dati.corsi) {
    assert.ok(html.includes(c.titolo));
    assert.ok(html.includes(`${c.ore} h`));
  }
  assert.ok(html.includes('Totale ore erogate'));
  assert.ok(html.includes('320 h'));
});

test('render escapa markup', () => {
  const html = render({ ...dati, corsi: [{ codice: 'X', titolo: '<script>alert(1)</script>', ore: 1 }] }, 'locale');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
});
