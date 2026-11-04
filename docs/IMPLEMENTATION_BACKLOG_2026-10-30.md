# Implementazioni rimanenti — 30 ottobre 2026

Censimento dei sorgenti attuali dell'IDE e dei punti d'integrazione con OpenFruit.
Sono **58 voci**: funzionalità assenti, flussi parziali, demo,
robustezza e verifiche ancora necessarie per l'obiettivo Xcode. Non si pretende
di enumerare ogni funzione possibile di Xcode.

**Verifica eseguita:** `npm run typecheck` e `npm test` passano, con 37 test.
Sono stati esaminati frontend, handler App, bridge IPC, backend Electron,
parser PBX, salvataggi/sessioni, LSP, Git, terminali, build e test. Il CLI
installato è stato interrogato in lettura con `capabilities`, schema 2.
Non sono stati modificati sorgenti applicativi o dipendenze, riavviati gli IDE
aperti, eseguite build iOS o operazioni di autenticazione, installazione e deploy.
Non sono stati rieseguiti gli smoke desktop che aprono finestre.

Le priorità sono: **P1** per coerenza, affidabilità e percorsi fondamentali;
**P2** per completamento dei flussi e produttività; **P3** per consolidamento.
Le voci di **Verifica** indicano una prova mancante, non necessariamente codice
assente. Le assenze per parità Xcode sono capacità da aggiungere, non TODO
necessariamente già presenti come commenti nei sorgenti.


Totali: P1 **29**, P2 **28**, P3 **1**.

## Funzioni già presenti

Non vanno rifatte da zero: parsing PBX e modifica mirata delle build settings,
selezione target/configurazione da editare, package Xcode non espanso nel
navigatore, merge editor/disco a tre vie, controllo revisione dei file,
copie di recupero, terminale ConPTY interattivo, completion/hover/diagnostica
SourceKit, CLI ed eventi JSON, enumerazione USB/rete, staging/commit/diff/
fetch/push/clone Git e cancellazione delle operazioni di rete. La cronologia
Git esiste già, limitata a 30 commit.

## Progetti Xcode — 15 voci

