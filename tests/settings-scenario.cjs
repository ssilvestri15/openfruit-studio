// Clicks the app title and edits real project settings and dependency manifests.
module.exports = async function settingsScenario(win, root, fs, path, assert) {
  const run = code => win.webContents.executeJavaScript(code);
  const wait = async predicate => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) { if (await predicate()) return; await new Promise(r => setTimeout(r, 30)); }
    throw new Error('Project settings UI did not reach expected state: ' + await run('document.body.textContent.slice(-1500)'));
  };
  const click = text => run(`(() => { [...document.querySelectorAll('[aria-label="Configurazione progetto"] button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}).click(); return true; })()`);
  const input = (label, value, textarea = false) => run(`(() => {
    const element = document.querySelector(${JSON.stringify('[aria-label="' + label + '"]')});
    Object.getOwnPropertyDescriptor(${textarea ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true })); return true;
  })()`);
  await run(`([...document.querySelectorAll('[data-file-path]')].find(node => node.getAttribute('data-file-path') === ${JSON.stringify(path.join(root, 'Package.swift'))})).click(); true`);
  await wait(() => run("document.querySelector('main .view-lines')?.textContent.includes('PackageDescription')"));
  await run('document.querySelector(\'button[aria-label="Configurazione progetto"]\').click(); true');
  await wait(() => run('!!document.querySelector(\'input[aria-label="Bundle ID"]\')'));
  await input('Bundle ID', 'invalid id'); await click('Salva configurazione');
  await wait(() => run('document.querySelector(\'[role=dialog] [role=alert]\')?.textContent.includes("Bundle ID non valido")'));
  assert.equal(fs.existsSync(path.join(root, '.openfruit-studio.json')), false);
  await input('Bundle ID', 'com.example.desktop-test'); await input('Nome visualizzato', 'Sample Configured');
  await click('Firma e team'); await input('Team ID di riferimento', 'ABCDE12345');
  await click('Dipendenze');
  await wait(() => run('!!document.querySelector(\'textarea[aria-label="Contenuto manifesto dipendenze"]\')'));
  const manifest = fs.readFileSync(path.join(root, 'Package.swift'), 'utf8') + '\n// dependency configuration edited through the IDE\n';
  await input('Contenuto manifesto dipendenze', manifest, true);
  await click('Salva configurazione');
  await wait(() => run('document.querySelector(\'[role=dialog] [role=status]\')?.textContent === "Configurazione salvata"'));
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.openfruit-studio.json'), 'utf8'));
  assert.equal(settings.bundleId, 'com.example.desktop-test'); assert.equal(settings.teamId, 'ABCDE12345');
  assert.equal(fs.readFileSync(path.join(root, 'Package.swift'), 'utf8'), manifest);
  await click('Generale');
  await new Promise(resolve => setTimeout(resolve, 50));
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'project-settings-2026-10-30.png'), (await win.webContents.capturePage()).toPNG());
  await run('document.querySelector(\'button[aria-label="Chiudi configurazione progetto"]\').click(); true');
  await wait(() => run('!document.querySelector(\'[role=dialog]\')'));
  await run(`document.querySelector('[data-file-path=' + CSS.escape(${JSON.stringify(root)}) + '] button[title="Configurazione progetto"]').click(); true`);
  await wait(() => run('document.querySelector(\'input[aria-label="Bundle ID"]\')?.value === "com.example.desktop-test"'));
  await run('document.querySelector(\'button[aria-label="Chiudi configurazione progetto"]\').click(); true');
  await wait(() => run('!document.querySelector(\'[role=dialog]\')'));
  await wait(() => run("document.querySelector('main .view-lines')?.textContent.includes('dependency')"));
  await run(`([...document.querySelectorAll('[data-file-path]')].find(node => node.getAttribute('data-file-path') === ${JSON.stringify(path.join(root, 'Source.swift'))})).click(); true`);
  await wait(() => run("document.querySelector('main .view-lines')?.textContent.includes('reloadedValue')"));

};
