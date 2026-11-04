import {defaultProjectSettings,validateProjectSettings} from '../shared/projectSettings';
import {readDocument} from './documents';
import {commitDetails,commitComparison} from './commitHistory';
import {fileHunks,applyFileHunks} from './gitHunks';
import { OperationReports } from './reports';
import { deviceArguments, type DeviceRequest } from '../shared/device';
import { projectMetadata } from './projectMetadata';
import { withProjectFileChange } from './xcodeFileChanges';
import { createScaffold, nativeProjectFiles } from './scaffold';
import { repositoryInfo, repositoryArgs, repositoryHistory, repositoryCommit } from './repository';
import { resolveXcodeSettings } from './xcconfig';
import { projectNavigator } from './xcodeNavigator';
import { WorkspaceSearch, replaceSearchResults } from './search';
import { environmentSnapshot, environmentArguments } from './environment';
import { WorkspaceEvents } from './workspaceEvents';
import { defaultPreferences, validatePreferences } from '../shared/preferences';
import { translate, type Message } from '../shared/localization';
import { readXcodeProject, saveXcodeProject, mutateXcodeProject } from './xcode';
import { readProjectSettings, saveProjectSettings, drainProjectSettings } from './projectSettings';
import { mergeContents } from './merge';
import { PtyManager } from './pty';
import { app, BrowserWindow, ipcMain, dialog, shell, net } from 'electron';
import { checkForStudioUpdate } from './updates';
import path from 'path';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import { normalizeDevices, runOpenFruit } from './openfruit';
import { scanDirectoryTree, readTextFile, containedPath, validateProjectName, MAX_TEXT_BYTES } from './workspace';
import { execGit, execRepositoryGit, gitRoot, parseGitStatus } from './git';
import { writeJsonAtomic, readJsonRecover, readJson, removeJson, drainPersistence } from './persistence';
import { LspManager } from './lsp';
import { WorkspaceAccess } from './workspaceAccess';
import { readSnapshot, saveSnapshot, drainFileSaves } from './fileStore';
import { TerminalManager } from './terminal';
import { PreviewSessions } from './preview';
import { GitOperations } from './gitOperations';
import type { GitOperation } from '../shared/git';
const gitOperations = new GitOperations();
const terminals = new TerminalManager();
const ptys = new PtyManager();
const previews = new PreviewSessions();
const workspaceEvents = new WorkspaceEvents();
const workspaceSearch = new WorkspaceSearch();
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
let pendingNativeProject = process.argv.find(arg => /\.(xcodeproj|xcworkspace)$/i.test(arg) && fs.existsSync(arg));
const nativeProject = (sender:Electron.WebContents,value:string) => {const entry=path.resolve(value);if(!/\.(xcodeproj|xcworkspace)$/i.test(entry)||!fs.statSync(entry).isDirectory())throw new Error('Entrypoint Xcode non valido');const root=path.dirname(entry);accessFor(sender).grant(root);return {root,entrypoint:entry};};
app.on('second-instance', (_event,argv) => { const window=windows[0];const entry=argv.find(arg=>/\.(xcodeproj|xcworkspace)$/i.test(arg)&&fs.existsSync(arg));if(entry)pendingNativeProject=entry;if(window){if(window.isMinimized())window.restore();window.show();window.focus();if(entry&&!window.webContents.isLoading()){window.webContents.send('native-project-opened',nativeProject(window.webContents,entry));pendingNativeProject=undefined;}} });

function handleIpc(channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) {
  ipcMain.handle(channel, (event, ...args) => {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error('IPC sender non autorizzato');
    const url = new URL(frame.url);
    const allowed = process.env.NODE_ENV === 'development'
      ? url.origin === 'http://127.0.0.1:5173'
      : url.protocol === 'file:' && path.resolve(fileURLToPath(url)) === path.resolve(__dirname, '../dist/index.html');
    if (!allowed) throw new Error('Origine IPC non autorizzata');
    if (channel.startsWith('git-') && !['git-clone', 'git-save-identity'].includes(channel)) {
      const requested = typeof args[0] === 'string' ? args[0] : args[0]?.repoPath;
      accessFor(event.sender).assert(requested, true);
    }
    return handler(event, ...args);
  });
}

const workspaceAccess = new Map<number, WorkspaceAccess>();
function accessFor(sender: Electron.WebContents) {
  let access = workspaceAccess.get(sender.id);
  if (!access) {
    access = new WorkspaceAccess(path.join(app.getPath('documents'), 'OpenFruit Projects'));
    workspaceAccess.set(sender.id, access);
    sender.once('destroyed', () => { workspaceSearch.cancel(sender.id); workspaceEvents.stop(sender.id); workspaceAccess.delete(sender.id); terminals.closeOwner(sender.id); ptys.closeOwner(sender.id); gitOperations.cancelOwner(sender.id); });
  }
  return access;
}

let windows: BrowserWindow[] = [];
let nextWindowSlot = 0;
const windowSlots = new Map<number, number>();

function getRecentsFilePath(): string {
  const userData = app.getPath('userData');
  return path.join(userData, 'recent_projects.json');
}

function getSessionFilePath(ownerId: number): string {
  const userData = app.getPath('userData');
  const slot = windowSlots.get(ownerId) || 0;
  return path.join(userData, slot ? `session_state-${slot}.json` : 'session_state.json');
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 980,
    height: 640,
    minWidth: 800,
    minHeight: 540,
    frame: false, // Rimuove completamente la barra nativa di Windows!
    backgroundColor: '#262925',
    title: 'OpenFruit Studio',
    icon: path.join(__dirname, '../branding/openfruit-studio.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const ownerId = win.webContents.id;
  windowSlots.set(ownerId, nextWindowSlot++);
  win.webContents.once('destroyed', () => windowSlots.delete(ownerId));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());

  const distHtmlPath = path.join(__dirname, '../dist/index.html');
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else if (fs.existsSync(distHtmlPath)) {
    win.loadFile(distHtmlPath);
  } else {
    win.loadURL('http://127.0.0.1:5173');
  }

  win.on('closed', () => {
    windows = windows.filter(w => w !== win);
  });

  windows.push(win);
  return win;
}

app.whenReady().then(() => {
  if (!ownsInstance) return;
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  workspaceSearch.closeAll(); workspaceEvents.closeAll();
  terminals.closeAll(); ptys.closeAll(); gitOperations.closeAll();
  for (const run of engineRuns.values()) run.controller.abort();
  for (const manager of lspManagers.values()) manager.stop();
});

