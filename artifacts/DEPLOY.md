# Come si pubblica il portale

> Procedura aggiornata: pubblicazione automatizzata, niente FTP manuale.

1. Aggiornare i dati dei corsi.
2. Eseguire `npm test`.
3. Eseguire `npm run build`.
4. Verificare che `dist/index.html` e `dist/versione.json` esistano.
5. Pubblicare solo tramite pipeline approvata.
6. Se la pubblicazione fallisce, ripristinare la versione precedente dal bucket versionato.

## Note
- Nessun segreto deve essere committato nel repository.
- Nessuna modifica manuale in produzione.
- Il rollback deve richiedere meno di 5 minuti.
