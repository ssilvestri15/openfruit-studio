// Exercises the merge from the actual Monaco editor through the conflict UI.
module.exports = async function mergeScenario(win, file, fs, assert) {
  const run = code => win.webContents.executeJavaScript(code);
  const wait = async predicate => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) { if (await predicate()) return; await new Promise(r => setTimeout(r, 30)); }
    throw new Error('Merge UI did not reach the expected state: ' + await run('JSON.stringify({buttons: [...document.querySelectorAll(\'[role=dialog] button\')].map(b=>({text:b.textContent,disabled:b.disabled})), body:document.body.textContent.slice(-2200)})'));
  };
  const click = async text => run(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) throw new Error('Button unavailable: ' + ${JSON.stringify(text)}); button.click(); return true; })()`);
  const edit = async (text, dialog = false) => {
    win.focus(); win.webContents.focus();
    await run(`document.querySelector(${JSON.stringify(dialog ? '[role="dialog"] .modified textarea.inputarea' : 'main .monaco-editor textarea.inputarea')}).focus(); true`);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
    await new Promise(r => setTimeout(r, 50));
    await win.webContents.insertText(text);
    await new Promise(r => setTimeout(r, 100));
  };
  const save = () => run("window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })); true");
  const base = 'let first = 1\nlet second = 2\nlet third = 3\nlet fourth = 4\nlet fifth = 5\n';
  await edit(base); await save(); await wait(() => fs.readFileSync(file, 'utf8') === base);
  const disk = base.replace('fifth = 5', 'fifth = 50'); fs.writeFileSync(file, disk);
  await edit(base.replace('first = 1', 'first = 10')); await save();
  await wait(() => run("[...document.querySelectorAll('main button')].some(b => b.textContent.trim() === 'Unisci automaticamente' && !b.disabled)"));
  await click('Unisci automaticamente');
  await wait(() => run("document.querySelector('[role=dialog]')?.textContent.includes('Merge completato') && document.querySelector('[role=dialog] .modified .view-lines')?.textContent.replace(/\\u00a0/g, ' ').includes('fifth = 50')"));
  assert.equal(fs.readFileSync(file, 'utf8'), disk, 'Merge preview must not write the source');
  await click('Salva la versione a destra');
  const merged = disk.replace('first = 1', 'first = 10');
  await wait(() => fs.readFileSync(file, 'utf8') === merged);
  await wait(() => run("!document.querySelector('[role=dialog]')"));
  const overlapDisk = merged.replace('first = 10', 'first = 30'); fs.writeFileSync(file, overlapDisk);
  await edit(merged.replace('first = 10', 'first = 20')); await save();
  await wait(() => run("[...document.querySelectorAll('main button')].some(b => b.textContent.trim() === 'Unisci automaticamente' && !b.disabled)"));
  await click('Unisci automaticamente');
  await wait(() => run("document.querySelector('[role=dialog]')?.textContent.includes('Modifiche sovrapposte')"));
  assert.equal(await run("[...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Salva la versione a destra').disabled"), true);
  await save(); await new Promise(r => setTimeout(r, 100));
  assert.equal(fs.readFileSync(file, 'utf8'), overlapDisk, 'Unresolved markers must not reach disk');
  await edit(merged.replace('first = 10', 'first = 40'), true);
  await wait(() => run("![...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Salva la versione a destra').disabled"));
  await click('Salva la versione a destra');
  await wait(() => fs.readFileSync(file, 'utf8') === merged.replace('first = 10', 'first = 40'));
  await wait(() => run("!document.querySelector('[role=dialog]')"));
};