// Windows have completed beforeunload by will-quit; flush the writes they submitted.
let persistenceDrained = false;
app.on('will-quit', event => {
  if (persistenceDrained) return;
  event.preventDefault();
  Promise.all([drainProjectSettings(), drainPersistence(), drainFileSaves(), terminals.closeAll(), ptys.closeAll(), gitOperations.closeAll()]).finally(() => { persistenceDrained = true; app.quit(); });
});

app.on('window-all-closed', () => {
  for (const manager of lspManagers.values()) manager.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Window Controls (Frameless)
ipcMain.on('get-session-key', event => {
  const slot = windowSlots.get(event.sender.id) || 0;
  event.returnValue = slot ? `openfruit_session_state-${slot}` : 'openfruit_session_state';
});
handleIpc('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.minimize();
});

handleIpc('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});

handleIpc('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.close();
});

handleIpc('window-set-size', (event, { width, height, center }: { width: number; height: number; center?: boolean }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isMaximized()) {
    win.setSize(width, height, true);
    if (center) win.center();
  }
});

// Open New Window
handleIpc('open-new-window', () => {
  createWindow();
  return true;
});

// Directory Dialog Picker
handleIpc('select-directory', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  accessFor(event.sender).grant(result.filePaths[0]);
  return result.filePaths[0];
});

handleIpc('default-projects-directory', () => path.join(app.getPath('documents'), 'OpenFruit Projects'));
handleIpc('close-workspace', event => { workspaceSearch.cancel(event.sender.id); workspaceEvents.stop(event.sender.id); ptys.closeOwner(event.sender.id); accessFor(event.sender).clear(); gitOperations.cancelOwner(event.sender.id); return terminals.closeOwner(event.sender.id); });

// Each window owns its CLI process and receives only its own events.
const engineRuns = new Map<number, { id: string; controller: AbortController }>();
handleIpc('run-openfruit-command', async (event, args: string[], cwd?: string, requestId?: string) => {
  const owner = event.sender;
  if (engineRuns.has(owner.id)) return { success: false, code: -1, error: 'Un comando OpenFruit è già in esecuzione' };
  const controller = new AbortController();
  let queue: any[] = [];
  const startedAt = new Date().toISOString(), reportOutput: unknown[] = []; let reportBytes=0;
  const flush = () => {
    const batch = queue; queue = [];
    if (batch.length && !owner.isDestroyed()) owner.send('openfruit-output', batch);
  };
  const timer = setInterval(flush, 32);
  const id = requestId || String(Date.now());
  engineRuns.set(owner.id, { id, controller });
  const onDestroyed = () => controller.abort();
  owner.once('destroyed', onDestroyed);
  try {
    const result = await runOpenFruit(args, {
      cwd, signal: controller.signal,
      onOutput: output => {
        queue.push({ requestId: id, ...output });
        const size=Buffer.byteLength(JSON.stringify(output));if(reportBytes+size<4*1024*1024&&reportOutput.length<5000){reportOutput.push(output);reportBytes+=size;}
        if (queue.length >= 256) flush();
      }
    });
    try{await new OperationReports(path.join(app.getPath('userData'),'operation-reports')).save({root:cwd,operation:args[0],success:result.success,cancelled:result.cancelled,code:result.code??-1,startedAt,output:reportOutput});}
    catch(error:any){if(!owner.isDestroyed())owner.send('openfruit-output',{requestId:id,type:'stderr',text:'Report non salvato: '+error.message});}
    return result;
  } catch (error: any) {
    return { success: false, code: -1, error: error.message, stderr: error.message, output: error.message };
  } finally {
    clearInterval(timer); flush();
    engineRuns.delete(owner.id);
    owner.removeListener('destroyed', onDestroyed);
  }
});
handleIpc('preview-start', (event, udid: string) => { previews.start(event.sender, udid); });
handleIpc('preview-stop', event => { previews.stop(event.sender.id); });
handleIpc('cancel-openfruit-command', event => {
  engineRuns.get(event.sender.id)?.controller.abort();
});
handleIpc('get-openfruit-capabilities', async () => {
  const result = await runOpenFruit(['capabilities'], { signal: AbortSignal.timeout(15000) });
  if (!result.success) throw new Error(result.stderr || 'Impossibile leggere le capacità OpenFruit');
  const snapshot = JSON.parse(result.stdout);
  if (snapshot.schema_version !== 2 || !snapshot.operations || !snapshot.operation_details) {
    throw new Error('Schema capabilities OpenFruit non supportato');
  }
  return snapshot;
});
let deviceScan: Promise<any> | undefined;
handleIpc('get-devices', async () => {
  if (!deviceScan) deviceScan = (async () => {
    const result = await runOpenFruit(['devices', '--json'], { signal: AbortSignal.timeout(15000) });
    if (!result.success) throw new Error(result.stderr || 'Rilevamento dispositivi OpenFruit fallito');
    return normalizeDevices(JSON.parse(result.stdout));
  })().finally(() => { deviceScan = undefined; });
  return deviceScan;
});

handleIpc('read-project-tree', async (event, folderPath: string, logical = false) => {
  try {
    const access = accessFor(event.sender);
    const opening = access.beginOpen(folderPath);
    const tree = await scanDirectoryTree(opening.target);
    if (!tree || tree.type !== 'folder') throw new Error('Cartella progetto non disponibile');
    const repository = await gitRoot(opening.target).catch(() => undefined);
    if (!opening.current()) return { success: false, superseded: true };
    if (path.resolve(access.activePath || opening.target) !== opening.target) { workspaceSearch.cancel(event.sender.id); terminals.closeOwner(event.sender.id); ptys.closeOwner(event.sender.id); gitOperations.cancelOwner(event.sender.id); }
    access.activate(opening.target, repository);
    workspaceEvents.start(event.sender.id, opening.target, data => { if (!event.sender.isDestroyed()) event.sender.send('workspace-changed', data); });
    return { success: true, tree: logical ? await projectNavigator(opening.target, file => access.assert(file, true)) : tree };
  } catch (error: any) { return { success: false, error: error.message }; }
});

