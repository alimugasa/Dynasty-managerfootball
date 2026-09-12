// Surfaces and section furniture.
//
// The visual language is a night press box: cool slate ink, warm paper text,
// and amber used sparingly as the first-down marker. Amber marks the thing you
// are meant to look at; when everything is amber, nothing is.
//
// Depth is the other half of that sentence. A dark interface that draws every
// container the same way -- one fill, one hairline, one radius -- has no way to
// say which of two things matters more, and reads flat however good the type
// is. So a panel states how high it sits: `sunken` is a well things are listed
// in, `base` is the default card, `raised` is the one thing on the screen that
// is the point of the screen. Each step is a shadow below plus a one-pixel
// highlight along the top, which is what actually reads as lit from above.

import type { ReactNode } from 'react';
import { COLOR, ELEV, FONT, R, S, TYPE } from '../app/tokens';

export type Tone = 'sunken' | 'base' | 'raised';

const SURFACE: Readonly<Record<Tone, { background: string; boxShadow: string; border: string }>> = {
  sunken: {
    background: 'rgba(0,0,0,0.18)',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
    border: `1px solid ${COLOR.line}`,
  },
  base: {
    background: COLOR.panel,
    boxShadow: ELEV.low,
    border: `1px solid ${COLOR.line}`,
  },
  raised: {
    background: COLOR.raise,
    boxShadow: ELEV.mid,
    border: `1px solid ${COLOR.line2}`,
  },
};

export function Panel({
  children, padded = true, tone = 'base',
}: {
  readonly children: ReactNode;
  readonly padded?: boolean;
  readonly tone?: Tone;
}) {
  return (
    <div
      style={{
        ...SURFACE[tone],
        borderRadius: R.md,
        padding: padded ? S[3] : 0,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

/**
 * A titled band.
 *
 * The amber tick marks where a section starts without needing a heavier rule,
 * and the hairline running out to the right is what turns a stack of headings
 * into a document rather than a list of shouty words. `action` takes the
 * control that belongs to this section and nothing else.
 */
export function SectionHeader({
  title, action,
}: {
  readonly title: string;
  readonly action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: S[2],
        margin: `${String(S[6])}px 0 ${String(S[3])}px`, minWidth: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 3, height: 13, flexShrink: 0, borderRadius: 2,
          background: COLOR.amber,
          boxShadow: `0 0 10px ${COLOR.amber}55`,
        }}
      />
      <h2
        style={{
          ...TYPE.heading, margin: 0, flexShrink: 0, color: COLOR.tx,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {title}
      </h2>
      <span
        aria-hidden="true"
        style={{
          flex: 1, minWidth: S[3], height: 1,
          background: `linear-gradient(90deg, ${COLOR.line} 0%, transparent 100%)`,
        }}
      />
      {action}
    </div>
  );
}

export function Divider() {
  return <div aria-hidden="true" style={{ height: 1, background: COLOR.line, margin: `${String(S[3])}px 0` }} />;
}

/** Small uppercase label. Used for stat captions and metadata. */
export function Caption({ children }: { readonly children: ReactNode }) {
  return <span style={{ ...TYPE.micro, color: COLOR.mut }}>{children}</span>;
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
    <span
      className="numeric"
      style={{ fontSize: size, fontWeight: 600, color, lineHeight: 1.05, fontFamily: FONT.display }}
    >
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
    <div
      style={{
        padding: `${String(S[6])}px ${String(S[4])}px`,
        textAlign: 'center', color: COLOR.mut,
        border: `1px dashed ${COLOR.line}`,
        borderRadius: R.md,
        background: 'rgba(0,0,0,0.12)',
      }}
    >
      <p style={{ ...TYPE.micro, margin: 0, fontSize: 13, color: COLOR.dim }}>{title}</p>
      {detail !== undefined && (
        <p style={{ ...TYPE.prose, margin: `${String(S[2])}px auto 0`, maxWidth: 34 * 8 }}>{detail}</p>
      )}
    </div>
  );
}
