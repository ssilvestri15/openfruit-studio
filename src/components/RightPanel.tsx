import { useTranslation } from '../localization';
import { useEffect, useRef, useState } from 'react';
import { MonitorOff, Play, Square, Smartphone, Loader2 } from 'lucide-react';
import { PreviewStreamParser, h264Codec } from '../utils/previewStream';

interface RightPanelProps {
  projectName: string;
  device: { udid: string; name: string; connected: boolean };
  isBuilding: boolean;
  canBuildPreview: boolean;
  // Builds with --preview, installs on the device; resolves to success.
  onBuildPreview: () => Promise<boolean>;
}

type State = 'idle' | 'waiting' | 'streaming';

// Live preview of the app running on the device: H.264 from the OPENFRUIT
// preview agent, decoded by WebCodecs (hardware when available) into a canvas.
export function RightPanel({ projectName, device, isBuilding, canBuildPreview, onBuildPreview }: RightPanelProps) {
  const t = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<State>('idle');
  const [status, setStatus] = useState('');
  const [fps, setFps] = useState(0);
  const [aspect, setAspect] = useState(9 / 19.5);
  const api = (window as any).openfruitApi;
  const supported = typeof (window as any).VideoDecoder === 'function';

  useEffect(() => {
    if (!api?.onPreviewData || !supported) return;
    const parser = new PreviewStreamParser();
    let decoder: VideoDecoder | null = null;
    let configured = '';
    let waitingForKey = true;
    let frames = 0;
    const counter = setInterval(() => { setFps(frames); frames = 0; }, 1000);
    const draw = (frame: VideoFrame) => {
      const canvas = canvasRef.current, context = canvas?.getContext('2d');
      if (canvas && context) {
        if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
          canvas.width = frame.displayWidth; canvas.height = frame.displayHeight;
          setAspect(frame.displayWidth / frame.displayHeight);
        }
        context.drawImage(frame, 0, 0);
        frames++;
      }
      frame.close();
    };
    const reset = () => { try { decoder?.close(); } catch { /* already closed */ } decoder = null; configured = ''; waitingForKey = true; };
    const offData = api.onPreviewData((chunk: Uint8Array) => {
      let decoded;
      try { decoded = parser.push(new Uint8Array(chunk)); }
      catch (error: any) { setStatus(error.message); parser.reset(); reset(); return; }
      for (const frame of decoded) {
        setState('streaming');
        if (frame.keyframe) {
          const codec = h264Codec(frame.data) || 'avc1.4d0028';
          const key = `${codec}-${frame.width}x${frame.height}`;
          if (key !== configured) {
            reset();
            decoder = new VideoDecoder({ output: draw, error: error => { setStatus(error.message); reset(); } });
            decoder.configure({ codec, codedWidth: frame.width, codedHeight: frame.height, optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware' });
            configured = key;
          }
          waitingForKey = false;
        }
        // Stay live: when decoding falls behind, drop frames until the next keyframe.
        if (!decoder || waitingForKey) continue;
        if (!frame.keyframe && decoder.decodeQueueSize > 4) { waitingForKey = true; continue; }
        decoder.decode(new EncodedVideoChunk({ type: frame.keyframe ? 'key' : 'delta', timestamp: frame.presentationUs, data: frame.data }));
      }
    });
    const offStatus = api.onPreviewStatus((line: string) => {
      setStatus(line);
      if (/waiting|ended/i.test(line)) { setState('waiting'); parser.reset(); reset(); }
    });
    const offEnded = api.onPreviewEnded(() => { setState('idle'); parser.reset(); reset(); });
    return () => { clearInterval(counter); offData?.(); offStatus?.(); offEnded?.(); reset(); api.stopPreview?.(); };
  }, [api, supported]);

  const connect = async () => {
    try { setStatus(t("Connessione al dispositivo...")); setState('waiting'); await api.startPreview(device.udid); }
    catch (error: any) { setState('idle'); setStatus(error.message); }
  };
  const stop = () => { void api?.stopPreview?.(); setState('idle'); setStatus(''); };
  const buildAndConnect = async () => {
    setStatus(t("Compilazione preview..."));
    if (await onBuildPreview()) {
      await connect();
      setStatus(t("App installata: aprila sull’iPhone per vedere la preview."));
    } else setStatus(t("Build preview non riuscita: vedi Output."));
  };

  const usable = !!api?.startPreview && supported;
  const canConnect = usable && device.connected && !!device.udid;
  return (
    <aside aria-label={t("Preview progetto")} className="w-80 shrink-0 bg-fruit-canvas border-l border-fruit-border flex flex-col p-4 gap-3 text-fruit-textMuted">
      <div className="flex items-center gap-2 text-fruit-text">
        <Smartphone size={16} />
        <h2 className="text-sm font-semibold truncate">{t("Preview di")} {projectName}</h2>
      </div>
      <p className="text-[11px] truncate" title={device.udid}>{device.connected ? device.name : t("Nessun dispositivo collegato")}</p>
      <div className="flex gap-2">
        <button className="flex items-center gap-1 px-2 py-1 rounded bg-fruit-accent text-fruit-accentDark text-xs font-semibold disabled:opacity-40"
          disabled={!canConnect || !canBuildPreview || isBuilding} onClick={() => void buildAndConnect()}
          title={t("Compila con l’agente di preview, installa e collega lo stream")}>
          {isBuilding ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} {t("Compila e avvia")}
        </button>
        {state === 'idle'
          ? <button className="px-2 py-1 rounded border border-fruit-border text-xs disabled:opacity-40" disabled={!canConnect} onClick={() => void connect()}
              title={t("Collega lo stream di un’app già installata con --preview")}>{t("Collega")}</button>
          : <button className="flex items-center gap-1 px-2 py-1 rounded border border-fruit-border text-xs" onClick={stop}><Square size={12} /> Stop</button>}
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="relative max-h-full w-full rounded-[28px] border-4 border-fruit-border bg-black overflow-hidden" style={{ aspectRatio: String(aspect) }}>
          <canvas ref={canvasRef} className="w-full h-full object-contain" />
          {state !== 'streaming' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs">
              <MonitorOff size={24} />
              {!usable ? <span>{t("La preview richiede l’app desktop con supporto WebCodecs.")}</span>
                : state === 'waiting' ? <span>{t("In attesa dell’app sul dispositivo...")}</span>
                : <span>{t("Compila e avvia per vedere l’app in esecuzione sull’iPhone.")}</span>}
            </div>
          )}
        </div>
      </div>
      <p className="text-[10px] text-fruit-textDim min-h-[1rem]">{state === 'streaming' ? `${fps} fps` : status}</p>
    </aside>
  );
}
