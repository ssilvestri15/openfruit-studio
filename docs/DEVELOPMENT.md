# OpenFruit Studio

IDE Electron per progetti iOS su Windows.

Runtime Electron 45.1.0. Vedi il [seguito della review](docs/FOLLOW_UP_2026-10-30.md)
per aggiornamento runtime, root Git, persistenza atomica e gestione delle richieste.
Il [terzo gruppo](docs/WORKSPACE_AND_TERMINALS_2026-10-30.md) descrive accesso ai file,
conflitti di salvataggio e terminali PowerShell persistenti non interattivi.
Il [quarto gruppo](docs/CONFLICTS_AND_GIT_CANCELLATION_2026-10-30.md) aggiunge il
confronto manuale dei conflitti, copie di recupero e cancellazione Git.

Il [quinto gruppo](docs/PTY_MERGE_AND_PROJECT_SETTINGS_2026-10-30.md) introduce
terminale interattivo ConPTY, merge a tre vie e configurazione del progetto.
Clicca il nome dell'app nella barra superiore o nell'albero per modificare Bundle ID,
firma, manifesti delle dipendenze e parametri di build. I campi vuoti mantengono i
valori originali; il Team ID e' un riferimento, il team di firma deriva dal profilo.

Per i progetti Xcode, il [nuovo editor PBX](docs/XCODE_PROJECT_EDITOR_2026-10-30.md)
legge progetto, target e configurazioni e salva le impostazioni nel `.pbxproj`
originale. Il package `.xcodeproj` appare come una singola voce nel navigatore.
Dipendenze e build phases sono mostrate in forma strutturata, attualmente in sola
lettura. Il Team ID di riferimento sopra riguarda soltanto la configurazione
precedente dei progetti senza `.xcodeproj`.

## Collegamento al motore

Il CLI viene cercato in `OPENFRUIT_BIN`, poi in
`OPENFRUIT_HOME/bin/openfruit.exe`, infine in
`%LOCALAPPDATA%/OPENFRUIT/bin/openfruit.exe`.

- Discovery: `capabilities`, snapshot schema 2. Gli stati `implemented`,
  `unavailable` e `unsupported` descrivono l'inventario dei prerequisiti;
  l'esecuzione del singolo progetto deve ancora essere validata dal motore.
- Dispositivi: `devices --json`. La selezione è conservata per UDID durante
  le scansioni. La versione iOS sconosciuta non viene inventata.
- Build: `build <projectPath> --configuration debug --diagnostics=json`.
  Con dispositivo selezionato e deploy disponibile, aggiunge
  `--deploy --udid <udid>`: l'installazione è nativa (usbmux/lockdown,
  installation_proxy), la stessa di `openfruit device install`. I file
  modificati vengono salvati prima della build.
- Avanzamento: gli eventi `build.progress` (fasi completate) e
  `deploy.progress` (percentuale di installazione) aggiornano il pulsante Build.
  L'evento `task.completed` della build riporta IPA e Bundle ID finale, mostrati
  in Output al termine.
- Telemetria: JSON Lines su stdout, envelope schema 1. Il parser conserva
  eventi sconosciuti e metadati; schemi futuri e testo libero restano visibili.
  I dettagli JSON sono espandibili nella scheda Output. Gli eventi `diagnostic`
  con file e posizione alimentano Problemi, separati dalla diagnostica LSP.
- L'esito segue il codice di uscita del processo. Installazione completata
  non implica lancio dell'app. Debug IDE non è implementato nel contratto attuale.
- Ogni finestra riceve solo l'output del proprio comando. Interrompi termina
  il processo e, su Windows, i figli tramite `taskkill /T /F`.
  È un arresto forzato, non una cancellazione cooperativa del protocollo.

Il collegamento usa il CLI esistente: `ide_operation_adapter` risulta ancora
`unsupported` nel motore e non viene trattato come un servizio RPC disponibile.
L'IDE non contiene dati o progetti dimostrativi: SDK, dispositivi, progetti
recenti e risultati vengono solo dal motore e dal disco. Il canvas non mostra
ancora una preview: richiede lo streaming dello schermo del dispositivo, non
ancora disponibile nel motore.

## Sviluppo e verifica

```powershell
npm run build
npm start
npm run typecheck
npm test
npm run test:desktop
```

`test:desktop` richiede la build e OpenFruit installato. Usa una sessione IDE
temporanea e verifica il percorso renderer/preload/IPC/CLI fino al ritorno degli
eventi. I test del protocollo verificano anche diagnostica reale del compiler
proxy quando Clang è installato, senza compilare o distribuire un'app iOS.


## Verifica locale senza build del prodotto

`npm run lint` esegue il controllo TypeScript senza emettere file. `npm run test:local` verifica i servizi e i contratti senza avviare build iOS o scaricare SDK. `npm run test:media-ui` verifica commit, immagini e SVG in una finestra Electron offscreen isolata con Vite dev server.

Lo stato dettagliato dei miglioramenti e dei punti ancora aperti è in [IMPLEMENTATION_PROGRESS_2026-10-30.md](docs/IMPLEMENTATION_PROGRESS_2026-10-30.md).
