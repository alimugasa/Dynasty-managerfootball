// Development-mode tripwire for page-level horizontal overflow, which is a
// defect at every viewport width down to 320px. Tables scrolling inside their
// own containers is correct and expected; the PAGE scrolling sideways is not.

export function installOverflowGuard(): () => void {
  if (import.meta.env.PROD) return () => undefined;

  const check = () => {
    const el = document.documentElement;
    if (el.scrollWidth <= el.clientWidth) return;
    const overflowing = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((n) => n.getBoundingClientRect().right > el.clientWidth + 1)
      .filter((n) => !n.closest('.tscroll'))
      .slice(0, 5);
    // eslint-disable-next-line no-console
    console.error(
      `[overflow] page scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}.`,
      'Offending elements:',
      overflowing,
    );
  };

  // ResizeObserver is absent in some test and server environments. A dev-only
  // tripwire must never be the reason something fails to start, so it degrades
  // to the resize event rather than throwing.
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null;
  observer?.observe(document.documentElement);
  window.addEventListener('resize', check);
  check();
  return () => {
    observer?.disconnect();
    window.removeEventListener('resize', check);
  };
}
