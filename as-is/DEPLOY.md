# Come si pubblica il portale

> Procedura scritta da Marco nel 2023. Se Marco non c'e, chiedere a Marco.

1. Aprire il progetto sul portatile in ufficio (quello grigio vicino alla finestra).
2. Modificare `data/corsi.json` con i corsi nuovi.
3. Lanciare `npm run build`. Se da errore, riprovare.
4. Aprire FileZilla. Le credenziali sono in `config/impostazioni.txt`.
5. Trascinare il contenuto di `dist/` dentro la cartella remota. Sovrascrivere tutto.
6. Aprire la console AWS con l'utente della segreteria.
7. Se il bucket da errore, controllare i permessi (di solito basta rimettere "public").
8. Aprire il sito e controllare a occhio che si veda.
9. Se qualcosa e sbagliato, rifare il punto 5 con la versione vecchia (se qualcuno ce l'ha).

## Note

- Il deploy si fa il venerdi pomeriggio, quando non c'e nessuno.
- Non esiste una copia del sito precedente. Una volta si e persa la pagina dei corsi per due giorni.
- La tabella delle iscrizioni non l'ha mai guardata nessuno, ma c'e.
