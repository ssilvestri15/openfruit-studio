// Runs in the sandboxed renderer through the real preload/IPC boundary.
module.exports = async function ptyScenario(cwd) {
  const api = window.openfruitApi;
  const outputs = new Map(), exited = new Set();
  const outstanding = [];
  let hold = false;
  const plain = id => (outputs.get(id) || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(?:\x07)/g, '');
  const wait = async (predicate, label) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) { if (predicate()) return; await new Promise(r => setTimeout(r, 30)); }
    throw new Error(label + ': ' + plain('pty-test-one').slice(-1000));
  };
  const unsubscribe = api.onPtyOutput(event => {
    if (!event.id.startsWith('pty-test-')) return;
    if (typeof event.data === 'string') {
      outputs.set(event.id, (outputs.get(event.id) || '') + event.data);
      if (hold) outstanding.push(event);
      else api.ptyAck(event.id, event.token, event.data.length).catch(() => {});
    } else exited.add(event.id);
  });
  const one = 'pty-test-one', two = 'pty-test-two';
  let token, second;
  try {
    token = await api.ptyOpen(one, cwd); second = await api.ptyOpen(two, cwd);
    await wait(() => plain(one).includes('PS ') && plain(two).includes('PS '), 'PowerShell prompt');
    await api.ptyWrite(one, token, "Write-Output ('PT'+'Y_READY')\r");
    await wait(() => plain(one).includes('PTY_READY'), 'Interactive command');
    await api.ptyWrite(one, token, "$answer = Read-Host ('ASK'+'_ME'); Write-Output ('ANSWER_' + $answer)\r");
    await wait(() => plain(one).includes('ASK_ME'), 'Read-Host prompt');
    await api.ptyWrite(one, token, 'ciao\r');
    await wait(() => plain(one).includes('ANSWER_ciao'), 'Read-Host input');
    await api.ptyWrite(one, token, "Write-Output ('HISTORY'+'_OK')\r");
    await wait(() => plain(one).includes('HISTORY_OK'), 'First history command');
    await api.ptyWrite(one, token, '\x1b[A\r');
    await wait(() => plain(one).split('HISTORY_OK').length >= 3, 'Arrow history');
    await api.ptyResize(one, token, 111, 31);
    await api.ptyWrite(one, token, "Write-Output ('SIZE_' + [Console]::WindowWidth)\r");
    await wait(() => plain(one).includes('SIZE_111'), 'ConPTY dimensions');
    await api.ptyWrite(one, token, 'Start-Sleep -Seconds 20\r');
    await new Promise(r => setTimeout(r, 150));
    await api.ptyWrite(one, token, '\x03');
    await new Promise(r => setTimeout(r, 100));
    await api.ptyWrite(one, token, "Write-Output ('AFTER'+'_CTRL_C')\r");
    await wait(() => plain(one).includes('AFTER_CTRL_C'), 'Ctrl+C preserves the shell');
    hold = true;
    await api.ptyWrite(one, token, "[Console]::Write(('x' * 300000)); Write-Output ('FLOW'+'_DONE')\r");
    await wait(() => outstanding.reduce((sum, e) => sum + e.data.length, 0) > 100000, 'Backpressure high watermark');
    await new Promise(r => setTimeout(r, 100));
    if (plain(one).includes('FLOW_DONE')) throw new Error('Producer did not pause');
    hold = false;
    await Promise.all(outstanding.splice(0).map(e => api.ptyAck(e.id, e.token, e.data.length)));
    await wait(() => plain(one).includes('FLOW_DONE'), 'Backpressure resumes output');
    await api.ptyClose(one, token); token = undefined;
    await wait(() => exited.has(one), 'Closed ConPTY exits');
    await api.ptyWrite(two, second, "Write-Output ('SECOND'+'_ALIVE')\r");
    await wait(() => plain(two).includes('SECOND_ALIVE'), 'Other terminal survives close');
    return { interactive: true, ctrlC: true, history: true, resize: true, backpressure: true };
  } finally {
    hold = false;
    for (const e of outstanding) api.ptyAck(e.id, e.token, e.data.length).catch(() => {});
    if (token) await api.ptyClose(one, token).catch(() => {});
    if (second) await api.ptyClose(two, second).catch(() => {});
    unsubscribe();
  }
};
