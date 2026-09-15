// Test environment shims and teardown.
//
// jsdom implements neither ResizeObserver nor matchMedia, both of which the
// shell uses. Stubbing them here keeps the stubs in one place rather than
// scattered through the suites that happen to trip over them.

// Testing Library registers its own cleanup through a global afterEach, which
// only exists when vitest runs with `globals: true`. It does not here, so
// without this every render accumulates in the document and queries start
// finding the previous test's bottom navigation alongside this one's.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

class ResizeObserverStub {
  observe(): void { /* no layout in jsdom */ }
  unobserve(): void { /* no layout in jsdom */ }
  disconnect(): void { /* no layout in jsdom */ }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (typeof window !== 'undefined' && typeof window.scrollTo !== 'function') {
  window.scrollTo = (() => undefined) as unknown as typeof window.scrollTo;
}
