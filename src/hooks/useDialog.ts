import { useEffect, useRef, type RefObject } from 'react';
export function useDialog(open: boolean, container: RefObject<HTMLElement>, close: () => void) {
  const latestClose = useRef(close); latestClose.current = close;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => container.current?.querySelector<HTMLElement>('input,button,textarea,select')?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); latestClose.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || [])].filter(node => node.getClientRects().length);
      if (!controls.length) { event.preventDefault(); return; }
      if (!container.current?.contains(document.activeElement) || document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) {
        event.preventDefault(); (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', key, true); if (before?.isConnected) before.focus(); };
  }, [open, container]);
}
