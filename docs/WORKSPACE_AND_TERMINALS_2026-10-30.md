**Workspace, salvataggi e terminali — 30 ottobre 2026**

Terzo gruppo di miglioramenti successivo alla review generale.

Aggiornamento: il [quarto gruppo](CONFLICTS_AND_GIT_CANCELLATION_2026-10-30.md)
aggiunge confronto manuale dei conflitti, copie di recupero, ricaricamento e
cancellazione di push/fetch/clone. Le limitazioni successive descrivono lo stato
al termine del terzo gruppo.

**Accesso ai file**

Le API filesystem del bridge usano un contesto per finestra. Un progetto può
essere aperto da cartelle selezionate nel dialogo nativo, progetti già registrati
dal backend oppure dalla directory Documenti/OpenFruit Projects. Modificare
sessioni o recenti dal renderer non consente di registrare percorsi arbitrari.
Creazione e clonazione richiedono una destinazione autorizzata; per una nuova
posizione personalizzata bisogna usare Sfoglia.

Dopo l'apertura, letture e modifiche sono limitate al progetto e al suo
repository Git. I controlli verificano anche il percorso reale degli antenati:
una junction verso l'esterno non autorizza file esistenti o nuovi. Eliminazione
e rinomina non possono colpire le root o le directory che le contengono.
La chiusura del progetto revoca il contesto attivo; le altre finestre conservano
un contesto indipendente.

Il discard Git dei file non tracciati verifica il tipo di file e non rimuove
repository annidati. Discard tutti elimina i singoli file non tracciati senza
usare `git clean -fd`, che poteva eliminare la cartella di un progetto attivo
interamente non tracciato. Le directory vuote vengono conservate.

Questa è una policy delle API filesystem dell'IDE, non una sandbox del sistema
operativo: comandi terminale, Git e OpenFruit sono esecuzioni locali autorizzate
dall'utente e mantengono i permessi del suo account. I controlli sui percorsi non
offrono una garanzia contro sostituzioni concorrenti dei link effettuate da un
altro processo tra controllo e accesso.

**Modifiche esterne**

L'apertura di un file acquisisce contenuto e revisione SHA-256. Salva, Salva tutti
e il salvataggio prima della build inviano la revisione attesa. Il backend
serializza i salvataggi sullo stesso file reale e ricontrolla contenuto e accesso
prima di scrivere. Una modifica esterna viene rilevata anche se dimensione e
mtime non cambiano; file rimossi o non leggibili non vengono ricreati alla cieca.

In caso di conflitto, il contenuto sul disco resta invariato e le modifiche
nell'editor restano non salvate. Il pannello Output mostra l'errore. Non è ancora
presente un editor di merge: occorre conservare le modifiche, quindi riaprire il
file e riconciliarle. Il controllo è ottimistico, non un lock contro altri processi.
Le scritture dei sorgenti non sono ancora transazionali in caso di errore disco.

Le schede pulite ripristinate da una vecchia sessione vengono aggiornate dal
disco e ricevono una revisione. Le schede già modificate senza una revisione
restano preservate: il salvataggio non verificato è rifiutato finché non si
conservano le modifiche e si riapre il file. Il ripristino Git aggiorna anche la
revisione delle schede ricaricate. L'uscita attende i salvataggi già in corso.

**Terminali**

Ogni scheda avvia al primo comando una sessione PowerShell dedicata. Directory,
variabili e stato persistono tra i comandi. Schede e finestre restano indipendenti;
sono consentiti fino a dieci terminali per finestra. Output e cronologia hanno
limiti di memoria e l'UTF-8 viene conservato.

Interrompi comando termina la sessione e i processi figli; il comando successivo
apre una sessione nuova, con perdita dello stato di quella interrotta. Chiudere
una scheda, cambiare progetto o chiudere la finestra termina le relative sessioni.
Gli errori PowerShell e i codici di uscita nativi vengono propagati all'interfaccia.

Si tratta di sessioni persistenti **non interattive**, non di un PTY/ConPTY:
prompt interattivi, applicazioni a schermo intero e input durante un comando
non sono supportati. La cronologia non viene ripristinata dopo il riavvio dell'app.

**Verifica**

`npm run typecheck`, `npm test` (19 test), `npm run build` e
`npm run test:desktop`. Test reali su PowerShell verificano variabili, directory,
Unicode, errori nativi, isolamento e cancellazione. I test filesystem verificano
confini, junction, antenati protetti, modifiche esterne e salvataggi concorrenti.
Il test Electron verifica il percorso completo, il rifiuto di accessi esterni,
il conflitto visibile nell'editor con conservazione delle modifiche, i terminali
tramite IPC e il mantenimento della directory di un progetto non tracciato.
Tutti i dati di prova si trovano in directory temporanee.

Restano il merge dei conflitti, un vero terminale PTY, cancellazione dedicata
di push/fetch/clone, ulteriore tipizzazione del bridge e scomposizione di App.tsx.
SDK manager, canvas e debug IDE restano incompleti. Non sono state verificate
build iOS firmate, distribuzioni su dispositivi o installer Windows.