| ID | Priorità | Stato | Da completare e riscontro | Codice |
|---|---|---|---|---|
| X01 | P1 | Parziale | **Navigatore logico.** Costruire l'albero da PBXGroup, PBXVariantGroup, sourceTree e gruppi sincronizzati. Oggi viene scandito il filesystem: nascondere gli interni del package non equivale a usare i gruppi del progetto. | [workspace][workspace], [modello PBX][pbx-model] |
| X02 | P1 | Parziale | **CRUD file coerente con PBX.** Creazione, spostamento, rinomina e rimozione devono aggiornare riferimenti, gruppi, target membership e build phases. Gli handler attuali cambiano disco e tab; nei progetti con riferimenti espliciti questo non aggiunge o rinomina automaticamente un sorgente nel progetto. | [creazione file][new-file], [rinomina][rename-file] |
| X03 | P1 | Assente | **Workspace.** Leggere contents.xcworkspacedata, progetti inclusi, riferimenti e dipendenze incrociate. Il modello corrente espone singoli .xcodeproj, non un workspace Xcode. | [contratto Xcode][xcode-contract], [instradamento UI][project-router] |
| X04 | P1 | Assente | **Schemes e selezione della build.** Aggiungere scheme, target qualificato, configurazioni personalizzate e destinazione, collegandoli agli argomenti nativi supportati. La selezione nel project editor sceglie cosa editare, non lo scheme da compilare. Il builder IDE rappresenta soltanto debug/release. | [argomenti build][build-args], [invocazione][build-handler] |
| X05 | P1 | Parziale | **Build settings risolte.** Valutare .xcconfig, include, variabili, inherited, default SDK e condizioni. Oggi sono esposte definizioni PBX e una semplice eredità progetto/target per nome della configurazione; la UI dichiara di non espandere .xcconfig e variabili. | [ereditarietà][inheritance], [avviso nella vista][settings-origin] |
| X06 | P2 | Assente | **Target, configurazioni e build rules.** Creare, duplicare ed eliminare target/configurazioni; gestire prodotti e build rules. La scrittura attuale modifica solo impostazioni di configurazioni esistenti. | [contratto Xcode][xcode-contract], [patch PBX][pbx-patch] |
| X07 | P1 | Parziale | **Swift Package.** Esporre requisiti/versioni strutturati, aggiunta/rimozione, associazione ai target, risoluzione e lockfile. Oggi si mostrano principalmente prodotti e URL; la sezione è in sola lettura. | [Dependencies][dependencies], [modello PBX][pbx-model] |
| X08 | P2 | Parziale | **Dipendenze fra target.** Modificare PBXTargetDependency e riferimenti/proxy, verificando integrità e cicli. Attualmente vengono proiettati i nomi delle dipendenze. | [modello PBX][pbx-model], [contratto Xcode][xcode-contract] |
| X09 | P1 | Parziale | **Build phases.** Modificare ordine, sorgenti, risorse, framework, copie e script. Esporre shell, input/output e opzioni delle fasi: il DTO della vista conserva solo ID, nome e file. | [Build Phases][phases], [contratto Xcode][xcode-contract] |
| X10 | P1 | Parziale | **Signing & Capabilities del target.** Integrare capabilities, entitlements, associazione e validazione delle identità/profili. DEVELOPMENT_TEAM e altri campi vengono già salvati nel PBX, ma rimangono valori testuali. | [Signing][signing], [salvataggio PBX][xcode-save] |
| X11 | P2 | Parziale | **Info, asset e risorse.** Aggiungere editor tipizzati per Info.plist, entitlements, cataloghi asset, localizzazioni e documenti UI. Oggi i plist si aprono come XML e i binari vengono rifiutati. | [tipo editor][editor-language], [lettura testi][text-reader] |
| X12 | P2 | Parziale | **Project editor nel workbench.** Aprire le impostazioni come tab centrale con stato e navigazione coerenti. La UI corrente è ancora un dialogo sovrapposto. | [editor Xcode][xcode-editor], [montaggio del dialogo][settings-mount] |
| X13 | P2 | Parziale | **Template Xcode.** Generare veri .xcodeproj/schemes e template per test, framework, extension e UIKit/Objective-C. Il wizard attuale genera Package.swift e accetta solo Swift 6.0 con SwiftUI. | [scaffold][scaffold] |
| X14 | P2 | Parziale | **Metadati e recenti.** Leggere identità/framework/versioni dai manifesti invece di assegnare valori fissi all'apertura. Usare il percorso come identità dei recenti: cambio/rimozione per nome possono confondere progetti omonimi. | [apertura progetto][open-project], [cambio per nome][recent-switch] |
| X15 | P1 | Parziale | **Entrypoint nativi e riferimenti esterni.** Gestire apertura .xcodeproj/.xcworkspace, argomenti d'avvio e sorgenti esterni con autorizzazioni esplicite. Il picker seleziona directory e la radice dei permessi non rappresenta un grafo di workspace. | [directory picker][directory-picker], [accessi workspace][workspace-access] |

## Editor e linguaggi — 10 voci

