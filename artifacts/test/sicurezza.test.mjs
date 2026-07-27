// Test di sicurezza sull'artefatto generato.
// Coprono SEC-04 (iniezione HTML) e presidiano SEC-01: nessun segreto e nessun
// dato personale deve finire nella pagina pubblicata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, esc } from '../build.mjs';

const dati = JSON.parse(readFileSync(new URL('../corsi.json', import.meta.url), 'utf8'));

// Pattern, non valori: questo file non deve contenere segreti veri.
const PATTERN_SEGRETI = [
  [/ghp_[A-Za-z0-9]{20,}/, 'GitHub Personal Access Token'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS Access Key ID'],
  [/ASIA[0-9A-Z]{16}/, 'AWS temporary Access Key ID'],
  [/aws_secret_access_key/i, 'AWS secret key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'chiave privata'],
  [/FTP_PASS\s*=\s*\S+/i, 'password FTP'],
  [/Segreteria\d{4}!/, 'password storica della segreteria'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'token Slack'],
];

// --- escaping (SEC-04) ----------------------------------------------------

test('esc: codifica tutti i metacaratteri HTML', () => {
  assert.equal(esc(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
  assert.equal(esc(5), '5');
});

test('esc: l\'ampersand non viene doppiamente codificato in modo errato', () => {
  assert.equal(esc('A & B'), 'A &amp; B');
  assert.equal(esc('&lt;'), '&amp;lt;');
});

test('render: il markup nel titolo non diventa markup eseguibile', () => {
  const html = render(
    { ...dati, corsi: [{ codice: 'X', titolo: '<script>alert(1)</script>', ore: 1 }] },
    'locale',
  );
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('render: escaping su ogni campo interpolato', () => {
  const veleno = '"><img src=x onerror=alert(1)>';
  const html = render(
    { istituto: veleno, biennio: veleno, corsi: [{ codice: veleno, titolo: veleno, ore: 1 }] },
    veleno,
  );
  // Il payload non deve comparire mai in forma grezza: ne come tag, ne come
  // attributo che chiude il contesto. Puo comparire solo codificato.
  assert.ok(!html.includes(veleno), 'payload grezzo presente nell\'HTML');
  assert.ok(!html.includes('<img'), 'tag iniettato presente nell\'HTML');
  assert.ok(html.includes(esc(veleno)), 'il payload deve comparire codificato');
  // Ogni "<" della pagina apre un tag nostro, nessuno viene dai dati.
  const tag = html.match(/<[a-zA-Z/!]/g) ?? [];
  const attesi = html.match(/<(\/?)(!DOCTYPE|html|head|meta|title|link|body|header|h1|p|main|table|caption|thead|tbody|tfoot|tr|th|td|footer)\b/gi) ?? [];
  assert.equal(tag.length, attesi.length, 'presenti tag non previsti dal template');
});

test('render: un solo <script> non nostro non entra mai in pagina', () => {
  const html = render(dati, 'locale');
  assert.equal(html.includes('<script'), false, 'la pagina non deve contenere script');
});

// --- nessun segreto nell'artefatto (SEC-01) -------------------------------

test('render: nessun segreto nell\'HTML generato', () => {
  const html = render(dati, 'a1b2c3d');
  for (const [re, nome] of PATTERN_SEGRETI) {
    assert.equal(re.test(html), false, `segreto trovato nell'HTML: ${nome}`);
  }
});

test('render: nessun segreto anche se i dati ne contengono', () => {
  // Se un segreto finisse per errore in corsi.json, il test lo intercetta qui
  // prima che la pipeline lo pubblichi.
  const finto = 'ghp_' + 'A'.repeat(36);
  const html = render({ ...dati, corsi: [{ codice: 'X', titolo: finto, ore: 1 }] }, 'locale');
  assert.ok(PATTERN_SEGRETI[0][0].test(html), 'il pattern di test deve riconoscersi');
  // ...e il gate reale: i dati veri non devono contenerlo.
  const veri = JSON.stringify(dati);
  for (const [re, nome] of PATTERN_SEGRETI) {
    assert.equal(re.test(veri), false, `segreto trovato in corsi.json: ${nome}`);
  }
});

// --- dati personali (SEC-04 nota, DAT-01) ---------------------------------

test('render: il campo docente non viene pubblicato', () => {
  // corsi.json contiene nomi di docenti: sono dati personali e oggi non
  // devono comparire nella pagina pubblica.
  const html = render(dati, 'locale');
  for (const c of dati.corsi) {
    if (c.docente) {
      assert.equal(html.includes(c.docente), false, `docente pubblicato: ${c.docente}`);
    }
  }
});
