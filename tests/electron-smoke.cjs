const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Keep the smoke test separate from the user's projects and saved IDE session.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'openfruit-ide-desktop-'));
const deniedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'openfruit-denied-'));
const deniedFile = path.join(deniedDirectory, 'private.txt');
fs.writeFileSync(deniedFile, 'private fixture');
app.setPath('userData', scratch);
process.env.OPENFRUIT_USER_STATE = path.join(scratch, 'engine-state');
const repositoryRoot = path.join(scratch, 'Repository');
const projectPath = path.join(repositoryRoot, 'Apps', 'Sample');
fs.mkdirSync(projectPath, { recursive: true });
fs.writeFileSync(path.join(projectPath, 'Source.swift'), 'let value = 1\nlet other = value\n');
fs.writeFileSync(path.join(projectPath, 'Empty.swift'), '');
fs.writeFileSync(path.join(projectPath, 'Package.swift'), '// swift-tools-version: 6.0\nimport PackageDescription\nlet package = Package(name: "Sample")\n');
fs.writeFileSync(path.join(repositoryRoot, 'Root.txt'), 'root\n');
fs.writeFileSync(path.join(repositoryRoot, '.gitignore'), '.build/\n');
execFileSync('git', ['init'], { cwd: repositoryRoot, windowsHide: true });
execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: repositoryRoot, windowsHide: true });
execFileSync('git', ['add', '-A'], { cwd: repositoryRoot, windowsHide: true });
execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Fixture'], { cwd: repositoryRoot, windowsHide: true });
fs.writeFileSync(path.join(scratch, 'session_state.json'), JSON.stringify({
  currentScreen: 'ide', project: { name: 'Sample', projectPath }, tabs: [], activeTabId: null
}));
fs.writeFileSync(path.join(scratch, 'recent_projects.json'), JSON.stringify([{ name: 'Test directories', path: scratch }]));
require('../dist-electron/main.cjs');