| ID | Priorità | Stato | Da completare e riscontro | Codice |
|---|---|---|---|---|
| E01 | P1 | Parziale | **Contesto iOS per SourceKit.** Collegare indice e server al piano di build effettivo: target, SDK, moduli, flag e build server. Il server viene avviato con root e capability di base, senza un collegamento esplicito al piano nativo OpenFruit. Questo non dimostra che tutte le diagnosi siano errate. | [inizializzazione LSP][lsp-start] |
| E02 | P1 | Parziale | **Servizi semantici.** Aggiungere definition, references, rename semantico, signature help, code actions, formatting, simboli e semantic tokens. Oggi sono collegati completion, hover e diagnostica; i cataloghi SwiftUI sono un fallback funzionante. | [RPC LSP esposte][lsp-rpc], [provider Swift][swift-providers] |
| E03 | P2 | Parziale | **Linguaggi oltre Swift.** Registrare linguaggi/servizi per C, Objective-C, C++, JSON e altri formati. Il loader registra Swift e XML e il componente imposta gli altri documenti su plaintext. | [loader Monaco][monaco-loader], [scelta linguaggio][editor-language] |
| E04 | P1 | Assente | **Ricerca nel workspace.** Ricerca del contenuto su più file con esclusioni, risultati e sostituzioni protette. Ricerca per nome/percorso e find/replace sul documento corrente esistono già, ma non sono ricerca globale. | [Quick Open][quick-open], [find nel documento][document-find] |
| E05 | P2 | Parziale | **Outline e navigazione.** Generare outline e breadcrumb dai simboli, rendere cliccabili i segmenti e introdurre cronologia avanti/indietro. Il breadcrumb attuale mostra il percorso e un simbolo body fisso. | [breadcrumb][breadcrumbs] |
| E06 | P1 | Parziale | **Navigazione dai problemi.** Portare il cursore alla riga/colonna, evidenziare il range ed esporre informazioni correlate/fix. Il click attuale apre il file senza inoltrare la posizione a Monaco. | [selezione problema][problem-navigation] |
| E07 | P2 | Assente | **Gruppi di editor e tab avanzati.** Split editor, riordino/spostamento tab, pin/preview e navigazione MRU. Il workbench renderizza un solo editor attivo e una lista semplice di tab. | [editor][editor-area] |
| E08 | P1 | Assente | **File watcher.** Monitorare modifiche, rinomine ed eliminazioni esterne per aggiornare albero, tab puliti e Git. Il conflitto al salvataggio è implementato, ma non sostituisce watcher e rilettura dei documenti puliti. | [refresh albero][tree-refresh], [apertura file][file-open] |
| E09 | P2 | Assente | **Autosave dei sorgenti.** Aggiungere una politica configurabile con protezione dai conflitti. Hot Exit conserva le bozze nella sessione: non salva automaticamente i documenti sul disco. | [Hot Exit][session-save], [salva file][save-active] |
| E10 | P2 | Parziale | **Untitled e Salva con nome.** Gestire documenti nuovi non ancora sul disco, Salva con nome generale e duplicazione. Esistono creazione immediata di file e copie di recupero dei conflitti. | [nuovo file][new-file], [copia di recupero][recovery-copy] |

## Build, debug e runtime — 8 voci

| ID | Priorità | Stato | Da completare e riscontro | Codice |
|---|---|---|---|---|
| B01 | P1 | Parziale | **Build, Install e Run separati.** Build aggiunge automaticamente --deploy con device selezionato e disponibile. Servono azioni distinte; il lancio successivo non è implementato dal contratto corrente del motore. | [build][build-handler], [toolbar][build-toolbar] |
| B02 | P1 | Assente | **Debug reale.** Sessione/adapter, breakpoint, stepping, stack, variabili, watch e console. Il pulsante Debug è disabilitato; la scheda inferiore mostra però ancora una sessione LLDB Attached fittizia da rimuovere o sostituire. | [pulsante disabilitato][debug-button], [console dimostrativa][debug-console] |
| B03 | P2 | Assente | **Test navigator e runner iOS.** Scoperta, avvio, risultati XCTest/XCUITest, test plans e coverage, dopo aver definito il supporto del backend. I test npm verificano l'IDE, non eseguono i test del progetto iOS. | [bridge][preload], [viste navigatore][navigator-modes] |
| B04 | P2 | Parziale | **Vista strutturata della build.** Task/fasi, progresso, durata, relazioni, errori e artefatti cliccabili. Gli eventi JSON arrivano e sono espandibili, ma vengono resi prevalentemente come righe di log. | [eventi][event-protocol], [output][output-view] |
| B05 | P2 | Assente | **Report e cronologia operazioni.** Persistenza/riapertura dei report, replay del journal, ricerca/filtro/esportazione dei log e diagnostiche. Lo stato corrente conserva un buffer React limitato. | [coda log][log-buffer], [bridge][preload] |
| B06 | P1 | Assente | **Prodotti, archive ed export.** Flussi GUI per prodotti, package/IPA, firma, verifica e installazione indipendente dalla build. Alcune operazioni esistono nel CLI; la GUI invoca principalmente build. La verifica indipendente delle firme è dichiarata incompleta dal motore. | [argomenti build][build-args], [bridge][preload] |
| B07 | P2 | Parziale | **Gestione terminali.** Profili shell, riavvio della sessione terminata, rinomina tab, ricerca/pulizia del buffer e preferenze persistenti. ConPTY, input, resize, Ctrl+C e backpressure sono già implementati; la shell è fissata a powershell.exe. | [spawn PTY][pty-spawn], [terminale UI][terminal-ui] |
| B08 | P2 | Dimostrativo | **Canvas e preview.** Collegare la preview al progetto e a una tecnologia di rendering/esecuzione effettiva. Il canvas è una demo React di Orto con device e refresh simulati, non un simulatore iOS o preview SwiftUI. | [canvas][canvas] |

