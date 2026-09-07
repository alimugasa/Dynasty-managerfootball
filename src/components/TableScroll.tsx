import type { ReactNode } from 'react';

/** Wide tables scroll horizontally INSIDE this container. The page never does.
 *  Named .tscroll to match the prototype's convention. */
export function TableScroll({ children }: { children: ReactNode }) {
  return (
    <div
      className="tscroll"
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        maxWidth: '100%',
      }}
    >
      {children}
    </div>
  );
}
