export function terminalOwnsKeyboard(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('.xterm');
}
export function textInputOwnsKeyboard(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');
}
