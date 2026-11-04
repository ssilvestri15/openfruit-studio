# Avanzamento implementazione IDE — 30 ottobre 2026

Il backlog originale comprende 58 punti e **non è ancora interamente completato**. La tabella distingue le funzionalità locali dai residui: non equivale a una certificazione di compatibilità con Xcode.

## Vincoli e chiarimento dell’utente

L’utente ha chiarito che il divieto riguarda le **build delle app iOS**, non la build dell’IDE desktop. Il frontend Vite e main/preload Electron sono stati ricostruiti; il pacchetto aggiornato è in `release/win-unpacked/OpenFruit Studio.exe` ed è stato aperto. Nessuna build iOS o download SDK è stato avviato.

Verifiche aggiuntive passate: UI Xcode sulla versione compilata; anteprima del PNG reale da 1,6 MB (1024×1024), SVG con editor/preview e refresh, commit/diff storico sulla versione compilata; corrispondenza ASAR con gli artefatti e terminale ConPTY del pacchetto.

## Commit e immagini

- Un clic sul commit apre l’elenco dei file modificati. Il clic su un file apre il confronto tra il parent selezionato e il commit, leggendo i blob Git e non il worktree. Sono gestiti commit iniziali, aggiunte, eliminazioni, rinomine e merge con più parent.
- Le immagini PNG/JPEG/GIF/WebP/BMP/ICO/AVIF sono mostrate in anteprima con zoom, adattamento, dimensioni e sfondo trasparenza. I formati non decodificabili restano in una vista binaria esplicita.
- Gli SVG hanno editor XML e anteprima affiancata, con modalità sorgente/anteprima e aggiornamento dopo le modifiche. L’SVG viene caricato come immagine, senza iniettarlo nel DOM dell’IDE.
- Anche il confronto storico supporta immagini e SVG. I buffer delle immagini non vengono trattati come sorgenti da salvare e non vengono duplicati nella sessione.

## Verifica

- TypeScript senza emissione e controlli noUnused: passati.
- Suite locale: 56 test passati.
- PTY nativo: 1 test passato.
- Smoke UI: 7 controlli passati, nessun errore browser (PNG, SVG, aggiornamento del sorgente, script SVG inerte, espansione commit, diff testo e diff immagini).
- Pacchetto desktop ricostruito e verificato. Nessun collaudo della toolchain iOS o di una build iOS firmata.

## Stato dei 58 punti

