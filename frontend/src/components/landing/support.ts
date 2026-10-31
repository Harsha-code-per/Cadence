/** Whether this device can show the WebGL world; the CSS sunrise covers every other case. */
export function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Run after the browser finishes its first work; returns a cancel function. */
export function whenIdle(run: () => void) {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout: 1200 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 300); // Safari
  return () => clearTimeout(id);
}
