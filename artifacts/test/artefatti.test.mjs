// Test end-to-end del build: verifica che gli artefatti vengano davvero
// prodotti (BLD-01), da qualunque directory di lavoro (BLD-03), e che un dato
// non valido faccia fallire il processo con codice != 0 (DAT-02).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync, existsSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PROGETTO = fileURLToPath(new URL('..', import.meta.url));
const BUILD = path.join(PROGETTO, 'build.mjs');
const RADICE = path.join(PROGETTO, '..');

function buildIn(dir) {
  const script = path.join(dir, 'build.mjs');
  rmSync(path.join(dir, 'dist'), { recursive: true, force: true });
  execFileSync(process.execPath, [script], { cwd: RADICE, encoding: 'utf8' });
  return path.join(dir, 'dist');
}

test('build: produce index.html, versione.json e style.css', () => {
  const dist = buildIn(PROGETTO);
  for (const f of ['index.html', 'versione.json', 'style.css']) {
    assert.ok(existsSync(path.join(dist, f)), `manca dist/${f}`);
  }
});

test('build: funziona lanciato da una CWD diversa dalla sua cartella', () => {
  // BLD-03: i percorsi si risolvono dalla posizione dello script, non dalla CWD.
  const dist = buildIn(PROGETTO);
  assert.ok(existsSync(path.join(dist, 'index.html')));
});

test('build: versione.json e coerente con la pagina', () => {
  const dist = buildIn(PROGETTO);
  const v = JSON.parse(readFileSync(path.join(dist, 'versione.json'), 'utf8'));
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const dati = JSON.parse(readFileSync(path.join(PROGETTO, 'corsi.json'), 'utf8'));

  assert.equal(v.corsi, dati.corsi.length);
  assert.equal(v.ore, 320);
  assert.ok(typeof v.versione === 'string' && v.versione.length > 0);
  // Il totale scritto nell'artefatto e quello mostrato in pagina coincidono.
  assert.ok(html.includes(`${v.ore} h`));
  assert.ok(html.includes(`build ${v.versione}`));
});

test('build: fallisce con codice != 0 se i dati non sono validi', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'portale-'));
  try {
    for (const f of ['build.mjs', 'corsi.json', 'style.css']) {
      cpSync(path.join(PROGETTO, f), path.join(tmp, f));
    }
    const dati = JSON.parse(readFileSync(path.join(tmp, 'corsi.json'), 'utf8'));
    delete dati.corsi[0].ore;
    writeFileSync(path.join(tmp, 'corsi.json'), JSON.stringify(dati));

    const r = spawnSync(process.execPath, [path.join(tmp, 'build.mjs')], { encoding: 'utf8' });
    assert.notEqual(r.status, 0, 'il build doveva fallire');
    assert.match(r.stderr, /BUILD FALLITA/);
    assert.ok(!existsSync(path.join(tmp, 'dist', 'index.html')), 'non deve pubblicare nulla');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('build: fallisce se corsi.json non e JSON valido', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'portale-'));
  try {
    cpSync(BUILD, path.join(tmp, 'build.mjs'));
    writeFileSync(path.join(tmp, 'corsi.json'), '{ non json');
    const r = spawnSync(process.execPath, [path.join(tmp, 'build.mjs')], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /non e JSON valido/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
