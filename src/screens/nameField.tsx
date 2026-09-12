// The one text input in the product: a GM's first name, and his last.
//
// Shared with the play-test rig for the same reason the front door is -- the
// GM screen is one of four boot screens and four screens are easy to let
// drift apart between two builds.

import { useState } from 'react';
import { COLOR, FONT, MOTION, R, S, TYPE, tint } from '../app/tokens';

/** Long enough for any real name, short enough that the column it lands in on
 *  a save-file card is a name and not a paragraph. */
export const MAX_NAME = 24;

interface Props {
  readonly label: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly autoFocus?: boolean;
  readonly testId: string;
}

export function NameField({ label, value, onChange, autoFocus = false, testId }: Props) {
  // A text field with no focus state is a field you cannot tell you are in.
  // The ring is amber because amber is what this app uses to mean "here".
  const [focused, setFocused] = useState(false);
  return (
    <label style={{ display: 'grid', gap: S[2], minWidth: 0 }}>
      <span style={{ ...TYPE.micro, color: focused ? COLOR.amber : COLOR.mut }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        maxLength={MAX_NAME}
        autoComplete="off"
        autoCapitalize="words"
        // Focused on arrival: this screen exists to be typed in, and the
        // player tapped a save file to get here.
        autoFocus={autoFocus}
        data-testid={testId}
        onChange={(e) => { onChange(e.target.value); }}
        onFocus={() => { setFocused(true); }}
        onBlur={() => { setFocused(false); }}
        style={{
          width: '100%', boxSizing: 'border-box', minHeight: 48,
          padding: `0 ${String(S[3])}px`, borderRadius: R.md,
          background: COLOR.ink, color: COLOR.tx,
          border: `1px solid ${focused ? COLOR.amber : COLOR.line2}`,
          boxShadow: focused ? `0 0 0 3px ${tint(COLOR.amber, 0.16)}` : 'inset 0 1px 2px rgba(0,0,0,0.3)',
          transition: `border-color ${MOTION.fast} ${MOTION.ease}, box-shadow ${MOTION.fast} ${MOTION.ease}`,
          outline: 'none',
          // 16px exactly: anything smaller and iOS Safari zooms the page on
          // focus, which throws the layout of every screen behind this one.
          fontFamily: FONT.ui, fontSize: 16,
        }}
      />
    </label>
  );
}
