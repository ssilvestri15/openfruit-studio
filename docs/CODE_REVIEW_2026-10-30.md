**Review del codice — 30 ottobre 2026**

Aggiornamento successivo: runtime, root Git, persistenza JSON e generazioni delle
richieste sono stati affrontati nel [secondo gruppo di miglioramenti](FOLLOW_UP_2026-10-30.md).
Le segnalazioni seguenti descrivono lo stato al termine della prima review.

Revisione dei sorgenti Electron, del collegamento OpenFruit, dell'editor e dei
componenti React, degli script di avvio/build e dei test. Le correzioni sono
nel workspace. Il repository non ha un baseline tracciato per questi sorgenti:
erano già tutti untracked, quindi un normale `git diff` non rappresenta il lavoro.

**Problemi corretti**

| Priorità | Problema osservato | Correzione |
| --- | --- | --- |
| P1 | Git usava `shell: true` anche con messaggi di commit, URL e nomi file dell'utente. Le virgolette e i metacaratteri passavano alla shell. | Esecuzione diretta di Git, argomenti separati, gestione dell'errore di avvio. Test con messaggio contenente virgolette e `&`. |
| P1 | Salva e Salva tutti ignoravano l'esito del backend e rimuovevano sempre lo stato modificato, anche dopo errori o nuove modifiche durante il salvataggio. | Controllo dell'esito, errori visibili, confronto tra snapshot salvato e contenuto/percorso correnti. I diff sono esclusi dai salvataggi. |
| P1 | Nuovi file e scaffold potevano sovrascrivere contenuti esistenti. Nomi del progetto venivano inseriti in percorsi e sorgenti senza validazione. | Creazione esclusiva dei file, rifiuto di scaffold in cartelle non vuote, validazione del nome Swift e del bundle ID. |
| P1 | Il discard di un file non tracciato accettava percorsi esterni al progetto. Un fallback poteva eliminare un file dopo un errore Git. | Controllo dei confini del percorso e del genitore reale, rimozione del fallback distruttivo, propagazione dei codici di errore. |
| P1 | LSP contava caratteri anziché byte nei messaggi UTF-8; un solo processo veniva inizializzato senza progetto e condivideva diagnostica tra finestre. | Parser binario Content-Length, processo per finestra e root, attesa di initialize, gestione errori e timeout, chiusura dei documenti e delle richieste pendenti. |
| P2 | Scansione ricorsiva sincrona, contenuti di tutti i file sotto 2 MB inviati al renderer, possibili cicli con junction. | Scansione asincrona dei soli metadati, Dirent per evitare stat ridondanti, esclusione junction/symlink e directory di build, limiti di profondità e numero di elementi. |
| P2 | Apertura di file vuoti inseriva codice Swift di esempio. Alcuni chiamanti attendevano un oggetto mentre read-file restituiva una stringa. | Lettura su richiesta con contratto coerente; contenuti vuoti preservati; file binari o troppo grandi rifiutati. |
| P2 | L'editor dipendeva dal loader remoto di Monaco. Listener e modelli non venivano sempre rilasciati; diagnostica associata per suffisso del nome. | Monaco e worker locali, editor caricato con import dinamico, rilascio delle risorse, associazione per URI esatto e codifica corretta di spazi/Unicode. |
| P2 | Ricerca whole-word riceveva la stringa `true` come separatori; Avanti/Indietro e Sostituisci tutti delegavano ad azioni Monaco prive dello stato della barra personalizzata. | Ricerca, navigazione e modifiche eseguite sugli stessi range, gestione regex incomplete e gruppi di sostituzione, operazioni annullabili con undo. |
| P2 | Creazione di file/cartelle applicava aggiornamenti ottimistici dopo aver già riletto l'albero, duplicando i nodi; rinomina cartelle non aggiornava i tab figli. | Aggiornamenti dopo esito verificato, niente duplicati, percorsi dei discendenti aggiornati e confronti con separatori di directory. |
| P2 | Stato Git mostrato come riuscito anche dopo errori; commit senza staging aggiungeva automaticamente tutto il repository. | Stato reale dopo le operazioni e commit limitato all'indice scelto dall'utente; nessuno staging automatico. |
| P2 | Parsing Git basato su righe e trim, ambiguo per rinomine, Unicode e spazi; pannello diff non distingueva sempre staged/unstaged. | Porcelain `-z`, record di rinomina e percorsi preservati, selezione del diff con nome e stato di staging. |
| P2 | Ogni evento OpenFruit copiava gli array React e attraversava IPC singolarmente. Output terminale e Git senza limiti di memoria. | Batch IPC/React, buffer limitati, anteprime untracked limitate, letture Git indipendenti in parallelo, modifiche LSP raggruppate con debounce. |
| P2 | Finestre diverse scrivevano la stessa sessione e la copia locale più recente poteva essere ignorata. | Sessioni separate per finestra, timestamp e preferenza per la copia più recente; serializzazione spostata nel debounce. |
| P2 | Renderer senza sandbox, nessun controllo dell'origine IPC e navigazioni non limitate. | Sandbox, controlli di frame/origine sui comandi IPC, blocco di navigazioni e nuove finestre web, CSP in produzione. |
| P2 | Il template ignorava la versione iOS minima scelta e offriva varianti non generate realmente. | Versione propagata a Package.swift e Info.plist; opzioni scaffold non supportate disabilitate; SDK gestito dalla configurazione del motore. |
| P3 | SDK manager e canvas mostravano operazioni simulate come reali; avvio desktop basato su un timeout e su backend potenzialmente vecchio. | Funzioni dimostrative etichettate, azioni SDK disabilitate, script dev che ricompila Electron e attende Vite. |