// Create Real Project Scaffold on Disk
handleIpc('create-project-scaffold', async (event, config: {
  name: string;
  bundleId: string;
  organization: string;
  minIosVersion: string;
  sdkVersion: string;
  language: string;
  interfaceType: string;
  projectPath: string;
  gitInit: boolean;
  template?: 'xcode' | 'swift-package';
}) => {
  try {
    validateProjectName(config.name);
    const projectDir = accessFor(event.sender).assertGranted(config.projectPath);
    const deploymentTarget = config.minIosVersion.replace(/^iOS\s+/i, '');
    if (!/^\d+(?:\.\d+){0,2}$/.test(deploymentTarget)) throw new Error('Versione minima iOS non valida');
    if (config.interfaceType !== 'SwiftUI' || config.language !== 'Swift 6.0') throw new Error('Scaffold disponibile per Swift 6.0 e SwiftUI');
    if (!/^([A-Za-z0-9-]+\.)+[A-Za-z0-9-]+$/.test(config.bundleId)) throw new Error('Bundle ID non valido');
    if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length) throw new Error('Scegli una cartella vuota: il progetto esistente non verrà sovrascritto');
    const files: Record<string,string> = {};
    if (config.template && !['xcode','swift-package'].includes(config.template)) throw new Error('Template non valido');

    // 1. Package.swift
    const packageSwift = `// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "${config.name}",
    platforms: [
        .iOS("${deploymentTarget}")
    ],
    products: [
        .executable(name: "${config.name}", targets: ["${config.name}"])
    ],
    targets: [
        .target(
            name: "${config.name}",
            path: "${config.name}"
        )
    ]
)
`;
    if (config.template === 'swift-package') files['Package.swift'] = packageSwift;

    // 2. Info.plist
    const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${config.name}</string>
    <key>CFBundleIdentifier</key>
    <string>${config.bundleId}</string>
    <key>CFBundleName</key>
    <string>${config.name}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>MinimumOSVersion</key>
    <string>${deploymentTarget}</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>UILaunchScreen</key>
    <dict/>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
    </array>
</dict>
</plist>
`;
    files[config.name+'/Info.plist'] = infoPlist;

    // 3. .gitignore
    const gitignore = `.DS_Store
build/
.build/
.openfruit_cache/
DerivedData/
xcuserdata/
*.ipa
`;
    files['.gitignore'] = gitignore;
    files['.openfruit-studio.json'] = JSON.stringify(validateProjectSettings({...defaultProjectSettings,configuration:'Debug',sdkVersion:config.sdkVersion==='Automatico'?'':config.sdkVersion,bundleId:config.bundleId,displayName:config.name}),null,2);

    // 4. App entry point
    const appSwift = `import SwiftUI

@main
struct ${config.name}App: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
`;
    files[config.name+'/'+config.name+'App.swift'] = appSwift;

    // 5. ContentView.swift
    const contentView = `import SwiftUI

struct ContentView: View {
    @State private var counter = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text("${config.name}")
                        .font(.system(size: 32, weight: .bold, design: .serif))
                        .foregroundStyle(Color(red: 0.15, green: 0.19, blue: 0.13))
                    
                    Text("Creato con OpenFruit Studio su Windows")
                        .font(.subheadline)
                        .foregroundStyle(Color(red: 0.44, green: 0.48, blue: 0.41))
                }

                Button(action: {
                    counter += 1
                }) {
                    HStack {
                        Image(systemName: "sparkles")
                        Text("Toccato: \\(counter) volte")
                    }
                    .font(.headline)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color(red: 0.80, green: 0.87, blue: 0.67))
                    .foregroundColor(Color(red: 0.15, green: 0.19, blue: 0.13))
                    .cornerRadius(16)
                }
                .padding(.horizontal, 32)
            }
            .padding()
            .navigationTitle("${config.name}")
        }
    }
}

