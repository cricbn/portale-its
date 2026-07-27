import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "dist");
const DATA = path.join(HERE, "corsi.json");
const CSS = path.join(HERE, "style.css");

export function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function totaleOre(corsi) {
  if (!Array.isArray(corsi)) throw new TypeError("corsi must be an array");
  return corsi.reduce((acc, c) => acc + Number(c.ore), 0);
}

export function validateDati(dati) {
  if (!dati || typeof dati !== "object") throw new TypeError("dati invalidi");
  if (typeof dati.istituto !== "string" || !dati.istituto.trim()) throw new TypeError("istituto mancante");
  if (typeof dati.biennio !== "string" || !dati.biennio.trim()) throw new TypeError("biennio mancante");
  if (!Array.isArray(dati.corsi)) throw new TypeError("corsi deve essere un array");
  if (dati.corsi.length === 0) throw new TypeError("corsi e vuoto");
  for (const c of dati.corsi) {
    if (!c || typeof c !== "object") throw new TypeError("corso invalido");
    if (typeof c.codice !== "string" || !c.codice.trim()) throw new TypeError("codice mancante");
    if (typeof c.titolo !== "string" || !c.titolo.trim()) throw new TypeError("titolo mancante");
    if (!Number.isInteger(c.ore) || c.ore <= 0) throw new TypeError(`ore non valide per ${c.codice}`);
  }
  return dati;
}

export function render(dati, versione) {
  validateDati(dati);
  const tot = totaleOre(dati.corsi);
  const righe = dati.corsi.map((c) => `
<tr><td class="cod">${esc(c.codice)}</td><td>${esc(c.titolo)}</td><td class="ore">${esc(c.ore)} h</td></tr>`).join('');
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Portale corsi - ${esc(dati.istituto)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
<header>
  <h1>${esc(dati.istituto)}</h1>
  <p class="sub">Offerta formativa - biennio ${esc(dati.biennio)}</p>
</header>
<main>
  <table>
    <caption>Corsi e ore</caption>
    <thead>
      <tr><th scope="col">Codice</th><th scope="col">Unità formativa</th><th scope="col">Ore</th></tr>
    </thead>
    <tbody>${righe}
    </tbody>
    <tfoot>
      <tr><th scope="row" colspan="2">Totale ore erogate</th><td class="ore">${tot} h</td></tr>
    </tfoot>
  </table>
</main>
<footer>
  <p>build ${esc(versione)}</p>
</footer>
</body>
</html>`;
}

export function leggiDati() {
  let grezzo;
  try {
    grezzo = readFileSync(DATA, 'utf8');
  } catch (e) {
    throw new Error(`impossibile leggere ${DATA}: ${e.message}`);
  }
  let dati;
  try {
    dati = JSON.parse(grezzo);
  } catch (e) {
    throw new Error(`${DATA} non e JSON valido: ${e.message}`);
  }
  return validateDati(dati);
}

function main() {
  const dati = leggiDati();
  const versione = process.env.GITHUB_SHA?.slice(0, 7) || 'locale';
  const ore = totaleOre(dati.corsi);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'index.html'), render(dati, versione));
  writeFileSync(path.join(OUT, 'versione.json'), JSON.stringify({ versione, corsi: dati.corsi.length, ore }, null, 2) + '\n');
  if (existsSync(CSS)) cpSync(CSS, path.join(OUT, 'style.css'));
  console.log(`OK ${path.join('dist', 'index.html')} - ${dati.corsi.length} corsi, ${ore} ore, build ${versione}`);
}

// Guardia robusta su Windows e Linux: confronta due percorsi normalizzati,
// non una stringa URL concatenata a mano (cfr. BLD-01 della perizia).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    // Fallimento esplicito e rumoroso: la pipeline deve diventare rossa.
    console.error(`BUILD FALLITA: ${e.message}`);
    process.exit(1);
  }
}