## SDK, ambiente e dispositivi — 7 voci

| ID | Priorità | Stato | Da completare e riscontro | Codice |
|---|---|---|---|---|
| I01 | P1 | Dimostrativo | **Inventario SDK.** Leggere installati, catalogo e selezione attiva dal motore. App inizializza defaultSdks; la schermata dichiara il catalogo dimostrativo. | [stato SDK][sdk-state], [catalogo][sdk-demo] |
| I02 | P2 | Parziale | **Gestione SDK completa.** Collegare select/download/remove con progresso, cancellazione, errori, autenticazione e spazio disco. I controlli sono disabilitati e il vecchio handler cambia solo lo stato React: non va riattivato come se installasse davvero. | [controlli SDK][sdk-demo], [handler locale][sdk-toggle] |
| I03 | P1 | Parziale | **Ambiente reale.** Rilevare CLI/toolchain/cache, integrare doctor/bootstrap/dependency update e problemi azionabili. Aggiornare capabilities dopo cambiamenti. I percorsi visualizzati sono fissi; le capability si caricano una volta al mount. | [Generali][environment-settings], [capability al mount][capability-load] |
| I04 | P2 | Parziale | **Account Apple e provisioning.** Autenticazione del motore, inventario/import/selezione delle identità, profili e scadenze. Oggi sono disponibili percorsi P12/profile e un Team ID di riferimento per progetti non Xcode, non un pannello account completo. | [firma progetto generico][generic-signing], [bridge][preload] |
| I05 | P1 | Parziale | **Dispositivi coerenti in tutte le viste.** Stato reale condiviso, errori azionabili, pairing/trust e diagnosi di rete. La toolbar usa enumerazione vera e polling; Settings mostra ancora un iPhone/UDID fissi e non riceve lo stato reale. | [scansione reale][devices], [device fisso][fake-device] |
| I06 | P2 | Assente | **Strumenti device.** Informazioni, log, screenshot/registrazione e installazione manuale, verificando ogni comando del backend. La GUI espone enumerazione/selezione e deploy attraverso build, non una console operativa del dispositivo. | [bridge][preload], [toolbar][build-toolbar] |
| I07 | P2 | Assente | **Preferenze effettive.** Editor, font/dimensione, indentazione, autosave e scorciatoie modificabili e persistenti. Generali/Aspetto/Scorciatoie sono soprattutto descrittive o read-only; le opzioni Monaco sono fissate nel componente. | [aspetto][appearance], [editor][editor-area] |

## Git — 6 voci

| ID | Priorità | Stato | Da completare e riscontro | Codice |
|---|---|---|---|---|
| G01 | P2 | Assente | **Branch e remoti.** Creazione/cambio branch, tracking, remoti e ahead/behind. Il branch è letto e mostrato, senza API/controlli per modificarlo. | [stato Git][git-status], [bridge][preload] |
| G02 | P1 | Assente | **Pull e conflitti Git.** Merge/rebase, stash e risoluzione dello stato unmerged nell'indice. Il merge editor/disco a tre vie non è un flusso per i conflitti Git. | [API Git][preload], [merge editor][editor-merge] |
| G03 | P2 | Parziale | **Diff e staging granulari.** Staging/revert per hunk/righe e confronti HEAD/index/worktree completi. Il diff laterale distingue staged/unstaged; il confronto a due colonne di App parte da HEAD e contenuto corrente senza ricevere isStaged. | [apertura diff][diff-open], [selezione sidebar][git-sidebar] |
| G04 | P2 | Parziale | **Cronologia navigabile.** Dettagli commit/revisioni, diff/blame e paginazione. La cronologia esiste già come lista di 30 commit. | [log limitato][git-log], [sidebar][git-sidebar] |
| G05 | P1 | Dimostrativo | **Impostazioni Git reali.** Rilevare/configurare binario, autore, identità e autenticazione. Settings mostra percorso Git e autore Giulia fissi, senza leggere git config. | [impostazioni Git][git-settings] |
| G06 | P1 | Robustezza | **Errori distinti da repository assente.** git-get-status intercetta gli errori e restituisce isGit:false con liste vuote. Una failure può sembrare assenza del repository e svuotare la vista. Propagare errore e stato esplicito. | [catch backend][git-error], [refresh UI][git-refresh] |

