// Surfaces and section furniture.
//
// The visual language is a night press box: cool slate ink, warm paper text, and
// amber used sparingly as the first-down marker. Amber marks the thing you are
// meant to look at; when everything is amber, nothing is.

import type { ReactNode } from 'react';
import { COLOR, FONT } from '../app/tokens';

export function Panel({
  children, padded = true, tone = 'panel',
}: {
  readonly children: ReactNode;
  readonly padded?: boolean;
  readonly tone?: 'panel' | 'raise';
}) {
  return (
    <div
      style={{
        background: tone === 'raise' ? COLOR.raise : COLOR.panel,
        border: `1px solid ${COLOR.line}`,
        borderRadius: 3,
        padding: padded ? 12 : 0,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

/** A titled band. The amber tick is the only decoration; it marks where a
 *  section starts without needing a heavier rule. */
export function SectionHeader({
  title, action,
}: {
  readonly title: string;
  readonly action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        margin: '18px 0 8px', minWidth: 0,
      }}
    >
      <span aria-hidden="true" style={{ width: 3, height: 14, background: COLOR.amber, borderRadius: 1, flexShrink: 0 }} />
      <h2
        style={{
          margin: 0, flex: 1, minWidth: 0,
          fontFamily: FONT.display, fontWeight: 600, fontSize: 15,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR.tx,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {title}
      </h2>
      {action}
    </div>
  );
}

export function Divider() {
  return <div aria-hidden="true" style={{ height: 1, background: COLOR.line, margin: '10px 0' }} />;
}

/** Small uppercase label. Used for stat captions and metadata. */
export function Caption({ children }: { readonly children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: FONT.display, fontSize: 11, letterSpacing: '0.09em',
        textTransform: 'uppercase', color: COLOR.mut,
      }}
    >
      {children}
    </span>
  );
}

/** A number that wants to be read as a number. */
export function Figure({
  value, size = 22, tone = 'default',
}: {
  readonly value: string;
  readonly size?: number;
  readonly tone?: 'default' | 'accent' | 'muted';
}) {
  const color = tone === 'accent' ? COLOR.amber : tone === 'muted' ? COLOR.mut : COLOR.tx;
  return (
    <span className="numeric" style={{ fontSize: size, fontWeight: 600, color, lineHeight: 1.05 }}>
      {value}
    </span>
  );
}

/**
 * Nothing here, and that is a fact rather than a failure.
 *
 * Distinct from DataBoundary, which reports that something could not be
 * loaded. An empty list and an unavailable list must not look the same: one is
 * information, the other is a defect.
 */
export function EmptyState({ title, detail }: { readonly title: string; readonly detail?: string }) {
  return (
    <div style={{ padding: '22px 14px', textAlign: 'center', color: COLOR.mut }}>
      <p style={{ margin: 0, fontFamily: FONT.display, fontSize: 15, letterSpacing: '0.05em', textTransform: 'uppercase', color: COLOR.dim }}>
        {title}
      </p>
      {detail !== undefined && (
        <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>{detail}</p>
      )}
    </div>
  );
}
