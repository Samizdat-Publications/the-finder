// Shared boot-error overlay: any uncaught error or rejected promise shows a readable message on the
// page instead of leaving it blank. The overlay element is `#boot-error` in each HTML page.

function show(message: string): void {
  const el = document.getElementById('boot-error');
  if (!el || el.textContent) return;
  el.style.display = 'block';
  el.textContent = `Something went wrong while starting.\n\n${message}`;
}

export function installBootErrors(): void {
  window.addEventListener('error', (e: ErrorEvent) => {
    show(`${e.message}\n${e.filename}:${e.lineno}`);
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r: unknown = e.reason;
    show(r instanceof Error ? `${r.message}\n${r.stack ?? ''}` : String(r));
  });
}
