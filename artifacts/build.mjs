import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "dist");
const DATA = path.join(HERE, "corsi.json");
const CSS = path.join(HERE, "style.css");

function esc(s) {
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
  if (!Array.isArray(dati.corsi)) throw new TypeError("corsi deve essere un array");
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
<tr><td class="cod">${esc(c.codice)}</td><td>${esc(c.titolo)}</td><td class="ore">${c.ore} h</td></tr>`).join('');
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

function main() {
  const dati = validateDati(JSON.parse(readFileSync(DATA, 'utf8')));
  const versione = process.env.GITHUB_SHA?.slice(0, 7) ?? 'locale';
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'index.html'), render(dati, versione));
  writeFileSync(path.join(OUT, 'versione.json'), JSON.stringify({ versione, corsi: dati.corsi.length, ore: totaleOre(dati.corsi) }, null, 2));
  if (existsSync(CSS)) cpSync(CSS, path.join(OUT, 'style.css'));
  console.log(`OK ${path.join('dist', 'index.html')} ${dati.corsi.length} corsi, ${totaleOre(dati.corsi)} ore, build ${versione}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
