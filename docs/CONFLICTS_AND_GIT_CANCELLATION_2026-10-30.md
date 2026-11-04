Aggiornamento: terminale PTY e merge a tre vie sono implementati nel [quinto gruppo](PTY_MERGE_AND_PROJECT_SETTINGS_2026-10-30.md).

**Confronto dei conflitti e cancellazione Git — 30 ottobre 2026**

Quarto gruppo di miglioramenti successivo alla review generale.

**Recupero delle modifiche nell'editor**

Un salvataggio in conflitto mostra una barra nel documento con tre azioni:

- **Confronta versioni:** apre un confronto a due colonne, con il disco a
  sinistra e il contenuto dell'editor a destra. La colonna destra è modificabile;
  gli interventi rimangono anche nell'editor se si chiude il confronto.
- **Usa versione sul disco:** scarta il contenuto locale del documento e
  rilegge contenuto e revisione. Una modifica locale arrivata dopo l'inizio
  della lettura viene conservata, invece di essere scartata da un risultato vecchio.
- **Salva copia:** scrive il contenuto dell'editor in un file nuovo nella stessa
  cartella. Il nome è modificabile e il backend usa creazione esclusiva: una
  copia esistente non viene sovrascritta. Il nome proposto termina con
  `.editor-copy`, così non viene aggiunto per errore un secondo sorgente Swift/C
  compilabile. Il documento originale resta in conflitto e non viene segnato
  come salvato solo perché ne è stata creata una copia.

Nel confronto, **Salva la versione a destra** o Ctrl+S salva contro la revisione
del disco mostrata a sinistra. Se il file cambia di nuovo prima del salvataggio,
la nuova versione viene mostrata e il salvataggio è rifiutato. Il messaggio è
visibile anche nel dialogo. Un successivo salvataggio richiede quindi una nuova
decisione sulla versione aggiornata, senza un overwrite forzato nascosto.

Il confronto è manuale a due colonne, non un merge automatico a tre vie. Se il
file è stato eliminato o non è leggibile, il salvataggio sul percorso originale
resta disabilitato nel confronto; si può conservare il contenuto tramite una copia.
Anche le vecchie schede modificate senza revisione possono usare il confronto
per acquisire una versione del disco da verificare esplicitamente.

La logica è stata estratta da App.tsx nel controller `useFileConflicts` e in
componenti dedicati. I tipi di snapshot, conflitto e bridge filesystem sono
condivisi. Le richieste sono correlate alla generazione del workspace e al tab.
Il dialogo gestisce focus e scorciatoie, bloccando quelle del workspace sottostante.

**Cancellazione delle operazioni Git**

Push e fetch mostrano **Interrompi Git** durante l'esecuzione. Il pulsante di
annullamento del clone diventa **Interrompi clonazione**. Ogni finestra può
eseguire una sola operazione di rete Git alla volta; la cancellazione indirizza
solo l'operazione della finestra chiamante e non quelle delle altre finestre.

Il segnale raggiunge sia la risoluzione della root Git sia il comando effettivo.
Su Windows termina il processo e i figli con il meccanismo già usato dal backend.
Chiudere una finestra o completare un cambio di workspace cancella le operazioni
della relativa finestra; l'uscita attende la loro terminazione.

La cancellazione non annulla modifiche già completate sul server o sul filesystem.
Un clone interrotto può lasciare una cartella parziale, che non viene eliminata
automaticamente. Gli esiti distinguono interruzione, errore e completamento.
Tipi e gestione delle operazioni sono in `shared/git.ts` e `electron/gitOperations.ts`.

**Correzione del ciclo di vita Monaco**

I test hanno esposto due errori alla chiusura rapida dei confronti: modelli di
testo eliminati prima del distacco dall'editor e richieste di diff ancora attive
durante la rimozione dei modelli. `SafeDiffEditor` gestisce il distacco e lascia
terminare la cancellazione del view-model Monaco prima di liberare i modelli.
Il componente è usato sia per i conflitti sia per i normali confronti Git.

**Verifica**

- `npm run typecheck`, `npm test` (23 test) e `npm run build`.
- `npm run test:desktop`: copia di recupero e rifiuto di sovrascriverla, secondo
  conflitto esterno, modifica reale della colonna destra e salvataggio, ricaricamento
  esplicito del file, apertura/chiusura dei diff senza errori renderer.
- Cancellazione tramite pulsante di un push reale verso un repository bare
  temporaneo locale, con hook in attesa; una seconda finestra non può cancellarlo.
- Test unitari del routing per proprietario/operazione, rifiuto di richieste
  concorrenti e terminazione di un processo Git con helper in attesa.

I test usano fixture temporanee, senza pubblicare su repository remoti dell'utente.
Rimane l'avviso sulla dimensione del chunk Monaco, caricato su richiesta.

Restano terminale PTY interattivo, salvataggi sorgente transazionali in caso di
errore disco, merge automatico a tre vie, ulteriore scomposizione di App.tsx e
tipizzazione completa del bridge. SDK manager, canvas e debug IDE restano incompleti;
non sono stati verificati installer Windows, build iOS firmate o deploy su dispositivi.