## Robustezza e completamento del prodotto — 9 voci

| ID | Priorità | Stato | Da completare e riscontro | Codice |
|---|---|---|---|---|
| R01 | P1 | Robustezza | **Salvataggi transazionali di tutti i sorgenti.** Estendere il percorso atomico già usato per PBX. saveSnapshot ha atomic=false di default e usa altrimenti writeFile diretto: il controllo revisione non evita scritture parziali per errore disco. | [file store][file-store], [PBX atomico][xcode-save] |
| R02 | P1 | Parziale | **Recupero completo della sessione.** Limiti/errori di persistenza, migrazioni/backup e bozze delle impostazioni oltre ai tab. Hot Exit esiste, ma diversi errori di persistenza sono ignorati; le bozze dei dialoghi restano locali e la protezione alla chiusura non è uniforme. | [sessione][session-save], [dialogo generico][generic-dialog] |
| R03 | P1 | Robustezza | **Coordinamento fra istanze.** Definire identità delle sessioni fra processi e ripristino delle finestre. windowSlots è un progressivo in memoria: due processi possono usare entrambi lo slot zero nella stessa userData. Non c'è un lock single-instance o protocollo equivalente nel main. | [slot per processo][window-slots], [file sessione][session-path] |
| R04 | P1 | Parziale | **Tastiera e accessibilità uniformi.** Keybindings per contesto editor/terminale/dialogo, focus trap, ruoli e albero navigabile. Ctrl+O/Ctrl+Shift+W sono pubblicizzati ma non gestiti nella mappa App; Ctrl+Alt+P entra prima nel ramo Ctrl+P; vari dialoghi legacy non hanno aria-modal. Anche i global shortcut possono interferire con il terminale. | [keybindings][keyboard], [menu][file-menu], [Settings][settings-modal] |
| R05 | P1 | Parziale | **Contratti e validazione IPC.** Completare tipi, validazione payload/root/URI e contratto versionato. Le nuove API sono in parte tipizzate, ma restano molti any; lsp-init e i metodi documento inoltrano root/URI senza la guardia WorkspaceAccess usata dalle API file. | [preload][preload], [endpoint LSP][lsp-endpoints] |
| R06 | P2 | Parziale | **Encoding, EOL e file grandi/binari.** Rilevare encoding/BOM/EOL ed evitare conversioni UTF-8 distruttive dei testi non UTF-8. La lettura usa toString(utf8), rifiuta NUL e oltre 2 MB; la barra di stato dichiara sempre UTF-8/Swift 6.0. | [lettura][text-reader], [stato editor][breadcrumbs] |
| R07 | P2 | Robustezza | **Scala e prestazioni.** Misurare repository grandi e introdurre dove necessario cache/scansione incrementale, virtualizzazione e caricamento dei diff su richiesta. readProjectSettings ripete una scansione dell'albero; le viste mappano liste intere. Questo è un limite da misurare, non un benchmark di lentezza già dimostrato. | [discovery][project-discovery], [albero][navigator], [output][output-view] |
| R08 | P2 | Parziale | **Operazioni reversibili e wizard robusti.** Cestino/undo e distinzione fra eliminare riferimento e file fisico; busy e gestione transazionale/staging degli errori di creazione. Delete è permanente; il wizard inoltra onCreate senza attendere e lo scaffold scrive direttamente più file. | [menu file][context-menu], [submit wizard][new-project-submit], [scaffold][scaffold] |
| R09 | P2 | Assente | **Azioni senza destinazione.** Mostra in Esplora file chiude soltanto il menu. I link Documentazione/Novità della Welcome puntano a #docs e #news. Collegare queste azioni a destinazioni effettive. | [menu contestuale][context-menu], [link Welcome][welcome-links] |

## Qualità, prove e distribuzione — 3 voci

