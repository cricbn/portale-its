# portale-its

Generatore statico del portale dei corsi dell'ITS ICT Piemonte, con la perizia
tecnica che ne ha analizzato lo stato iniziale.

## Struttura del repository

| Percorso | Contenuto |
|---|---|
| [perizia.md](perizia.md) | Perizia tecnica sullo stato `as-is` — 29 criticita e piano di azione in 5 fasi |
| [as-is/](as-is/) | **Stato analizzato, congelato.** Corrisponde al commit `84ecad8` esaminato dalla perizia. Non va modificato: alterarlo invaliderebbe le evidenze citate nel documento |
| [artifacts/](artifacts/) | **Versione bonificata**, con le correzioni della Fase 1 gia applicate. E il codice su cui lavorare |

## Requisiti

Node.js >= 20.11. Nessuna dipendenza esterna.

## Build e test

Da `artifacts/`:

```sh
npm test        # 3 test su totaleOre e render
npm run build   # genera dist/index.html, dist/versione.json, dist/style.css
```

Il build risolve i percorsi dalla posizione dello script, quindi funziona da
qualunque directory di lavoro (`node artifacts/build.mjs` dalla radice va bene).
Termina con codice diverso da zero se `corsi.json` non supera la validazione.

## Stato della bonifica

Rispetto al piano di [perizia.md](perizia.md#6-piano-di-azione), in `artifacts/`
sono applicate le correzioni di codice della Fase 1:

- `BLD-01` guardia di ingresso corretta — il build produce output su Windows
- `BLD-02` totale ore corretto: **320**
- `BLD-03` percorsi risolti da `import.meta.url`, non dalla CWD
- `BLD-04` lockfile presente, `left-pad` rimossa, `engines.node` dichiarato
- `BLD-05` test con `node:test` e script `test`
- `SEC-04` escaping HTML su tutti i valori interpolati
- `DAT-02` validazione di `corsi.json` con uscita in errore
- `FE-01` / `FE-02` contrasto WCAG AA e semantica della tabella

**Non ancora eseguite:** tutte le azioni di Fase 0 (rotazione dei segreti,
policy del bucket, versionamento, inventario AWS) e le Fasi 2-4. La rotazione
dei segreti di `SEC-01` resta dovuta: i valori sono nella storia Git al commit
`84ecad8` e vanno considerati compromessi a prescindere dalle correzioni sui
file correnti.