Punti di ingresso: `electron/git.ts`, `electron/workspace.ts`, `electron/lsp.ts`,
`electron/main.ts`, `src/utils/editorState.ts`, `src/components/CenterPanel.tsx`
e `src/App.tsx`. Aggiunto `.gitignore` per dipendenze e output generati.

**Risultati di verifica**

- `npm run typecheck` e `npm test`: controllo TypeScript e 11 test del protocollo,
  filesystem, Git, framing LSP, snapshot dell'editor e sostituzioni regex.
- `npm run build`: bundle frontend e main/preload Electron. Monaco è un chunk
  separato caricato entrando nell'IDE; il bundle iniziale è circa 308 kB,
  quello dell'editor circa 2,34 MB. Resta l'avviso Vite sulla dimensione del chunk
  Monaco: non è un benchmark dei tempi di avvio o della memoria.
- `npm run test:desktop`: CLI installato attraverso il bridge completo,
  protezione dalla sovrascrittura, rifiuto di path escape Git, apertura reale
  dei file e Monaco locale, navigazione delle corrispondenze, sostituzione e
  salvataggio Ctrl+S, separazione delle sessioni e della telemetria tra finestre.
  Il test usa una directory temporanea, non i progetti dell'utente.
- `npm audit --omit=dev`: nessuna segnalazione. L'audit completo segnala invece
  due pacchetti con severità high: `electron` e `extract-zip`.

**Questioni ancora aperte**

1. **P1 — Runtime Electron da aggiornare.** La versione installata è 35.7.5.
   L'audit propone una migrazione major a Electron 45.1.0. Non è stata applicata
   automaticamente: richiede verifica delle API, del packaging e dei flussi su
   Windows. Electron è una devDependency in npm ma è anche il runtime distribuito:
   l'audit con `--omit=dev` da solo non certifica la sicurezza dell'app desktop.
   Evidenza salvata in `npm-audit-2026-10-30.json`.
2. **P2 — Identità della root Git.** Quando si apre una sottocartella di un
   repository, percorsi porcelain, diff e azioni devono essere normalizzati
   rispetto alla root effettiva del repository. Il percorso principale testato
   in questa review è l'apertura della root del repository.
3. **P2 — API filesystem ancora generali.** I controlli dell'origine IPC riducono
   la superficie d'attacco, ma i comandi generici di lettura/scrittura/eliminazione
   non hanno ancora una policy di autorizzazione dei percorsi per workspace.
   Il controllo di confinamento introdotto qui riguarda il discard Git.
4. **P2 — Persistenza e concorrenza.** I JSON di sessione e recenti usano ancora
   scritture sincrone non transazionali. Servono scritture atomiche e gestione
   esplicita dei conflitti con modifiche esterne ai file. Le richieste asincrone
   di refresh del progetto/Git richiedono inoltre una generazione per ignorare
   risultati arrivati dopo un cambio di workspace.
5. **P2 — Terminale.** L'output è limitato e il processo termina alla distruzione
   della finestra, ma non è un vero PTY: `cd` e variabili non persistono tra
   comandi. Push/fetch/clone e terminale richiedono cancellazione dedicata per tab.
6. **P3 — Struttura e tipizzazione.** `App.tsx` concentra ancora editor, sessioni,
   file manager, Git e build; molti attraversamenti del bridge usano `any`.
   Conviene estrarre controller/hook e definire contratti IPC condivisi prima
   di aggiungere nuove funzioni. Rimangono componenti legacy duplicati e diverse
   etichette/accessibilità dei controlli da uniformare.

La review non prova una build iOS firmata, una distribuzione su dispositivo,
la discovery Wi-Fi, tutte le funzionalità semantiche di SourceKit o il packaging
NSIS/portable. SDK manager, canvas e debug IDE rimangono funzionalità incomplete.
