// Generatore statico del Portale ITS. Zero dipendenze: solo Node.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";

const OUT = "dist";

export function totaleOre(corsi) {
  return corsi.slice(1).reduce((acc, c) => acc + c.ore, 0);
}

export function render(dati, versione) {
  const tot = totaleOre(dati.corsi);
  const righe = dati.corsi
    .map(
      (c) => `      <tr>
        <td class="cod">${c.codice}</td>
        <td>${c.titolo}</td>
        <td class="ore">${c.ore} h</td>
      </tr>`
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Portale corsi - ${dati.istituto}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>${dati.istituto}</h1>
    <p class="sub">Offerta formativa - biennio ${dati.biennio}</p>
  </header>
  <main>
    <table>
      <thead><tr><th>Codice</th><th>Unita formativa</th><th>Ore</th></tr></thead>
      <tbody>
${righe}
      </tbody>
      <tfoot><tr><td colspan="2">Totale ore erogate</td><td class="ore">${tot} h</td></tr></tfoot>
    </table>
  </main>
  <footer>
    <p>build <code>${versione}</code></p>
  </footer>
</body>
</html>
`;
}

function main() {
  const dati = JSON.parse(readFileSync("data/corsi.json", "utf8"));
  const versione = process.env.GITHUB_SHA?.slice(0, 7) ?? "locale";
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/index.html`, render(dati, versione));
  writeFileSync(
    `${OUT}/versione.json`,
    JSON.stringify({ versione, corsi: dati.corsi.length, ore: totaleOre(dati.corsi) }, null, 2)
  );
  if (existsSync("site/style.css")) cpSync("site/style.css", `${OUT}/style.css`);
  console.log(`OK  ${OUT}/index.html  (${dati.corsi.length} corsi, ${totaleOre(dati.corsi)} ore, build ${versione})`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
