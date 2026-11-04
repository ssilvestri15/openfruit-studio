import { useTranslation } from '../localization';
import { usePreferences } from '../hooks/usePreferences';
import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { PtyBridge, PtyOutput } from '../../shared/terminal';

export function InteractiveTerminal({ id, cwd, visible }: { id: string; cwd: string; visible: boolean }) {
  const t = useTranslation();
  const translate = useRef(t);
  translate.current = t;
  const { preferences } = usePreferences();
  const [profile, setProfile] = useState<'powershell' | 'cmd'>('powershell'), [restart, setRestart] = useState(0), [query, setQuery] = useState(''), [searchStatus, setSearchStatus] = useState('');
  const instance = useRef<Terminal>(), searchRow = useRef(-1);
  const theme = preferences.theme === 'light' ? {background:'#ffffff',foreground:'#20271b'} : {background:'#141414',foreground:'#e5e5e5'};
  useEffect(() => { if(instance.current) {instance.current.options.fontSize=preferences.terminalFontSize; instance.current.options.scrollback=preferences.terminalScrollback; instance.current.options.theme=theme;} }, [preferences]);
  const find = () => { const term=instance.current;if(!term||!query)return; const buffer=term.buffer.active; for(let i=1;i<=buffer.length;i++){const row=(searchRow.current+i)%buffer.length;if(buffer.getLine(row)?.translateToString().toLocaleLowerCase().includes(query.toLocaleLowerCase())){searchRow.current=row;term.scrollToLine(row);setSearchStatus(t("Riga ")+(row+1));return;}}setSearchStatus(t("Nessuna occorrenza")); };
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sessionId = `pty-${crypto.randomUUID()}`;
    const api = (window as unknown as { openfruitApi?: PtyBridge }).openfruitApi;
    const terminal = new Terminal({ cursorBlink: true, scrollback: preferences.terminalScrollback, fontSize: preferences.terminalFontSize, theme });
    instance.current = terminal; searchRow.current = -1;
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(host.current!);
    let token: string | undefined, disposed = false;
    // Subscribe before spawning: ConPTY can emit its first data before invoke resolves.
    const early: PtyOutput[] = [];
    const receive = (event: PtyOutput) => {
      if (disposed || event.id !== sessionId || (token && event.token !== token)) return;
      if (!token) { early.push(event); return; }
      if ('data' in event) terminal.write(event.data, () => {
        if (!disposed) api?.ptyAck(sessionId, event.token, event.data.length).catch(() => {});
      });
      else terminal.writeln(`\r\n[${translate.current("Sessione terminata: {0}", [event.exitCode])}]`);
    };
    const unsubscribe = api?.onPtyOutput(receive);
    const resize = () => {
      if (!host.current?.clientWidth || !host.current.clientHeight) return;
      fit.fit();
      if (terminal.cols > 500 || terminal.rows > 500) terminal.resize(Math.min(500, terminal.cols), Math.min(500, terminal.rows));
      if (token) api?.ptyResize(sessionId, token, terminal.cols, terminal.rows).catch(() => {});
    };
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(resize); }); observer.observe(host.current!);
    const input = terminal.onData(data => {
      if (!token) return;
      for (let offset = 0; offset < data.length; offset += 32768) api?.ptyWrite(sessionId, token, data.slice(offset, offset + 32768)).catch(() => {});
    });
    if (api) api.ptyOpen(sessionId, cwd, profile).then((session: string) => {
      if (disposed) { api.ptyClose(sessionId, session).catch(() => {}); return; }
      token = session; early.splice(0).forEach(receive); resize();
    }).catch((error: Error) => { if (!disposed) terminal.writeln(error.message); });
    else terminal.writeln(t("Terminale disponibile nell’app desktop."));
    return () => { disposed = true; unsubscribe?.(); observer.disconnect(); cancelAnimationFrame(frame); input.dispose(); terminal.dispose(); instance.current = undefined; if (token) api?.ptyClose(sessionId, token).catch(() => {}); };
  }, [id, cwd, profile, restart]);
  return <div className="h-full w-full flex flex-col" style={{ display: visible ? 'flex' : 'none' }}>
    <div className="flex gap-2 px-2 py-1 text-[10px] text-fruit-textMuted bg-fruit-bg shrink-0">
      <select aria-label={t("Profilo terminale")} value={profile} className="bg-fruit-surface" onChange={e=>{if(confirm(t("Cambiare shell e chiudere la sessione corrente?")))setProfile(e.target.value as typeof profile);}}><option value="powershell">PowerShell</option><option value="cmd">{t("Prompt dei comandi")}</option></select>
      <button onClick={()=>{if(confirm(t("Chiudere la sessione e riavviare la shell?")))setRestart(v=>v+1);}}>{t("Riavvia")}</button><button onClick={()=>instance.current?.clear()}>{t("Pulisci")}</button>
      <form className="ml-auto flex gap-2" onSubmit={e=>{e.preventDefault();find();}}><input aria-label={t("Cerca nel buffer terminale")} className="bg-fruit-surface px-1 w-32" placeholder={t("Cerca nel buffer")} value={query} onChange={e=>{setQuery(e.target.value);searchRow.current=-1;}}/><button>{t("Cerca successivo")}</button><span role="status">{searchStatus}</span></form>
    </div><div ref={host} className="flex-1 min-h-0 w-full" />
  </div>;
}