| Punto | Stato | Implementato / residuo |
| --- | --- | --- |
| X01 | Parziale | Navigatore PBX con gruppi, variant/version groups, sourceTree e directory sincronizzate; restano eccezioni dei gruppi sincronizzati e riferimenti esterni complessi. |
| X02 | Parziale | Rinomina/cestino coordinati con PBX e rollback; aggiunta di riferimenti, rimozione e membership nella configurazione. Creazione sul disco e associazione al target sono ancora due azioni esplicite. |
| X03 | Parziale | Lettura workspace XML e progetti inclusi entro i permessi; restano grafo delle dipendenze e autorizzazioni multi-root complete. |
| X04 | Implementato e verificato localmente | Selezione scheme o target qualificato, configurazioni personalizzate e SDK già registrato; argomenti collegati al CLI. Nessuna compilazione eseguita. |
| X05 | Parziale | Risoluzione xcconfig con include opzionali, inherited, livelli, condizioni e variabili supportate. Contesto iPhoneOS/arm64 dichiarato; default SDK e semantica Xcode completa non certificati. |
| X06 | Parziale | CRUD target/prodotti e duplicazione/eliminazione configurazioni con protezione degli oggetti condivisi. Restano build rules, migrazioni e aggiornamento degli scheme. |
| X07 | Parziale | Requisiti pacchetti strutturati, aggiunta/rimozione e prodotto collegato al target/frameworks; restano risoluzione, lockfile e gestione completa dei prodotti esistenti. |
| X08 | Parziale | Dipendenze tra target locali modificabili, controllo duplicati e cicli. Restano proxy e dipendenze incrociate tra progetti. |
| X09 | Parziale | Membership sorgenti/risorse/framework, fasi e script modificabili; API di riordino disponibile. Restano UI del riordino, copie, shell/input/output e opzioni avanzate. |
| X10 | Parziale | Campi signing, Info.plist ed entitlements e editor plist. Restano capabilities assistite e validazione delle identità/profili. |
| X11 | Parziale | Editor plist XML tipizzato e visualizzatore immagini/SVG; restano editor di cataloghi asset/localizzazioni/documenti UI e codec HEIC/TIFF. |
| X12 | Da implementare | Il project editor rimane un dialogo; integrazione come tab del workbench non ancora realizzata. |
| X13 | Parziale | Template Xcode SwiftUI con UUID e scheme condiviso, alternativa Swift Package e creazione target framework/extension. Restano template test/UIKit/Objective-C. |
| X14 | Parziale | Identità e versioni lette da PBX/xcconfig/Package.swift; recenti identificati per percorso. Restano metadati completi per scheme e aggiornamento del branch nei recenti. |
| X15 | Parziale | Entrypoint .xcodeproj/.xcworkspace e argomenti di lancio, istanza secondaria e permessi per file selezionati. Restano autorizzazioni esterne basate sull’intero grafo workspace. |
| E01 | Richiede contratto backend | Il contratto inspect non espone un piano compiler/BSP completo; nessun contesto iOS simulato. |
| E02 | Parziale | Definition/references, rename dei modelli aperti, signature help, formatting, simboli e folding. Restano code actions, semantic tokens e rename di file chiusi con anteprima completa. |
| E03 | Parziale | Syntax highlighting per C/C++/Objective-C, JS/TS, XML/SVG, Markdown, shell, Python/YAML e servizio JSON; restano server semantici oltre Swift. |
| E04 | Implementato e verificato localmente | Ricerca globale in worker con esclusioni, regex/Unicode, cancellazione, navigazione, virtualizzazione e sostituzioni letterali protette da revisioni. |
| E05 | Parziale | Navigazione a definition/references e simboli Monaco; restano breadcrumb semantici e cronologia avanti/indietro. |
| E06 | Parziale | Click dei problemi porta a riga/colonna; restano range completo, informazioni correlate e fix. |
| E07 | Parziale | Due gruppi di editor, riordino con drag/drop e tab fissati. Restano preview tab, MRU e collaudo integrato completo dei gruppi. |
| E08 | Parziale | Watcher ricorsivo, rilettura dei tab puliti e conflitti per quelli modificati; HEAD/index/refs osservati dentro la radice. Resta il watcher .git esterno nei progetti annidati. |
| E09 | Implementato e verificato localmente | Autosave persistente dopo una pausa; salvataggi atomici, revisioni e protezione dei conflitti. Documenti nuovi e immagini esclusi dall’autosave. |
| E10 | Implementato e verificato localmente | Documenti untitled e Salva con nome testuale con picker nativo, permessi esatti e protezione dei buffer aperti e delle revisioni. |
| B01 | Parziale | Build separata da Build e installa, installazione IPA indipendente nelle impostazioni device. Run resta dipendente dal contratto del motore. |
| B02 | Richiede contratto backend | Rimosso il falso transcript LLDB. Sessione DAP/adapter, breakpoint, stepping e variabili richiedono un contratto disponibile e verificabile. |
| B03 | Richiede contratto backend | Il CLI documenta build-for testing come sola compilazione, non runner XCTest/XCUITest o coverage. |
| B04 | Parziale | Report con task/durate realmente ricevuti e output filtrabile. Restano timeline live, relazioni e artefatti cliccabili. |
| B05 | Parziale | Report JSON locali per operazioni CLI, cronologia per workspace ed esportazione; limiti e retention espliciti. Resta replay del journal nativo e copertura uniforme di tutti i comandi. |
| B06 | Parziale | Installazione IPA nativa indipendente; restano workflow completi package/archive/sign/export e verifica delle firme supportata dal motore. |
| B07 | Parziale | Profili PowerShell/cmd, riavvio, rinomina, ricerca/pulizia buffer, font/scrollback persistenti. Restano profilo predefinito e layout terminali persistenti. |
| B08 | Richiede contratto backend | Rimossa la preview Orto simulata. Nessun renderer/simulatore SwiftUI disponibile nel contratto attuale. |
| I01 | Implementato e verificato localmente | Inventario SDK reale e selezione dal motore; catalogo consultabile tramite azione esplicita. |
| I02 | Parziale | Select/remove/download collegati a comandi nativi con stream/cancellazione. Download e relative verifiche non eseguiti per istruzione utente; restano dettagli spazio/receipt. |
| I03 | Parziale | CLI, identità Git, inventario, doctor/cache status e refresh capabilities; alcuni percorsi sono dichiarati predefiniti. Bootstrap/update-dependency non avviati né automatizzati. |
| I04 | Parziale | Accesso Apple del motore e percorsi di firma reali; restano inventario/import/selezione certificati e profili con scadenze. |
| I05 | Implementato e verificato localmente | Stato device condiviso nelle viste, errori visibili e host Wi-Fi diretto; rimossi device/UDID fittizi. |
| I06 | Implementato e verificato localmente | Controlli nativi per info/log/screenshot/registrazione fotogrammi/installazione IPA, con selezione output e cancellazione. Nessuna operazione eseguita sul dispositivo dell’utente. |
| I07 | Implementato e verificato localmente | Preferenze persistenti font/indentazione/wrap/minimap/autosave/tema/terminale/scorciatoie con validazione e gestione modifiche da altre finestre. |
| G01 | Parziale | Creazione/cambio branch, remoti, upstream visualizzato e ahead/behind. Restano configurazione tracking e operazioni avanzate sui branch. |
| G02 | Parziale | Pull fast-forward, merge/rebase, stash e lista conflitti dell’indice con editing/stage manuale. Restano editor dedicato alle tre versioni Git e controlli completi dello stato sequencer. |
| G03 | Parziale | HEAD–indice e indice–disco corretti, stage/unstage/discard per hunk con controllo revisione. Restano selezione delle singole righe e operazioni granulari su rinomine/binari. |
| G04 | Implementato e verificato localmente | Commit espandibili con file modificati; confronto storico testo/immagini/SVG, rinomine, root commit, aggiunte/rimozioni e parent dei merge; cronologia paginata. Blame resta da aggiungere. |
| G05 | Parziale | Versione e identità Git globale reali e modificabili; credenziali affidate al credential helper. Restano scelta del binario e identità locale assistita. |
| G06 | Implementato e verificato localmente | Gli errori della lettura Git sono propagati e non svuotano la vista come repository assente. |
| R01 | Implementato e verificato localmente | Scritture atomiche di default per i sorgenti, fsync, queue e verifica revisione. |
| R02 | Parziale | Sessione versionata, backup recuperabile, limiti/errori visibili e media ricaricati dal disco. Restano bozze dei dialoghi e ripristino completo delle finestre. |
| R03 | Parziale | Lock single-instance e inoltro entrypoint; resta ripristino persistente dell’insieme delle finestre. |
| R04 | Parziale | Shortcut per contesto, registry modificabile, navigatore accessibile e focus trap nei dialoghi principali. Restano rifiniture uniformi dei menu e dei dialoghi legacy. |
| R05 | Parziale | URI/root LSP e nuove API tipizzate/validate; restano alcuni contratti IPC legacy any e uno schema globale versionato. |
| R06 | Implementato e verificato localmente | UTF-8 rigoroso, BOM/EOL mantenuti, media letti come byte e SVG come testo con preview, binari non mostrati come caratteri. |
| R07 | Parziale | Albero e ricerca virtualizzati, scansioni/letture/regex limitate e diff commit caricati al click. Restano benchmark grandi repository, cache e lazy diff dello stato Git. |
| R08 | Parziale | Cestino, distinzione riferimento/file, scaffold in staging con rollback, wizard attende l’esito, buffer preservati nei ripristini/cancellazioni. Resta undo applicativo. |
| R09 | Implementato e verificato localmente | Esplora file e documenti locali collegati; Novità punta al registro aggiornato. |
| Q01 | Parziale | Servizi separati, GitDrawer consolidato, import/demo ripuliti, noUnused/lint e workflow CI. App/main necessitano ancora ulteriore scomposizione e formatting uniforme. |
| Q02 | Verifica rinviata | Test locali, PBX/workspace/xcconfig/media/Git e smoke UI aggiunti. Round-trip Xcode, build firmata e installazione reale non eseguiti. |
| Q03 | Verifica rinviata | Eseguibili/installer non ricostruiti; firma, aggiornamenti e test Windows pulito restano da eseguire con autorizzazione alle build. |

## Comandi di verifica senza build del prodotto

```powershell
npm run lint
npm run test:local
node --test tests/pty.test.mjs
npm run test:media-ui
```

`npm test` include anche prove della toolchain installata; per rispettare questo incarico è stata usata la suite `test:local`. Le operazioni SDK/device collegate nella UI sono azioni future esplicite dell’utente, non operazioni eseguite durante questo intervento.