| ID | Priorità | Stato | Da completare e riscontro | Codice |
|---|---|---|---|---|
| Q01 | P3 | Robustezza | **Struttura e controlli automatici.** Scomporre App/main, eliminare import/demo inutilizzati e consolidare i componenti Git duplicati. Introdurre lint/format/CI: noUnused è disabilitato, manca uno script lint e non risultano configurazioni CI nel repository esaminato. | [App][app], [main][main], [TypeScript][typescript], [package][package], [GitDrawer non usato][old-git-drawer] |
| Q02 | P1 | Verifica | **Conformità ed end-to-end.** Corpus/fuzz PBX e round-trip con Xcode, workspace/multi-target/.xcconfig, build iOS firmata e installazione reale. I 37 test passano, ma non certificano la compatibilità completa con Xcode o una release iOS funzionante. | [test PBX][pbx-tests], [smoke Xcode][xcode-tests], [limiti verificati][xcode-report] |
| Q03 | P2 | Verifica | **Distribuzione desktop.** Artefatti aggiornati/coerenti, collaudo installer su Windows pulito, publisher/firma, icone, aggiornamenti e architetture supportate. Esistono già controllo ASAR e test ConPTY; non equivalgono al collaudo dell'installer. Il pacchetto precedente non include l'ultimo editor Xcode. | [packaging][package], [verifica pacchetto][package-tests], [stato distribuzione][xcode-report] |

## Dipendenze dal motore OpenFruit

Il risultato locale di `capabilities` è stato letto durante questo censimento.
`implemented` descrive un inventario di implementazioni/prerequisiti, non prova
il successo su un progetto, certificato o dispositivo particolare.

| Stato osservato | Operazioni | Conseguenza |
|---|---|---|
| implemented | build, package, sign, deploy, devices | Ci sono flussi da integrare nell'IDE; servono comunque validazione per richiesta e prove reali. |
| implemented | sdk_list, sdk_select, sdk_download, sdk_remove, sdk_auto_selection | Il gestore SDK dimostrativo è una lacuna dell'integrazione IDE, non semplicemente un'assenza del motore. |
| implemented | apple_browser_auth, dependency_update, event_journal, project_inspect | Verificare l'interfaccia effettivamente invocabile prima di collegarla: non tutte le implementazioni dichiarate sono un adapter IDE pubblico. |
| unsupported | device_launch | La GUI non può promettere il lancio dell'app dopo il deploy. |
| unsupported | ide_operation_adapter | Manca il contratto versionato delle operazioni IDE; per il debug serve comunque un protocollo/adapter specifico. |
| unsupported | valid_signed_ipa_verification, zero_wsl_build | Non promettere verifica indipendente completa delle firme o build completamente prive di WSL. |

Il motore dichiara inoltre compatibilità macro/risorse ed end-to-end incompleti
per build; sign tramite legacy signer adapter; deploy tramite backend esterno
con pairing/device/prodotto firmato da verificare. SDK remove e cache pruning
dichiarano validazioni di sicurezza ancora incomplete. Questi risultati non
vanno simulati nella GUI o considerati risolti aggiungendo un pulsante.

## Ordine consigliato

1. **Togliere informazioni dimostrative che sembrano reali:** I05, G05 e B02;
   mantenere il canvas chiaramente dimostrativo finché B08 non esiste.
2. **Coerenza del modello Xcode:** X01, X02, X03, X04, X05 e X15; poi X07/X09
   e firma. I controlli devono modificare il modello e la configurazione giusti.
3. **Protezione del lavoro:** E08, R01, R02, R03, R04 e R05.
4. **Ambiente e sviluppo:** I01/I03/I04/I02, contesto SourceKit E01,
   servizi editor E02/E04/E06.
5. **Ciclo iOS e release:** B01/B06, B02/B03 e Q02/Q03, coordinando i blocchi
   del motore. Le altre P2 seguono questi flussi.

Gli ID identificano interventi successivi verificabili. Il JSON associato contiene
le stesse voci e i riferimenti ai sorgenti. La selezione di poche P1 alla volta
è preferibile a un intervento unico che tocchi tutte le aree.