const timeout = setTimeout(() => { console.error('Desktop smoke timed out'); app.exit(1); }, 60000);
const rendererErrors = [];
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    // Rendering assertions must also run when the test window is behind the user's app.
    win.webContents.setBackgroundThrottling(false);
    win.webContents.on('console-message', ({ level, message }) => {
      if (level === 'error') {
        console.error('[renderer]', message);
        if (message.includes('Uncaught') || message.includes('TextModel got disposed')) rendererErrors.push(message);
      }
    });
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const api = window.openfruitApi;
      const received = [];
      const unsubscribe = api.onOpenFruitOutput(output => received.push(output));
      const capabilities = await api.getOpenFruitCapabilities();
      const devices = await api.getDevices();
      const command = await api.runOpenFruitCommand(['version', '--diagnostics=json'], undefined, 'desktop-smoke');
      unsubscribe();
      return { capabilities, devices, command, received, rendered: document.body.innerText.length > 0 };
    })()`);
    assert.equal(result.capabilities.schema_version, 2);
    assert.ok(Array.isArray(result.devices));
    assert.equal(result.command.success, true);
    assert.equal(result.rendered, true);
    assert.ok(result.received.some(output => output.requestId === 'desktop-smoke' && output.event?.kind === 'task.completed'));
    console.log('PASS: desktop renderer → preload → IPC → installed CLI → JSON events → renderer');

    const io = await win.webContents.executeJavaScript(`(async () => {
      const api = window.openfruitApi;
      const root = ${JSON.stringify(projectPath)};
      const file = root + '/Source.swift';
      const duplicate = await api.createFile(file, 'would overwrite');
      const content = await api.readFile(file);
      const unsafe = await api.gitDiscardFile(root, '../outside.txt', true);
      return { duplicate, content, unsafe };
    })()`);
    assert.equal(io.duplicate.success, false);
    assert.equal(io.content, 'let value = 1\nlet other = value\n');
    assert.equal(io.unsafe.success, false);
    const protectedFiles = await win.webContents.executeJavaScript(`(async () => {
      const api = window.openfruitApi;
      const denied = ${JSON.stringify(deniedFile)};
      return {
        read: await api.readFile(denied),
        create: await api.createFile(denied + '.new', 'untrusted'),
        remove: await api.deletePath(denied),
        open: await api.readProjectTree(${JSON.stringify(deniedDirectory)}),
        forge: await api.saveRecentProjects([{ path: ${JSON.stringify(deniedDirectory)} }])
      };
    })()`);
    assert.equal(protectedFiles.read, null);
    for (const operation of ['create', 'remove', 'open', 'forge']) assert.equal(protectedFiles[operation].success, false);
    assert.equal(fs.readFileSync(deniedFile, 'utf8'), 'private fixture');
    const file = path.join(projectPath, 'Source.swift');
    const baseline = await win.webContents.executeJavaScript(`window.openfruitApi.readFileSnapshot(${JSON.stringify(file)})`);
    fs.writeFileSync(file, 'external edit');
    const conflict = await win.webContents.executeJavaScript(`window.openfruitApi.saveFile(${JSON.stringify(file)}, 'would overwrite', ${JSON.stringify(baseline.revision)})`);
    assert.equal(conflict.conflict, true);
    assert.equal(fs.readFileSync(file, 'utf8'), 'external edit');
    fs.writeFileSync(file, baseline.content);
    const status = await win.webContents.executeJavaScript(`window.openfruitApi.gitGetStatus(${JSON.stringify(projectPath)})`);
    assert.equal(status.repoRoot.toLowerCase(), repositoryRoot.toLowerCase());
    const head = await win.webContents.executeJavaScript(`window.openfruitApi.gitGetFileAtHead(${JSON.stringify(projectPath)}, 'Apps/Sample/Source.swift')`);
    assert.equal(head.success, true);
    assert.equal(head.content, io.content);
    const absoluteHead = await win.webContents.executeJavaScript(`window.openfruitApi.gitGetFileAtHead(${JSON.stringify(projectPath)}, ${JSON.stringify(path.join(projectPath, 'Source.swift'))})`);
    assert.equal(absoluteHead.content, io.content);
    const rootHead = await win.webContents.executeJavaScript(`window.openfruitApi.gitGetFileAtHead(${JSON.stringify(projectPath)}, 'Root.txt')`);
    assert.equal(rootHead.content, 'root\n');
    const scaffold = await win.webContents.executeJavaScript(`window.openfruitApi.createProjectScaffold({
      name: 'Minimum', projectPath: ${JSON.stringify(path.join(scratch, 'Minimum'))}, bundleId: 'test.example.minimum',
      minIosVersion: 'iOS 16.0', language: 'Swift 6.0', interfaceType: 'SwiftUI', gitInit: false
    })`);
    assert.equal(scaffold.success, true, scaffold.error);
    assert.ok(fs.readFileSync(path.join(scratch, 'Minimum', 'Package.swift'), 'utf8').includes('.iOS("16.0")'));
    assert.ok(fs.readFileSync(path.join(scratch, 'Minimum', 'Minimum', 'Info.plist'), 'utf8').includes('<string>16.0</string>'));

    // Exercise the real lazy file-loading and offline Monaco path in the renderer.
    await win.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 15000;
      const source = ${JSON.stringify(path.join(projectPath, 'Source.swift'))};
      let clicked = false;
      while (Date.now() < deadline) {
        const row = [...document.querySelectorAll('[data-file-path]')].find(row => row.dataset.filePath === source);
        if (row && !clicked) { row.click(); clicked = true; }
        if (clicked && document.querySelector('.view-lines')?.textContent.includes('let')) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Lazy file opening / local Monaco failed: ' + JSON.stringify({ editorCount: document.querySelectorAll('.monaco-editor').length, lineCount: document.querySelectorAll('.view-lines').length, lines: [...document.querySelectorAll('.view-lines')].map(node => node.textContent), body: document.body.innerText.slice(0, 1500) }));
    })()`);
    console.log('PASS: existing file not overwritten, Git path escape rejected, lazy file opening and local Monaco');

    await win.webContents.executeJavaScript(`(async () => {
      const wait = async predicate => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          if (await predicate()) return;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error('Find / replace / save did not reach the expected state');
      };
      const setInput = (input, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Ctrl+H').click();
      await wait(() => document.querySelector('input[placeholder="Trova..."]'));
      setInput(document.querySelector('input[placeholder="Trova..."]'), 'value');
      await wait(() => document.body.textContent.includes('1 di 2'));
      document.querySelector('button[title="Successivo (Enter)"]').click();
      await wait(() => document.body.textContent.includes('2 di 2'));
      setInput(document.querySelector('input[placeholder="Sostituisci con..."]'), 'fruit');
      await new Promise(resolve => setTimeout(resolve, 50));
      [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Tutti').click();
      await wait(() => document.querySelector('.view-lines')?.textContent.includes('fruit'));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
      const file = ${JSON.stringify(path.join(projectPath, 'Source.swift'))};
      await wait(async () => (await window.openfruitApi.readFile(file)) === 'let fruit = 1\\nlet other = fruit\\n');
    })()`);
    console.log('PASS: search navigation, replace all and Ctrl+S persist actual editor contents');
    fs.writeFileSync(file, 'let externalValue = 2\n');
    await win.webContents.executeJavaScript(`(async () => {
      const setValue = (placeholder, value) => {
        const input = document.querySelector('input[placeholder="' + placeholder + '"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setValue('Trova...', 'fruit'); setValue('Sostituisci con...', 'banana');
      await new Promise(resolve => setTimeout(resolve, 100));
      [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Tutti').click();
      await new Promise(resolve => setTimeout(resolve, 100));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        if (document.body.textContent.includes('File modificato sul disco') && document.querySelector('.view-lines')?.textContent.includes('banana')) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Editor did not preserve edits and show the conflict: ' + JSON.stringify({ lines: document.querySelector('.view-lines')?.textContent, body: document.body.innerText.slice(-1600) }));
    })()`);
    assert.equal(fs.readFileSync(file, 'utf8'), 'let externalValue = 2\n');
    const copyPath = path.join(projectPath, 'Source.swift.editor-copy');
    await win.webContents.executeJavaScript(`(async () => {
      [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Salva copia').click();
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const content = await window.openfruitApi.readFile(${JSON.stringify(copyPath)});
        const copy = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Salva copia');
        if (content?.includes('banana') && copy && !copy.disabled) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Recovery copy was not saved');
    })()`);
    assert.equal(fs.readFileSync(file, 'utf8'), 'let externalValue = 2\n');
    fs.writeFileSync(copyPath, 'existing recovery copy');
    await win.webContents.executeJavaScript(`(async () => {
      [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Salva copia').click();
      const ready = Date.now() + 3000;
      while (Date.now() < ready) {
        const compare = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Confronta versioni');
        if (compare && !compare.disabled && document.body.textContent.includes('EEXIST')) { compare.click(); break; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const dialog = document.querySelector('[aria-label="Confronto del conflitto"]');
        if (dialog?.textContent.includes('externalValue') && dialog.textContent.includes('banana')) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Conflict comparison did not render both versions');
    })()`);
    assert.equal(fs.readFileSync(copyPath, 'utf8'), 'existing recovery copy');
    fs.writeFileSync(file, 'let externalValue = 3\n');
    await win.webContents.executeJavaScript(`(async () => {
      [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.trim() === 'Salva la versione a destra').click();
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const dialog = document.querySelector('[aria-label="Confronto del conflitto"]');
        if (dialog?.querySelector('.view-lines')?.textContent.includes('3')) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('A second external change was not shown for review');
    })()`);
    assert.equal(fs.readFileSync(file, 'utf8'), 'let externalValue = 3\n');
    const reconciled = 'let banana = 1\nlet externalValue = 3\nlet resolvedValue = banana + externalValue\n';
    win.focus(); win.webContents.focus();
    await win.webContents.executeJavaScript(`document.querySelector('[role="dialog"] .modified textarea.inputarea').focus(); true`);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
    await new Promise(resolve => setTimeout(resolve, 50));
    await win.webContents.insertText(reconciled);
    await win.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        if (document.querySelector('main .view-lines')?.textContent.includes('resolvedValue')) {
          [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.trim() === 'Salva la versione a destra').click();
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Manual reconciliation did not propagate to the editor');
    })()`);
    await win.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        if (!document.querySelector('[aria-label="Confronto del conflitto"]') && (await window.openfruitApi.readFile(${JSON.stringify(file)})) === ${JSON.stringify(reconciled)}) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Reconciled content was not persisted: ' + JSON.stringify({disk: await window.openfruitApi.readFile(${JSON.stringify(file)}), body: document.body.textContent.slice(-3000)}));
    })()`);
    console.log('PASS: exclusive recovery copy, second external conflict and editable manual reconciliation');
    fs.writeFileSync(file, 'let reloadedValue = 99\n');
    await win.webContents.executeJavaScript(`(async () => {
      const set = (placeholder, value) => {
        const input = document.querySelector('input[placeholder="' + placeholder + '"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('Trova...', 'banana'); set('Sostituisci con...', 'localBanana');
      await new Promise(resolve => setTimeout(resolve, 100));
      [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Tutti').click();
      await new Promise(resolve => setTimeout(resolve, 100));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
      const deadline = Date.now() + 4000;
      let clicked = false;
      while (Date.now() < deadline) {
        const reload = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Usa versione sul disco');
        if (reload && !clicked) { reload.click(); clicked = true; }
        if (clicked && !reload && document.querySelector('main .view-lines')?.textContent.includes('reloadedValue')) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Explicit reload did not use the disk version');
    })()`);
    assert.equal(fs.readFileSync(file, 'utf8'), 'let reloadedValue = 99\n');

    await require('./settings-scenario.cjs')(win, projectPath, fs, path, assert);
    console.log('PASS: app title and navigator open project settings; validation, persistence and dependency manifest editing');

    await require('./merge-scenario.cjs')(win, file, fs, assert);
    console.log('PASS: automatic merge preview, independent edits, overlapping markers and guarded save through Monaco');

    const ptyScenario = require('./pty-scenario.cjs');
    const ptyResult = await win.webContents.executeJavaScript(`(${ptyScenario.toString()})(${JSON.stringify(projectPath)})`);
    assert.equal(ptyResult.backpressure, true);
    console.log('PASS: native ConPTY Read-Host, arrow history, resize, Ctrl+C, backpressure and tab isolation');

    const terminal = await win.webContents.executeJavaScript(`(async () => {
      const api = window.openfruitApi, cwd = ${JSON.stringify(projectPath)};
      await api.runTerminalCommand(cwd, '$OpenFruitIpcValue = 73', 'ipc-terminal');
      const retained = await api.runTerminalCommand(cwd, '$OpenFruitIpcValue', 'ipc-terminal');
      const slow = api.runTerminalCommand(cwd, 'Start-Sleep -Seconds 20', 'ipc-terminal');
      await new Promise(resolve => setTimeout(resolve, 100));
      await api.closeTerminal('ipc-terminal');
      return { retained, cancelled: await slow };
    })()`);
    assert.match(terminal.retained.stdout, /73/);
    assert.equal(terminal.cancelled.cancelled, true);
    console.log('PASS: workspace file authorization, external-edit conflict and persistent/cancellable terminal through IPC');

    const untrackedProject = path.join(repositoryRoot, 'Apps', 'UntrackedProject');
    fs.mkdirSync(untrackedProject);
    fs.writeFileSync(path.join(untrackedProject, 'draft.txt'), 'discard this file');
    const discard = await win.webContents.executeJavaScript(`(async () => {
      const api = window.openfruitApi;
      const project = ${JSON.stringify(untrackedProject)};
      await api.readProjectTree(project);
      const ancestor = await api.deletePath(${JSON.stringify(path.dirname(untrackedProject))});
      const result = await api.gitDiscardAll(project);
      return { ancestor, result };
    })()`);
    assert.equal(discard.ancestor.success, false);
    assert.equal(discard.result.success, true, JSON.stringify(discard.result));
    assert.equal(fs.existsSync(untrackedProject), true);
    assert.equal(fs.existsSync(path.join(untrackedProject, 'draft.txt')), false);
    console.log('PASS: protected workspace ancestors and Git discard preserve the untracked project directory');

    await win.webContents.executeJavaScript('window.openfruitApi.openNewWindow()');
    const second = BrowserWindow.getAllWindows().find(window => window !== win);
    if (second.webContents.isLoading()) await new Promise(resolve => second.webContents.once('did-finish-load', resolve));
    const firstKey = await win.webContents.executeJavaScript('window.openfruitApi.sessionKey');
    const secondKey = await second.webContents.executeJavaScript('window.openfruitApi.sessionKey');
    assert.notEqual(firstKey, secondKey);
    assert.equal(await second.webContents.executeJavaScript(`window.openfruitApi.readFile(${JSON.stringify(path.join(projectPath, 'Source.swift'))})`), null);
    await second.webContents.executeJavaScript(`window.unsub = window.openfruitApi.onOpenFruitOutput(() => { window.leakedEvents = (window.leakedEvents || 0) + 1; }); true`);
    await win.webContents.executeJavaScript(`window.openfruitApi.runOpenFruitCommand(['version', '--diagnostics=json'], undefined, 'isolation')`);
    assert.equal(await second.webContents.executeJavaScript('window.leakedEvents || 0'), 0);
    await second.webContents.executeJavaScript('window.unsub(); true');
    console.log('PASS: separate window sessions and isolated CLI telemetry');
    const remote = path.join(scratch, 'remote.git');
    execFileSync('git', ['init', '--bare', remote], { windowsHide: true });
    const branch = execFileSync('git', ['branch', '--show-current'], { cwd: repositoryRoot, windowsHide: true, encoding: 'utf8' }).trim();
    execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: repositoryRoot, windowsHide: true });
    execFileSync('git', ['config', `branch.${branch}.remote`, 'origin'], { cwd: repositoryRoot, windowsHide: true });
    execFileSync('git', ['config', `branch.${branch}.merge`, `refs/heads/${branch}`], { cwd: repositoryRoot, windowsHide: true });
    const marker = path.join(repositoryRoot, 'push-waiting');
    const quotedMarker = "'" + marker.replace(/\\/g, '/').replace(/'/g, "'\\''") + "'";
    fs.writeFileSync(path.join(remote, 'hooks', 'pre-receive'), `#!/bin/sh\ntouch ${quotedMarker}\nsleep 20\n`, { mode: 0o755 });
    await win.webContents.executeJavaScript(`document.querySelector('button[title="Mostra Controllo Versione Git"]').click(); true`);
    await win.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const push = document.querySelector('button[title="Push commit verso il server"]');
        if (push) { push.click(); return; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Git sidebar unavailable');
    })()`);
    const waiting = Date.now() + 5000;
    while (!fs.existsSync(marker) && Date.now() < waiting) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(fs.existsSync(marker), true, 'Local pre-receive hook did not start');
    assert.equal(await second.webContents.executeJavaScript(`window.openfruitApi.cancelGitOperation('push')`), false);
    await win.webContents.executeJavaScript(`(async () => {
      [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Interrompi Git').click();
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (!document.body.textContent.includes('Interrompi Git') && document.body.textContent.includes('[Git push] Operazione interrotta')) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Git UI cancellation did not complete');
    })()`);
    console.log('PASS: UI cancels a real local push and its waiting hook without affecting another window');
    fs.writeFileSync(file, 'let externalDiffValue = 4\n');
    await win.webContents.executeJavaScript(`(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const diff = document.querySelector('button[title="Apri confronto a due colonne (Side-by-Side Diff)"]');
        if (diff) { diff.click(); break; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      while (Date.now() < deadline) {
        const close = document.querySelector('[data-tab-id^="diff-"] button');
        if (close && document.querySelector('main .monaco-diff-editor')) { close.click(); return; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Git diff did not open and close');
    })()`);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(rendererErrors, [], 'Unexpected renderer errors');
    clearTimeout(timeout);
    app.quit();
  } catch (error) {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  }
});
app.on('quit', () => {
  for (const folder of [scratch, deniedDirectory]) { try { fs.rmSync(folder, { recursive: true, force: true }); } catch {} }
});
