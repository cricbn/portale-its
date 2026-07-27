# Pubblicazione del portale ITS

Questa procedura sostituisce integralmente quella del 2023 (`as-is/DEPLOY.md`),
che era manuale, legata a una persona e a un portatile, e che istruiva a
disattivare un controllo di sicurezza a ogni rilascio.

**Non si pubblica piu via FTP.** Il canale FTP e dismesso: non esiste piu un
host, un utente o una password da usare a mano. L'unico modo di mandare
qualcosa in produzione e la pipeline
[.github/workflows/release.yml](../.github/workflows/release.yml).

**Nessuno pubblica dal proprio computer.** Nessun trascinamento di file,
nessuna console AWS aperta a mano, nessuna modifica diretta al bucket.

---

## 1. In breve

| | |
|---|---|
| **Come si pubblica** | merge su `main` |
| **Cosa viene pubblicato** | l'artefatto costruito dalla pipeline, mai una build locale |
| **Chi approva** | un revisore dell'Environment `production`, diverso da chi ha avviato |
| **Come si verifica** | automatica: `versione.json` pubblicato = artefatto costruito |
| **Come si torna indietro** | workflow *Release* > *Run workflow* > campo `rollback_a` |
| **Quando si pubblica** | in orario presidiato. **Mai il venerdi pomeriggio** |

---

## 2. Il flusso, stadio per stadio

```
  merge su main
       |
   [1] Build ............ npm ci -> npm test -> npm run build -> artefatto
       |
   [2] Collaudo ......... finto-AWS (moto): applica l'IaC e verifica
       |                  che le risorse esistano e siano sicure
       |
   [3] APPROVAZIONE ..... la pipeline si ferma e attende una persona
       |
   [4] Produzione ....... pubblica l'artefatto gia costruito + smoke test
       |
   [5] Rollback ......... a richiesta, ripubblica una versione precedente
```

### [1] Build

`npm ci` (da lockfile), `npm test`, `npm run build`. Poi verifica che
`dist/index.html`, `dist/versione.json` e `dist/style.css` esistano e non siano
vuoti, che `versione.json` corrisponda al commit, e che il totale ore mostrato
in pagina coincida con quello scritto nell'artefatto.

L'artefatto viene conservato per 90 giorni. **E l'unico che arriva in
produzione: non viene mai ricostruito piu avanti.**

> Perche questi controlli: il build della versione precedente terminava con
> codice 0 senza produrre alcun file, e nessuno se ne accorgeva (perizia
> BLD-01). Un build che riesce senza produrre output ora fa fallire la pipeline.

### [2] Collaudo su finto-AWS