[workspace]: electron/workspace.ts:8
[pbx-model]: electron/pbxproj.ts:93
[new-file]: src/App.tsx:1098
[rename-file]: src/App.tsx:1169
[xcode-contract]: shared/xcode.ts:1
[project-router]: src/components/ProjectConfiguration.tsx:6
[build-args]: shared/projectSettings.ts:40
[build-handler]: src/App.tsx:733
[inheritance]: src/components/XcodeProjectEditor.tsx:31
[settings-origin]: src/components/XcodeProjectEditor.tsx:116
[pbx-patch]: electron/pbxproj.ts:138
[dependencies]: src/components/XcodeProjectEditor.tsx:125
[phases]: src/components/XcodeProjectEditor.tsx:126
[signing]: src/components/XcodeProjectEditor.tsx:119
[xcode-save]: electron/xcode.ts:13
[editor-language]: src/components/CenterPanel.tsx:404
[text-reader]: electron/workspace.ts:36
[xcode-editor]: src/components/XcodeProjectEditor.tsx:6
[settings-mount]: src/App.tsx:1479
[scaffold]: electron/main.ts:260
[open-project]: src/App.tsx:521
[recent-switch]: src/App.tsx:619
[directory-picker]: electron/main.ts:179
[workspace-access]: electron/workspaceAccess.ts:24
[lsp-start]: electron/lsp.ts:36
[lsp-rpc]: electron/main.ts:909
[swift-providers]: src/utils/swiftLanguage.ts:91
[monaco-loader]: src/utils/monaco.ts:1
[quick-open]: src/components/CommandPalette.tsx:59
[document-find]: src/components/CenterPanel.tsx:225
[breadcrumbs]: src/components/CenterPanel.tsx:334
[problem-navigation]: src/App.tsx:835
[editor-area]: src/components/CenterPanel.tsx:360
[tree-refresh]: src/App.tsx:660
[file-open]: src/App.tsx:691
[session-save]: src/App.tsx:265
[save-active]: src/App.tsx:684
[recovery-copy]: src/hooks/useFileConflicts.ts:70
[build-toolbar]: src/components/TopBar.tsx:213
[debug-button]: src/components/TopBar.tsx:233
[debug-console]: src/components/BottomPanel.tsx:293
[preload]: electron/preload.ts:1
[navigator-modes]: src/components/LeftPanel.tsx:19
[event-protocol]: src/engineProtocol.ts:10
[output-view]: src/components/BottomPanel.tsx:230
[log-buffer]: src/App.tsx:343
[pty-spawn]: electron/pty.ts:16
[terminal-ui]: src/components/InteractiveTerminal.tsx:1
[canvas]: src/components/RightPanel.tsx:27
[sdk-state]: src/App.tsx:101
[sdk-demo]: src/components/SettingsModal.tsx:222
[sdk-toggle]: src/App.tsx:1218
[environment-settings]: src/components/SettingsModal.tsx:314
[capability-load]: src/App.tsx:340
[generic-signing]: src/components/ProjectSettingsDialog.tsx:105
[devices]: src/App.tsx:119
[fake-device]: src/components/SettingsModal.tsx:370
[appearance]: src/components/SettingsModal.tsx:94
[git-status]: electron/main.ts:611
[editor-merge]: electron/merge.ts:9
[diff-open]: src/App.tsx:787
[git-sidebar]: src/components/GitSidebarView.tsx:26
[git-log]: electron/main.ts:630
[git-settings]: src/components/SettingsModal.tsx:386
[git-error]: electron/main.ts:707
[git-refresh]: src/App.tsx:636
[file-store]: electron/fileStore.ts:15
[generic-dialog]: src/components/ProjectSettingsDialog.tsx:25
[window-slots]: electron/main.ts:52
[session-path]: electron/main.ts:60
[keyboard]: src/App.tsx:391
[file-menu]: src/components/FileMenuDropdown.tsx:72
[settings-modal]: src/components/SettingsModal.tsx:46
[lsp-endpoints]: electron/main.ts:898
[project-discovery]: electron/projectSettings.ts:25
[navigator]: src/components/LeftPanel.tsx:127
[context-menu]: src/components/ContextMenu.tsx:103
[new-project-submit]: src/components/NewProjectModal.tsx:58
[welcome-links]: src/components/WelcomeScreen.tsx:219
[app]: src/App.tsx:1
[main]: electron/main.ts:1
[typescript]: tsconfig.json:15
[package]: package.json:7
[old-git-drawer]: src/components/GitDrawer.tsx:28
[pbx-tests]: tests/pbxproj.test.mjs:1
[xcode-tests]: tests/xcode-smoke.cjs:1
[xcode-report]: docs/XCODE_PROJECT_EDITOR_2026-10-30.md:69
[package-tests]: tests/run-packaged-smoke.cjs:16
