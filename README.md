# portale-its

Generatore statico del portale dei corsi dell'ITS ICT Piemonte, con la perizia
tecnica che ne ha analizzato lo stato iniziale e la bonifica applicata.

## Struttura del repository

| Percorso | Contenuto |
|---|---|
| [perizia.md](perizia.md) | Perizia tecnica sullo stato `as-is` — 29 criticita e piano di azione in 5 fasi |
| [as-is/](as-is/) | **Stato analizzato, congelato.** Corrisponde al commit `84ecad8` esaminato dalla perizia. Non va modificato: alterarlo invaliderebbe le evidenze citate nel documento |
| [artifacts/](artifacts/) | **Versione bonificata.** E il codice su cui lavorare |
| [.github/](.github/) | Pipeline di rilascio e gate di sicurezza |

## Requisiti

Node.js >= 20.11. Nessuna dipendenza esterna.

## Build e test

Da `artifacts/`:

```sh
npm ci
npm test        # correttezza, sicurezza, artefatti
npm run build   # genera dist/index.html, dist/versione.json, dist/style.css
```

Il build risolve i percorsi dalla posizione dello script, quindi funziona da
qualunque directory di lavoro (`node artifacts/build.mjs` dalla radice va bene).
Termina con codice diverso da zero, e con un messaggio esplicito, se
`corsi.json` non supera la validazione.

## Pubblicazione

**Non si pubblica a mano e non si usa FTP.** Si pubblica facendo merge su
`main`: la pipeline costruisce, collauda l'infrastruttura su un finto AWS,
attende l'approvazione di una persona e poi pubblica l'artefatto gia costruito.

La procedura completa — inclusi rollback e configurazione una tantum degli
Environment — e in **[artifacts/DEPLOY.md](artifacts/DEPLOY.md)**.

| Workflow | Cosa fa |
|---|---|
| [release.yml](.github/workflows/release.yml) | build -> collaudo su moto -> approvazione -> produzione -> rollback |
| [sicurezza.yml](.github/workflows/sicurezza.yml) | segreti (gitleaks), IaC (checkov + policy sui tag), test applicativi |

## Infrastruttura come codice

Il **binario principale e [artifacts/main.tf](artifacts/main.tf)** (Terraform).
[artifacts/portale-its.yaml](artifacts/portale-its.yaml) descrive le stesse
risorse in CloudFormation ed e mantenuto allineato, ma in caso di divergenza
vale il Terraform. Entrambi sono applicati e verificati a ogni release contro
un finto AWS.

Il bucket del sito e privato, versionato e cifrato, con public access block su
tutti e quattro i controlli; la tabella `iscrizioni` ha cifratura, point-in-time
recovery e tag di governance.

## Stato della bonifica

Applicate le correzioni di codice, infrastruttura, processo e automazione:
vedi l'elenco puntuale in [artifacts/summary.json](artifacts/summary.json).

- `BLD-01` guardia di ingresso corretta — il build produce output su Windowss
- `BLD-02` totale ore corretto: **320**
- `BLD-03` percorsi risolti da `import.meta.url`, non dalla CWD
- `BLD-04` lockfile presente, `left-pad` rimossa, `engines.node` dichiarato.
- `BLD-05` test con `node:test` e script `test`.
- `SEC-04` escaping HTML su tutti i valori interpolati
- `DAT-02` validazione di `corsi.json` con uscita in errore
- `FE-01` / `FE-02` contrasto WCAG AA e semantica della tabella

- **Rotazione dei segreti (`SEC-01`)** — password FTP e token `ghp_...` sono
  nella storia Git ai commit `84ecad8`, `47908ad`, `d55b0b9` e vanno
  considerati compromessi. Vanno revocati e sostituiti sul provider di origine;
  rimuoverli dai file correnti non e un rimedio. Dettagli in
  [DEPLOY.md §6](artifacts/DEPLOY.md#6-segreti-storici).
- **TLS (`SEC-05`)** — il sito va servito via CloudFront con certificato ACM.
  Il bucket e gia predisposto (privato, nessun website endpoint pubblicato).
- **Classificazione della tabella `iscrizioni` (`DAT-01`)** — va ispezionato
  cosa contiene prima di ogni decisione su retention e chiave di cifratura.