#Preview {
    ContentView()
}
`;
    files[config.name+'/ContentView.swift'] = contentView;
    if (config.template !== 'swift-package') Object.assign(files,nativeProjectFiles(config.name,config.bundleId,deploymentTarget));
    await createScaffold(projectDir,files,file=>accessFor(event.sender).assertGranted(file));

    accessFor(event.sender).grant(projectDir);
    // 6. Optional Git Init
    if (config.gitInit) {
      try {
        const result = await execGit(projectDir, ['init', '-b', 'main']);
        if (result.code !== 0) return {success:true, warning:'Progetto creato; inizializzazione Git fallita: '+result.stderr};
      } catch (e) {
        // git not critical
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Recent Projects Persistence
handleIpc('load-recent-projects', async (event) => {
  try {
    const file = getRecentsFilePath();
    const projects = await readJson(file);
    for (const project of Array.isArray(projects) ? projects : []) {
      try { accessFor(event.sender).grant(project.path); } catch {}
    }
    return projects;
  } catch (e) {
    console.error('Error loading recent projects:', e);
  }
  return null;
});

handleIpc('save-recent-projects', async (event, projects: any[]) => {
  try {
    const file = getRecentsFilePath();
    for (const project of projects) accessFor(event.sender).assertGranted(project.path);
    await writeJsonAtomic(file, projects);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Hot Exit / Session State Persistence
handleIpc('save-session-state', async (event, sessionData: any) => {
  try {
    const file = getSessionFilePath(event.sender.id);
    if (sessionData?.project?.projectPath) accessFor(event.sender).assertGranted(sessionData.project.projectPath);
    if (!sessionData || !Array.isArray(sessionData.tabs) || sessionData.tabs.length > 200 || Buffer.byteLength(JSON.stringify(sessionData)) > 32 * 1024 * 1024) throw new Error('Sessione troppo grande: salva o chiudi alcuni documenti (limite 32 MB/200 tab)');
    await writeJsonAtomic(file, {...sessionData, schemaVersion:1, authorizedFiles:accessFor(event.sender).grantedFiles()}, true);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

handleIpc('load-session-state', async (event) => {
  try {
    const file = getSessionFilePath(event.sender.id);
    const recovered = await readJsonRecover(file);
    const session = recovered.value;
    if (session?.schemaVersion && session.schemaVersion !== 1) throw new Error('Versione sessione non supportata');
    if (recovered.recovered) session.recoveryWarning = 'Sessione ripristinata dal backup: il file principale non era leggibile';
    if (session?.project?.projectPath) accessFor(event.sender).grant(session.project.projectPath);
    for(const file of session?.authorizedFiles||[]) {try{accessFor(event.sender).grantFile(file);}catch{}}
    return session;
  } catch (err: any) {
    throw new Error('Ripristino sessione fallito: '+err.message);
  }
  return null;
});

handleIpc('clear-session-state', async (event) => {
  try {
    const file = getSessionFilePath(event.sender.id);
    await removeJson(file);
    await removeJson(file+'.bak');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// File I/O
handleIpc('save-file', async (event, { filePath, content, expectedRevision }: { filePath: string; content: string; expectedRevision?: string }) => {
  try {
    const access = accessFor(event.sender);
    const file = access.assert(filePath);
    return await saveSnapshot(file, content, expectedRevision, () => { access.assert(file); });
  } catch (error: any) { return { success: false, error: error.message }; }
});
handleIpc('read-file-snapshot', async (event, filePath: string) => {
  return readSnapshot(accessFor(event.sender).assert(filePath));
});
handleIpc('read-file', async (event, filePath: string) => {
  try { return await readTextFile(accessFor(event.sender).assert(filePath)); }
  catch { return null; }
});

// REAL FILE SYSTEM OPERATIONS (C)
handleIpc('create-file', async (event, { filePath, content }: { filePath: string; content?: string }) => {
  try {
    filePath = accessFor(event.sender).assert(filePath);
    if(content!==undefined&&(typeof content!=='string'||Buffer.byteLength(content)>MAX_TEXT_BYTES))throw new Error('Contenuto non valido o superiore a 2 MB');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content || '', { encoding: 'utf8', flag: 'wx' });
    return { success: true, filePath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

handleIpc('create-directory', async (event, dirPath: string) => {
  try {
    dirPath = accessFor(event.sender).assert(dirPath);
    fs.mkdirSync(dirPath, { recursive: true });
    return { success: true, dirPath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

handleIpc('rename-path', async (event, { oldPath, newPath }: { oldPath: string; newPath: string }) => {
  try {
    oldPath = accessFor(event.sender).assert(oldPath);
    newPath = accessFor(event.sender).assert(newPath);
    if (!fs.existsSync(oldPath)) {
      return { success: false, error: 'Path does not exist' };
    }
    if (fs.existsSync(newPath)) throw new Error('Esiste già un elemento con questo nome');
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    const access=accessFor(event.sender);
    await withProjectFileChange(access.activePath!,oldPath,newPath,file=>access.assert(file),async()=>{access.assert(oldPath);access.assert(newPath);await fs.promises.rename(oldPath,newPath);});
    return { success: true, oldPath, newPath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

handleIpc('delete-path', async (event, targetPath: string) => {
  try {
    targetPath = accessFor(event.sender).assert(targetPath);
    if (!fs.existsSync(targetPath)) {
      return { success: true };
    }
    const access=accessFor(event.sender);
    await withProjectFileChange(access.activePath!,targetPath,null,file=>access.assert(file),async()=>{access.assert(targetPath);await shell.trashItem(targetPath);});
    return { success: true, targetPath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// REAL GIT OPERATIONS (D)
function parseGitDiff(diffText: string, isStaged: boolean = false): any[] {
  const result: any[] = [];
  const files = diffText.split(/^diff --git /m).filter(Boolean);

  for (const block of files) {
    const lines = block.split('\n');
    const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/);
    const filename = headerMatch ? headerMatch[2] : 'unknown';

    let isAdded = false;
    let isDeleted = false;
    const diffLines: any[] = [];
    let oldLine = 0;
    let newLine = 0;

    for (const l of lines.slice(1)) {
      if (l.startsWith('new file mode')) isAdded = true;
      if (l.startsWith('deleted file mode')) isDeleted = true;
      if (l.startsWith('@@')) {
        const chunkMatch = l.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (chunkMatch) {
          oldLine = parseInt(chunkMatch[1], 10);
          newLine = parseInt(chunkMatch[2], 10);
        }
        continue;
      }
      if (l.startsWith('+') && !l.startsWith('+++')) {
        diffLines.push({
          type: 'added',
          text: l.substring(1),
          newLineNumber: newLine++
        });
      } else if (l.startsWith('-') && !l.startsWith('---')) {
        diffLines.push({
          type: 'removed',
          text: l.substring(1),
          oldLineNumber: oldLine++
        });
      } else if (l.startsWith(' ')) {
        diffLines.push({
          type: 'context',
          text: l.substring(1),
          oldLineNumber: oldLine++,
          newLineNumber: newLine++
        });
      }
    }

    result.push({
      filename,
      isStaged,
      status: isAdded ? 'added' : isDeleted ? 'deleted' : 'modified',
      diffLines
    });
  }

  return result;
}

handleIpc('git-get-status', async (_event, repoPath: string) => {
  try {
    if (!repoPath || !fs.existsSync(repoPath)) {
      return { isGit: false, branch: 'main', stagedFiles: [], unstagedFiles: [], diffs: [], commits: [] };
    }

    const checkGit = await execGit(repoPath, ['rev-parse', '--is-inside-work-tree']);
    if (checkGit.code !== 0 || !checkGit.stdout.includes('true')) {
      return { isGit: false, branch: 'main', stagedFiles: [], unstagedFiles: [], diffs: [], commits: [] };
    }

    repoPath = await gitRoot(repoPath);
    // 1. Current Branch
    let branch = 'main';
    const [branchRes, statusRes, stagedDiffRes, unstagedDiffRes, logRes] = await Promise.all([
      execGit(repoPath, ['branch', '--show-current']),
      execGit(repoPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
      execGit(repoPath, ['-c', 'core.quotePath=false', 'diff', '--no-ext-diff', '--no-color', '--cached']),
      execGit(repoPath, ['-c', 'core.quotePath=false', 'diff', '--no-ext-diff', '--no-color']),
      execGit(repoPath, ['log', '-n', '30', '--format=%H%x09%an%x09%cr%x09%s'])
    ]);
    if (branchRes.code === 0 && branchRes.stdout.trim()) {
      branch = branchRes.stdout.trim();
    } else {
      const headRes = await execGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (headRes.code === 0 && headRes.stdout.trim()) {
        branch = headRes.stdout.trim();
      }
    }

    // 2. Status Porcelain v1
    if (statusRes.code !== 0) throw new Error(statusRes.stderr);
    const { stagedFiles, unstagedFiles, untrackedFiles } = parseGitStatus(statusRes.stdout);

    // 3. Diffs: Staged + Unstaged + Untracked
    const diffs: any[] = [];

    // Staged diffs (git diff --cached)
    if (stagedDiffRes.code === 0 && stagedDiffRes.stdout.trim()) {
      diffs.push(...parseGitDiff(stagedDiffRes.stdout, true));
    }

    // Unstaged diffs (git diff)
    if (unstagedDiffRes.code === 0 && unstagedDiffRes.stdout.trim()) {
      diffs.push(...parseGitDiff(unstagedDiffRes.stdout, false));
    }

    // Untracked files preview
    for (const utf of untrackedFiles.slice(0, 100)) {
      const fullPath = path.join(repoPath, utf);
      if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile() && fs.statSync(fullPath).size <= MAX_TEXT_BYTES) {
        try {
          const content = await readTextFile(fullPath);
          const lines = content.slice(0, 65536).split('\n').slice(0, 100);
          diffs.push({
            filename: utf,
            isStaged: false,
            status: 'untracked',
            diffLines: lines.map((text, i) => ({
              type: 'added',
              text,
              newLineNumber: i + 1
            }))
          });
        } catch (e) {}
      }
    }

    // 4. Commits Log
    const commits: any[] = [];
    if (logRes.code === 0 && logRes.stdout.trim()) {
      const entries = logRes.stdout.split('\n').filter(Boolean);
      for (const entry of entries) {
        const parts = entry.replace('\r', '').split('\t');
        if (parts.length >= 4) {
          const [hash, author, date, ...rest] = parts;
          commits.push({
            hash,
            author: author || 'Developer',
            date: date || 'Di recente',
            message: rest.join('\t') || 'Aggiornamento codice'
          });
        }
      }
    }

    return {
      isGit: true,
      repoRoot: repoPath,
      branch,
      stagedFiles,
      unstagedFiles,
      diffs,
      commits
    };
  } catch (err: any) {
    throw new Error(err.message || 'Lettura dello stato Git fallita');
  }
});

// Stage single file (git add -- <file>)
handleIpc('git-stage-file', async (_event, { repoPath, filename }: { repoPath: string; filename: string }) => {
  try {
    const res = await execRepositoryGit(repoPath, ['add', '--', filename]);
    return { success: res.code === 0, error: res.stderr };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Unstage single file (git restore --staged <file> / git reset HEAD <file>)
handleIpc('git-unstage-file', async (_event, { repoPath, filename }: { repoPath: string; filename: string }) => {
  try {
    let res = await execRepositoryGit(repoPath, ['restore', '--staged', '--', filename]);
    if (res.code !== 0) {
      res = await execRepositoryGit(repoPath, ['reset', 'HEAD', '--', filename]);
    }
    return { success: res.code === 0, error: res.stderr };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Stage All (git add -A)
handleIpc('git-stage-all', async (_event, repoPath: string) => {
  try {
    const res = await execRepositoryGit(repoPath, ['add', '-A']);
    return { success: res.code === 0, error: res.stderr };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Unstage All (git restore --staged .)
handleIpc('git-unstage-all', async (_event, repoPath: string) => {
  try {
    let res = await execRepositoryGit(repoPath, ['restore', '--staged', '.']);
    if (res.code !== 0) {
      res = await execRepositoryGit(repoPath, ['reset', 'HEAD']);
    }
    return { success: res.code === 0, error: res.stderr };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Discard single file changes (git restore <file> or delete untracked)
handleIpc('git-discard-file', async (event, { repoPath, filename, isUntracked }: { repoPath: string; filename: string; isUntracked?: boolean }) => {
  try {
    repoPath = await gitRoot(repoPath);
    const fullPath = containedPath(repoPath, filename);
    accessFor(event.sender).assert(fullPath);
    const canonicalRoot = fs.realpathSync(repoPath);
    containedPath(canonicalRoot, fs.realpathSync(path.dirname(fullPath)) + path.sep + path.basename(fullPath));
    const relPath = path.isAbsolute(filename) ? path.relative(repoPath, filename) : filename;

    if (isUntracked) {
      const tracked = await execGit(repoPath, ['ls-files', '--error-unmatch', '--', relPath]);
      if (tracked.code === 0) throw new Error('Il file è tracciato: aggiornare lo stato Git prima del ripristino');
      if (fs.existsSync(fullPath)) {
        if (fs.lstatSync(fullPath).isDirectory()) throw new Error('La rimozione Git di cartelle o repository annidati non è consentita');
        fs.unlinkSync(fullPath);
      }
      return { success: true };
    } else {
      let res = await execRepositoryGit(repoPath, ['restore', '--', relPath]);
      if (res.code !== 0) {
        res = await execRepositoryGit(repoPath, ['checkout', '--', relPath]);
      }
      return { success: res.code === 0, error: res.stderr };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Discard all unstaged changes (git restore . + git clean -fd)
handleIpc('git-discard-all', async (event, repoPath: string) => {
  try {
    repoPath = await gitRoot(repoPath);
    const untracked = await execGit(repoPath, ['ls-files', '--others', '--exclude-standard', '-z']);
    if (untracked.code !== 0) throw new Error(untracked.stderr);
    const files = untracked.stdout.split('\0').filter(Boolean).map(file => {
      const target = accessFor(event.sender).assert(containedPath(repoPath, file));
      if (fs.lstatSync(target).isDirectory()) throw new Error('Repository annidato non rimosso: gestirlo separatamente');
      return target;
    });
    const restored = await execRepositoryGit(repoPath, ['restore', '--', '.']);
    if (restored.code !== 0) return { success: false, error: restored.stderr };
    // Remove files only: git clean -fd can remove an entire untracked active project.
    for (const file of files) { accessFor(event.sender).assert(file); fs.unlinkSync(file); }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

handleIpc('git-commit', async (_event, { repoPath, message }: { repoPath: string; message: string }) => {
  try {
    const res = await execRepositoryGit(repoPath, ['commit', '-m', message]);
    return { success: res.code === 0, output: res.stdout || res.stderr };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

handleIpc('git-push', async (event, repoPath: string) => {
  return gitOperations.run(event.sender.id, 'push', signal => execRepositoryGit(repoPath, ['push'], { signal }));
});

handleIpc('git-fetch', async (event, repoPath: string) => {
  return gitOperations.run(event.sender.id, 'fetch', signal => execRepositoryGit(repoPath, ['fetch'], { signal }));
});

// Clone Remote Git Repository
handleIpc('git-clone', async (event, { repoUrl, targetDir }: { repoUrl: string; targetDir: string }) => {
  try {
    targetDir = accessFor(event.sender).assertGranted(targetDir);
    const result = await gitOperations.run(event.sender.id, 'clone', signal => {
      fs.mkdirSync(targetDir, { recursive: true });
      return execGit(targetDir, ['clone', '--', repoUrl, '.'], { signal });
    });
    if (result.success) accessFor(event.sender).grant(targetDir);
    return result;
  } catch (err: any) {
    return { success: false, code: -1, output: '', error: err.message, cancelled: false };
  }
});

handleIpc('cancel-git-operation', (event, operation: GitOperation) => {
  if (!['push', 'fetch', 'clone', 'manage'].includes(operation)) throw new Error('Operazione Git non valida');
  return gitOperations.cancel(event.sender.id, operation);
});

// Get File Content at Git HEAD for Side-by-Side Diff
handleIpc('git-get-file-at-head', async (_event, { repoPath, filename }: { repoPath: string; filename: string }) => {
  try {
    repoPath = await gitRoot(repoPath);
    const relPath = path.relative(repoPath, containedPath(repoPath, filename));
    const gitPath = relPath.replace(/\\/g, '/');
    const res = await execRepositoryGit(repoPath, ['show', `HEAD:${gitPath}`]);
    if (res.code === 0) {
      return { success: true, content: res.stdout };
    }
    return { success: false, content: '', error: res.stderr };
  } catch (err: any) {
    return { success: false, content: '', error: err.message };
  }
});

// Real Interactive Terminal Command Runner
handleIpc('run-terminal-command', async (event, { cwd, command, terminalId = 'term-1' }: { cwd: string; command: string; terminalId?: string }) => {
  const directory = accessFor(event.sender).assert(cwd, true);
  return terminals.run(event.sender.id, terminalId, directory, command);
});
handleIpc('close-terminal', (event, terminalId: string) => terminals.close(event.sender.id, terminalId));

// REAL SOURCEKIT-LSP INTEGRATION (G)
function findSourceKitLsp(): string | null {
  const swiftRoot = path.join(process.env.OPENFRUIT_HOME || path.join(process.env.LOCALAPPDATA || '', 'OPENFRUIT'), 'toolchains', 'swift');
  const installed = fs.existsSync(swiftRoot) ? fs.readdirSync(swiftRoot).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : [];
  const candidates = [
    process.env.OPENFRUIT_SOURCEKIT_LSP || '',
    ...installed.map(version => path.join(swiftRoot, version, 'usr', 'bin', 'sourcekit-lsp.exe')),
    path.join(process.env.LOCALAPPDATA || '', 'OPENFRUIT', 'toolchains', 'swift', '6.4.1', 'usr', 'bin', 'sourcekit-lsp.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Swift', 'Toolchains', '6.3.3+Asserts', 'usr', 'bin', 'sourcekit-lsp.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'OPENFRUIT', 'toolchains', 'swift', '6.3.3', 'usr', 'bin', 'sourcekit-lsp.exe')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const lspManagers = new Map<number, LspManager>();
function lspFor(sender: Electron.WebContents) {
  let manager = lspManagers.get(sender.id);
  if (!manager) {
    manager = new LspManager(findSourceKitLsp, params => {
      if (!sender.isDestroyed()) sender.send('lsp-publish-diagnostics', params);
    });
    lspManagers.set(sender.id, manager);
    sender.once('destroyed', () => { manager!.stop(); lspManagers.delete(sender.id); });
  }
  return manager;
}
handleIpc('lsp-init', async (event, rootPath: string) => ({ success: await lspFor(event.sender).start(accessFor(event.sender).assert(rootPath, true)) }));
handleIpc('lsp-open-document', async (event, { uri, text }) => {
  validateLspDocument(event.sender, uri);
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_TEXT_BYTES) throw new Error('Documento LSP non valido');
  await lspFor(event.sender).openDocument(uri, text);
});
handleIpc('lsp-change-document', async (event, { uri, text }) => {
  validateLspDocument(event.sender, uri);
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_TEXT_BYTES) throw new Error('Documento LSP non valido');
  await lspFor(event.sender).changeDocument(uri, text);
});
handleIpc('lsp-close-document', async (event, uri: string) => {
  validateLspDocument(event.sender, uri);
  await lspFor(event.sender).closeDocument(uri);
});
handleIpc('lsp-stop', event => { lspManagers.get(event.sender.id)?.stop(); });
function validateLspDocument(sender: Electron.WebContents, uri: string) {
  if (typeof uri !== 'string' || new URL(uri).protocol !== 'file:') throw new Error('URI LSP non valido');
  accessFor(sender).assert(fileURLToPath(uri));
}
for (const [channel, method] of [['lsp-completion', 'textDocument/completion'], ['lsp-hover', 'textDocument/hover']]) {
  handleIpc(channel, async (event, { uri, line, character }) => {
    validateLspDocument(event.sender, uri);
    if (![line, character].every(n => Number.isInteger(n) && n >= 0 && n <= 10000000)) throw new Error('Posizione LSP non valida');
    const response = await lspFor(event.sender).request(method, { textDocument: { uri }, position: { line, character } });
    return response?.result || null;
  });
}

handleIpc('pty-open', (event, { id, cwd, profile }) => ptys.open(event.sender.id, id, accessFor(event.sender).assert(cwd, true), data => { if (!event.sender.isDestroyed()) event.sender.send('pty-output', data); }, profile));
handleIpc('pty-write', (event, { id, token, data }) => ptys.write(event.sender.id, id, token, data));
handleIpc('pty-resize', (event, { id, token, cols, rows }) => ptys.resize(event.sender.id, id, token, cols, rows));
handleIpc('pty-ack', (event, { id, token, count }) => ptys.ack(event.sender.id, id, token, count));
handleIpc('pty-close', (event, { id, token }) => ptys.close(event.sender.id, id, token));

handleIpc('merge-file', async (event, { filePath, base, revision, local }) => {
  const file = accessFor(event.sender).assert(filePath);
  return mergeContents(base, revision, local, await readSnapshot(file));
});

handleIpc('read-project-settings', (event, root: string) => {
  const access = accessFor(event.sender); access.assert(root, true);
  return readProjectSettings(root, file => access.assert(file));
});
handleIpc('save-project-settings', (event, { root, settings, revision }) => {
  const access = accessFor(event.sender); access.assert(root, true);
  return saveProjectSettings(root, settings, revision, file => access.assert(file));
});

handleIpc('read-xcode-project', (event, project: string) => readXcodeProject(project, file => accessFor(event.sender).assert(file)));
handleIpc('save-xcode-project', (event, { project, revision, edits }) => saveXcodeProject(project, revision, edits, file => accessFor(event.sender).assert(file)));

handleIpc('reveal-path', (event, file: string) => { shell.showItemInFolder(accessFor(event.sender).assert(file, true)); });
async function loadPreferences() {
  return validatePreferences(await readJson(path.join(app.getPath('userData'), 'preferences.json')) || defaultPreferences);
}

async function dialogTranslator() {
  const { language } = await loadPreferences().catch(() => defaultPreferences);
  return (message: Message) => translate(language, message);
}

handleIpc('load-preferences', loadPreferences);

let updateCheck: ReturnType<typeof checkForStudioUpdate> | undefined;
const getStudioUpdate = () => {
  if (!app.isPackaged) return Promise.resolve(null);
  return updateCheck ??= checkForStudioUpdate(app.getVersion(), (url, options) => net.fetch(url, options));
};

handleIpc('check-studio-update', getStudioUpdate);
handleIpc('open-studio-update', async () => {
  const update = await getStudioUpdate();
  if (update) await shell.openExternal(update.releaseUrl);
});
handleIpc('save-preferences', async (_event, input: unknown) => {
  const value = validatePreferences(input);
  await writeJsonAtomic(path.join(app.getPath('userData'), 'preferences.json'), value);
  for (const window of windows) if (!window.isDestroyed()) window.webContents.send('preferences-changed', value);
  return value;
});

handleIpc('environment-snapshot', () => environmentSnapshot());
handleIpc('environment-action', async (event, { action, value }) => {
  if (engineRuns.has(event.sender.id)) throw new Error('Attendi o interrompi l’operazione OpenFruit in corso');
  const controller = new AbortController(), id = `environment-${Date.now()}`;
  const args = environmentArguments(action, value);
  engineRuns.set(event.sender.id, { id, controller });
  const stop = () => controller.abort(); event.sender.once('destroyed', stop);
  try { return await runOpenFruit(args, { signal: controller.signal, onOutput: output => { if (!event.sender.isDestroyed()) event.sender.send('openfruit-output', { ...output, requestId: id }); } }); }
  finally { engineRuns.delete(event.sender.id); event.sender.removeListener('destroyed', stop); }
});
handleIpc('git-save-identity', async (_event, { name, email }) => {
  if (typeof name !== 'string' || !name.trim() || name.length > 200 || /[\r\n\0]/.test(name) || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254) throw new Error('Identità Git non valida');
  for (const [key, value] of [['user.name', name.trim()], ['user.email', email.trim()]]) {
    const result = await execGit(app.getPath('home'), ['config', '--global', key, value]);
    if (result.code !== 0) throw new Error(result.stderr);
  }
});
handleIpc('open-help', async (_event, topic: string) => {
  const files: Record<string, string> = { docs: 'README.md', news: 'docs/IMPLEMENTATION_PROGRESS_2026-10-30.md' };
  if (!Object.hasOwn(files, topic)) throw new Error('Documento non valido');
  const error = await shell.openPath(path.join(app.getAppPath(), files[topic])); if (error) throw new Error(error);
});

handleIpc('workspace-search', (event, request) => {
  const root = accessFor(event.sender).assert(request.root, true);
  return workspaceSearch.search(event.sender.id, { ...request, root });
});
handleIpc('cancel-workspace-search', event => workspaceSearch.cancel(event.sender.id));
handleIpc('replace-workspace-matches', (event, { files, replacement }) => replaceSearchResults(files, replacement, file => accessFor(event.sender).assert(file)));

handleIpc('mutate-xcode-project', (event, {project, revision, operation}) => mutateXcodeProject(project,revision,operation,file=>accessFor(event.sender).assert(file)));

handleIpc('resolve-xcode-settings', async(event,{project,ownerId,configurationId})=>{
  if(typeof project!=='string'||!project.toLowerCase().endsWith('.xcodeproj'))throw new Error('Progetto non valido');
  const access=accessFor(event.sender),source=await readTextFile(access.assert(path.join(project,'project.pbxproj')));
  return resolveXcodeSettings(source,project,ownerId,configurationId,file=>access.assert(file));
});

handleIpc('git-repository-info',(_event,repoPath:string)=>repositoryInfo(repoPath));
handleIpc('git-repository-history',(_event,{repoPath,skip})=>repositoryHistory(repoPath,skip));
handleIpc('git-repository-commit',(_event,{repoPath,hash})=>repositoryCommit(repoPath,hash));
handleIpc('git-repository-action', async(event,{repoPath,action})=>gitOperations.run(event.sender.id,'manage',async signal=>{
 const root=await gitRoot(repoPath,{signal}),args=await repositoryArgs(root,action);return execGit(root,args,{signal});
}));

const semanticMethods = new Set(['textDocument/definition','textDocument/references','textDocument/documentSymbol','textDocument/signatureHelp','textDocument/foldingRange','textDocument/formatting','textDocument/rename']);
handleIpc('lsp-semantic',async(event,{method,uri,line,character,newName,options})=>{
 if(!semanticMethods.has(method))throw new Error('Metodo LSP non supportato');validateLspDocument(event.sender,uri);
 const params:any={textDocument:{uri}};
 if(['textDocument/definition','textDocument/references','textDocument/signatureHelp','textDocument/rename'].includes(method)){
  if(![line,character].every(n=>Number.isInteger(n)&&n>=0&&n<=10000000))throw new Error('Posizione LSP non valida');params.position={line,character};
 }
 if(method==='textDocument/references')params.context={includeDeclaration:true};
 if(method==='textDocument/rename'){if(typeof newName!=='string'||!newName||newName.length>256||/[\x00-\x20]/.test(newName))throw new Error('Nome simbolo non valido');params.newName=newName;}
 if(method==='textDocument/formatting'){if(!options||!Number.isInteger(options.tabSize)||options.tabSize<1||options.tabSize>8||typeof options.insertSpaces!=='boolean')throw new Error('Opzioni formato non valide');params.options={tabSize:options.tabSize,insertSpaces:options.insertSpaces};}
 const response=await lspFor(event.sender).request(method,params);if(response?.error)throw new Error(response.error.message||'Richiesta LSP non supportata');
 const result=response?.result||null;
 // Never let a language server open files or issue edits outside this window's grants.
 const visit=(node:any,depth=0)=>{if(!node||typeof node!=='object')return;if(depth>100)throw new Error('Risposta LSP troppo profonda');if(typeof node.uri==='string')validateLspDocument(event.sender,node.uri);if(typeof node.targetUri==='string')validateLspDocument(event.sender,node.targetUri);if(node.changes)for(const key of Object.keys(node.changes))validateLspDocument(event.sender,key);for(const value of Object.values(node))if(typeof value==='object')visit(value,depth+1);};visit(result);return result;
});

handleIpc('save-file-as',async(event,{name,content,blockedPaths,originalPath,expectedRevision})=>{
 if(!Array.isArray(blockedPaths)||blockedPaths.length>200||blockedPaths.some(p=>typeof p!=='string'))throw new Error('Elenco documenti non valido');
 if(typeof name!=='string'||name.length>256||typeof content!=='string'||Buffer.byteLength(content)>MAX_TEXT_BYTES)throw new Error('Documento non valido');
 const access=accessFor(event.sender),parent=BrowserWindow.fromWebContents(event.sender)!;
 const choice=await dialog.showSaveDialog(parent,{title:(await dialogTranslator())('Salva con nome'),defaultPath:path.join(access.activePath||app.getPath('documents'),path.basename(name)),properties:['showOverwriteConfirmation']});
 if(choice.canceled||!choice.filePath)return null;const file=access.grantFile(choice.filePath);
 if(blockedPaths.some((p:string)=>path.resolve(p).toLowerCase()===file.toLowerCase()))throw new Error('Il file scelto è aperto con modifiche non salvate. Salvalo o chiudilo prima di sovrascriverlo.');
 let current;try{current=await readSnapshot(access.assert(file));}catch(error:any){if(error.code!=='ENOENT')throw error;}
 if(current){if(originalPath&&path.resolve(originalPath).toLowerCase()===file.toLowerCase()&&expectedRevision!==current.revision)throw new Error('File modificato sul disco: confronta le versioni prima di salvarlo');const result=await saveSnapshot(file,content,current.revision,()=>{access.assert(file);});if(!result.success)throw new Error(result.error);}
 else{const handle=await fs.promises.open(access.assert(file),'wx');try{await handle.writeFile(content,'utf8');await handle.sync();}catch(error){await handle.close();await fs.promises.unlink(file);throw error;}finally{await handle.close();}}
 return {path:file,...await readSnapshot(access.assert(file))};
});

handleIpc('project-metadata',(event,root:string)=>{const access=accessFor(event.sender);access.assert(root,true);return projectMetadata(root,file=>access.assert(file));});

handleIpc('device-action',async(event,request:DeviceRequest)=>{
 deviceArguments(request,['screenshot','record','install'].includes(request?.action)?'pending':undefined);
 if(engineRuns.has(event.sender.id))throw new Error('OpenFruit sta già eseguendo un’operazione');
 const parent=BrowserWindow.fromWebContents(event.sender)!,access=accessFor(event.sender);let file:string|undefined;
 if(request.action==='install'){const t=await dialogTranslator();const result=await dialog.showOpenDialog(parent,{title:t('Installa IPA sul dispositivo'),properties:['openFile'],filters:[{name:t('Applicazione iOS'),extensions:['ipa']}]});if(result.canceled)return {cancelled:true,success:false};file=access.grantFile(result.filePaths[0]);}
 if(request.action==='screenshot'){const result=await dialog.showSaveDialog(parent,{title:(await dialogTranslator())('Salva screenshot dispositivo'),defaultPath:'device-'+Date.now()+'.png',filters:[{name:'PNG',extensions:['png']}],properties:['showOverwriteConfirmation']});if(result.canceled||!result.filePath)return {cancelled:true,success:false};file=access.grantFile(result.filePath);}
 if(request.action==='record'){const result=await dialog.showOpenDialog(parent,{title:(await dialogTranslator())('Cartella per i fotogrammi registrati'),properties:['openDirectory','createDirectory']});if(result.canceled)return {cancelled:true,success:false};access.grant(result.filePaths[0]);file=access.assertGranted(path.join(result.filePaths[0],'recording-'+Date.now()));await fs.promises.mkdir(file);access.grantFile(file);}
 if(engineRuns.has(event.sender.id))throw new Error('OpenFruit sta già eseguendo un’operazione');
 const controller=new AbortController(),id='environment-device-'+Date.now(),stop=()=>controller.abort();engineRuns.set(event.sender.id,{id,controller});event.sender.once('destroyed',stop);
 try {const result=await runOpenFruit(deviceArguments(request,file),{signal:controller.signal,onOutput:output=>{if(!event.sender.isDestroyed())event.sender.send('openfruit-output',{...output,requestId:id});}});return {...result,file};}
 finally {engineRuns.delete(event.sender.id);event.sender.removeListener('destroyed',stop);}
});

handleIpc('list-operation-reports',(event,root:string)=>{accessFor(event.sender).assert(root,true);return new OperationReports(path.join(app.getPath('userData'),'operation-reports')).list(root);});
handleIpc('read-operation-report',async(event,id:string)=>{const report=await new OperationReports(path.join(app.getPath('userData'),'operation-reports')).read(id);accessFor(event.sender).assert(report.root,true);return report;});
handleIpc('export-operation-report',async(event,id:string)=>{const report=await new OperationReports(path.join(app.getPath('userData'),'operation-reports')).read(id);accessFor(event.sender).assert(report.root,true);const choice=await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!,{title:(await dialogTranslator())('Esporta report'),defaultPath:'openfruit-'+id+'.json',filters:[{name:'JSON',extensions:['json']}],properties:['showOverwriteConfirmation']});if(choice.canceled||!choice.filePath)return;await writeJsonAtomic(choice.filePath,report);return choice.filePath;});

handleIpc('git-file-hunks',(event,{repoPath,filename,staged})=>{const access=accessFor(event.sender);access.assert(containedPath(repoPath,filename));return fileHunks(repoPath,filename,staged);});
handleIpc('git-apply-hunks',async(event,{repoPath,filename,staged,revision,indices,discard})=>{const root=await gitRoot(repoPath);accessFor(event.sender).assert(containedPath(root,filename));return applyFileHunks(root,filename,staged,revision,indices,discard);});
handleIpc('git-file-comparison',async(event,{repoPath,filename,staged})=>{
 const root=await gitRoot(repoPath),file=accessFor(event.sender).assert(containedPath(root,filename)),relative=path.relative(root,file).replace(/\\/g,'/');
 if(typeof staged!=='boolean')throw new Error('Diff non valido');
 const read=async(revision:string)=>{const result=await execGit(root,['show',revision+relative]);if(result.code===0)return result.stdout;const present=await execGit(root,['ls-tree','--name-only','HEAD','--',relative]);if(!present.stdout.trim()&&revision==='HEAD:')return '';throw new Error(result.stderr);};
 const original=await read(staged?'HEAD:':':');let modified:string;
 if(staged){try{modified=await read(':');}catch{const status=await execGit(root,['diff','--cached','--name-only','--diff-filter=D','--',relative]);if(status.stdout.trim())modified='';else throw new Error('Contenuto indice non leggibile');}}
 else{try{modified=await readTextFile(file);}catch(error:any){if(error.code==='ENOENT')modified='';else throw error;}}
 return {original,modified};
});

handleIpc('take-launch-project',event=>{if(!pendingNativeProject)return null;const entry=pendingNativeProject;pendingNativeProject=undefined;return nativeProject(event.sender,entry);});
handleIpc('resolve-project-entrypoint',(event,value:string)=>{const access=accessFor(event.sender),entry=access.assertGranted(value);if(/\.(xcodeproj|xcworkspace)$/i.test(entry))return nativeProject(event.sender,entry);return {root:entry};});

handleIpc('read-document',(event,file:string)=>readDocument(accessFor(event.sender).assert(file)));
handleIpc('git-commit-files',(_event,{repoPath,hash,parentIndex})=>commitDetails(repoPath,hash,parentIndex));
handleIpc('git-commit-comparison',(_event,{repoPath,hash,parentIndex,filename})=>commitComparison(repoPath,hash,parentIndex,filename));