Avvia [moto](https://github.com/getmoto/moto) in locale sul runner e applica
davvero l'infrastruttura come codice:

- **`portale-its.yaml`** (CloudFormation) viene validato, distribuito, e si
  verifica che bucket e tabella esistano.
- **`main.tf`** (Terraform, *binario principale*) viene applicato in una
  cartella temporanea con l'override di collaudo, e poi
  [`collaudo/verifica.sh`](collaudo/verifica.sh) interroga le API una per una:
  versionamento, cifratura, public access block su tutti e quattro i controlli,
  assenza di policy pubbliche, cifratura e PITR della tabella, tag di
  governance.

Infine l'artefatto viene pubblicato sul finto bucket e riletto, per verificare
che quello che si legge sia esattamente quello che si e costruito.

**Se l'IaC e sbagliato, questo stadio fallisce e la produzione non parte.**

### [3] Approvazione umana

La pipeline si ferma prima della produzione. L'attesa e imposta dall'Environment
GitHub `production` (vedi [§5](#5-configurazione-una-tantum)), configurato con
*required reviewers* e *prevent self-review*: **chi ha avviato il rilascio non
puo approvarlo da solo.**

Chi approva viene registrato nel riepilogo del run e nel file
`pubblicazione.json` pubblicato accanto al sito.

### [4] Produzione

Scarica l'artefatto dello stadio 1 e lo pubblica su S3 tramite un ruolo IAM
assunto via OIDC — **nessuna chiave AWS statica esiste nel repository o nei
secret**.

La pubblicazione avviene in due tempi, e questo e cio che rende possibile il
rollback:

1. l'artefatto viene archiviato in `s3://<bucket>/releases/<commit>/`;
2. quella cartella viene promossa a versione attiva alla radice del bucket.

Ogni versione pubblicata resta quindi disponibile, e il bucket ha comunque il
versionamento attivo come seconda rete di sicurezza.

Segue lo smoke test: `versione.json` riletto da S3 deve essere identico a
quello dell'artefatto, e il sito deve rispondere `200`. Se non e cosi, il job
fallisce.

> Perche non basta "guardare a occhio" (perizia OPS-04): i due difetti piu
> gravi del progetto — pagina vecchia ripubblicata e totale ore errato — erano
> entrambi invisibili a un controllo visivo.

### [5] Rollback

Vedi [§4](#4-rollback).

---

## 3. Cosa fare quando qualcosa non va

Non esistono piu istruzioni del tipo "se da errore, riprovare" o "di solito
basta rimettere public". Erano la causa documentata degli incidenti, non la
soluzione.

| Sintomo | Cosa fare |
|---|---|
| Il job **Build** fallisce | Leggere l'errore. Se dice `BUILD FALLITA: ...`, i dati in `corsi.json` non sono validi: correggerli e ripetere il merge. |
| Il job **Collaudo** fallisce | L'IaC non e conforme. Correggere `main.tf` / `portale-its.yaml`. **Non aggirare il controllo.** |
| Un bucket "da errore sui permessi" | **Non modificare i permessi e non rendere pubblico nulla.** Quell'errore e il controllo di sicurezza che funziona. Aprire una segnalazione al referente. |
| Il sito e sbagliato dopo la pubblicazione | Eseguire il **rollback** ([§4](#4-rollback)), poi indagare con calma. |
| Il gate **segreti** fallisce | Un segreto sta per entrare nel repository. Non forzare: rimuoverlo, e **ruotare** il valore esposto. |

---

## 4. Rollback

Obiettivo: tornare a una versione buona in pochi minuti, senza ricostruire
nulla e senza perdere la cronologia.

1. Aprire **Actions > Release > Run workflow**.
2. Compilare:
   - `rollback_a`: il commit SHA della versione da ripubblicare (bastano i
     primi caratteri, es. `a1b2c3d`);
   - `motivo`: perche si torna indietro (finisce nel registro).
3. Avviare. Il job `rollback` richiede **la stessa approvazione** della
   produzione.

Cosa succede: la pipeline cerca `releases/<commit>/` sul bucket, e se la trova
la ripromuove a versione attiva. Se il commit indicato non corrisponde a una
release realmente archiviata, il job fallisce ed elenca quelle disponibili —
non si torna a versioni mai pubblicate.

L'archivio `releases/` **non viene toccato**: la cronologia resta completa e si
puo tornare avanti o indietro quante volte serve. Al termine viene rieseguito
lo smoke test, per verificare che il sito serva davvero la versione richiesta.

Per sapere cosa e attualmente pubblicato e chi lo ha approvato:

```sh
aws s3 cp s3://<bucket>/pubblicazione.json -
```

Per elencare le versioni disponibili:

```sh
aws s3 ls s3://<bucket>/releases/
```

---

## 5. Configurazione una tantum

Da fare una sola volta, in **Settings** del repository.

### Environment `production`

*Settings > Environments > New environment > `production`*

- **Required reviewers**: almeno una persona, meglio due. E cio che introduce
  la pausa di approvazione: senza, la produzione parte da sola.
- **Prevent self-review**: attivo. Impedisce che chi avvia approvi se stesso.
- **Deployment branches**: solo `main`.

Variabili dell'Environment (non sono segreti):

| Nome | Esempio |
|---|---|
| `AWS_REGION` | `eu-south-1` |
| `SITE_BUCKET` | `portale-its-sito-prod-segreteria` |
| `SITE_URL` | `https://corsi.esempio.it` |

Secret dell'Environment:

| Nome | Contenuto |
|---|---|
| `AWS_ROLE_ARN` | ARN del ruolo IAM assunto via OIDC, con permessi limitati al solo bucket del sito |

> Se `SITE_BUCKET` non e impostata, la pipeline esegue comunque tutti gli
> stadi e l'approvazione, ma salta la pubblicazione segnalandolo con un
> warning. Serve a poter provare la catena senza un account AWS.

### Protezione del branch `main`

Impedisce il push diretto e rende obbligatori i gate. Da
*Settings > Rules > Rulesets* (o *Branches > Branch protection rules*):

- richiedi una pull request prima del merge, con almeno 1 approvazione;
- richiedi che passino i controlli: `segreti`, `iac`, `applicazione`;
- blocca i force push e la cancellazione del branch;
- applica la regola anche agli amministratori.

Equivalente da riga di comando:

```sh
gh api -X PUT repos/:owner/:repo/branches/main/protection \
  --input .github/branch-protection.json
```

Il file [.github/branch-protection.json](../.github/branch-protection.json)
contiene la configurazione pronta.

---

## 6. Segreti storici

I segreti rilevati dalla perizia (password FTP e token `ghp_...`) sono nella
storia Git ai commit `84ecad8`, `47908ad` e `d55b0b9`, e **vanno considerati
compromessi**. Rimuoverli dai file correnti non li rimuove dalla storia.

Il rimedio non e tecnico ma amministrativo, e **resta dovuto**:

1. revocare il token sul provider di origine e verificarne l'uso nei log;
2. cambiare la password dell'utenza FTP e poi chiudere l'utenza, dato che il
   canale FTP e dismesso;
3. non riusare lo schema `Ruolo + Anno + !` per nessuna altra credenziale.

Da qui in avanti il gate
[.github/workflows/sicurezza.yml](../.github/workflows/sicurezza.yml) impedisce
che un nuovo segreto entri nel repository. Le uniche sedi escluse dalla
scansione sono `as-is/` e `perizia.md`, che sono materiale probatorio congelato:
la motivazione e scritta in [.gitleaks.toml](../.gitleaks.toml).

---

## 7. Referente

Il referente e indicato dal tag `Owner` sulle risorse e dal file
[CODEOWNERS](../.github/CODEOWNERS). **La procedura non dipende piu da una
persona specifica**: chiunque abbia i permessi sul repository puo pubblicare
leggendo questo documento.
