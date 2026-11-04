import { useTranslation } from '../localization';
import { useEffect, useState, lazy, Suspense } from 'react';
import type { ProjectSettingsBridge } from '../../shared/projectSettings';
const XcodeProjectEditor = lazy(() => import('./XcodeProjectEditor').then(module => ({ default: module.XcodeProjectEditor })));
const ProjectSettingsDialog = lazy(() => import('./ProjectSettingsDialog').then(module => ({ default: module.ProjectSettingsDialog })));

export function ProjectConfiguration(props: { root: string; name: string; initialProject?: string; onClose: () => void; onSaved: (paths: string[]) => void }) {
  const t = useTranslation();
  const [projects, setProjects] = useState<string[]>(), [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    const api = (window as unknown as { openfruitApi?: ProjectSettingsBridge }).openfruitApi;
    if (!api) { setError(t("Configurazione disponibile nell’app desktop")); return; }
    api.readProjectSettings(props.root).then(result => {
      if (current) setProjects([...new Set([...(props.initialProject ? [props.initialProject] : []), ...result.xcodeProjects])]);
    }).catch(error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, [props.root, props.initialProject]);
  const loading = <div role="dialog" aria-modal="true" aria-label={t("Caricamento configurazione")} className="fixed inset-0 z-[10000] bg-fruit-bg text-fruit-text p-8"><p role="status">{error || t("Lettura configurazione...")}</p>{error && <button onClick={props.onClose}>{t("Chiudi")}</button>}</div>;
  if (!projects) return loading;
  return <Suspense fallback={loading}>{projects.length ? <XcodeProjectEditor root={props.root} projects={projects} initialProject={props.initialProject} onClose={props.onClose} onSaved={props.onSaved} /> : <ProjectSettingsDialog {...props} />}</Suspense>;
}
