import type { EngineEvent } from '../electron/openfruit';
import type { LogLine, ProblemItem } from './types';

export interface Capabilities {
  schema_version: 2;
  operations: Record<string, 'implemented' | 'unavailable' | 'unsupported'>;
  operation_details: Record<string, { reason: string }>;
}

export function eventLog(event: EngineEvent): LogLine {
  return {
    id: `${event.producer_id}-${event.producer_sequence}`,
    timestamp: event.timestamp,
    text: `[${event.kind}] ${event.data.message || JSON.stringify(event.data)}`,
    type: event.severity === 'error' ? 'stderr' : 'system',
    event
  };
}

export function eventProblem(event: EngineEvent): ProblemItem | undefined {
  const d = event.data;
  if (event.kind !== 'diagnostic' || typeof d.file !== 'string' || typeof d.message !== 'string') return;
  return {
    id: `build-${d.diagnostic_id || `${event.producer_id}-${event.producer_sequence}`}`,
    source: 'build',
    filePath: d.file,
    fileName: d.file.split(/[/\\]/).pop() || d.file,
    message: d.message,
    severity: event.severity === 'error' ? 'error' : event.severity === 'warning' ? 'warning' : 'info',
    line: Math.max(1, Number(d.line) || 1),
    column: Math.max(1, Number(d.column) || 1)
  };
}

const stageLabels: Record<string, string> = {
  environment: 'Ambiente', project: 'Progetto', sdk: 'SDK', dependencies: 'Dipendenze',
  targets: 'Target', compile: 'Compilazione', package: 'Firma e pacchetto', deploy: 'Installazione'
};

export interface BuildProgress { stage: string; percent: number; state: string }

// build.progress counts completed stages; deploy.progress reports the
// device install percentage inside the deploy stage.
export function eventProgress(event: EngineEvent, current?: BuildProgress): BuildProgress | undefined {
  const d = event.data;
  if (event.kind === 'build.progress') {
    const stage = typeof d.active_stage === 'string' && d.active_stage ? d.active_stage : current?.stage || '';
    return { stage: stageLabels[stage] || stage, percent: Math.max(0, Math.min(100, Number(d.percent) || 0)), state: String(d.state || 'running') };
  }
  if (event.kind === 'deploy.progress') {
    const installed = Math.max(0, Math.min(100, Number(d.completed) || 0));
    return { stage: `Installazione ${installed}%`, percent: current?.percent ?? 0, state: 'running' };
  }
}

export interface BuildArtifacts { signedIpa: string; unsignedIpa: string; bundleId: string; deployed: boolean }

// The build span's completion carries the products of a successful build.
export function eventArtifacts(event: EngineEvent): BuildArtifacts | undefined {
  const d = event.data;
  if (event.kind !== 'task.completed' || d.name !== 'build' || d.state !== 'succeeded') return;
  return {
    signedIpa: typeof d.signed_ipa === 'string' ? d.signed_ipa : '',
    unsignedIpa: typeof d.unsigned_ipa === 'string' ? d.unsigned_ipa : '',
    bundleId: typeof d.bundle_id === 'string' ? d.bundle_id : '',
    deployed: d.deployed === true
  };
}
