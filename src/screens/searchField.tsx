// A search box.
//
// Type size is pinned at 16px for the same reason the name field's is: iOS
// Safari zooms the page on focus at anything smaller, and a screen that jumps
// as the keyboard opens has lost the player's place before they typed a letter.
//
// The clear button appears only once there is something to clear, because a
// control that does nothing is still a control the eye has to rule out.

import { useState } from 'react';
import { COLOR, FONT, MOTION, R, S, tint } from '../app/tokens';

export function SearchField({ value, onChange, placeholder, label, testId }: {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly placeholder: string;
  readonly label: string;
  readonly testId: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', left: S[3], top: '50%', transform: 'translateY(-50%)',
          display: 'flex', color: focused ? COLOR.amber : COLOR.dim,
          transition: `color ${MOTION.fast} ${MOTION.ease}`,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" focusable="false">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M15.4 15.4 20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-testid={testId}
        onChange={(e) => { onChange(e.target.value); }}
        onFocus={() => { setFocused(true); }}
        onBlur={() => { setFocused(false); }}
        style={{
          width: '100%', boxSizing: 'border-box', minHeight: 44,
          padding: `0 ${String(value === '' ? S[3] : S[7])}px 0 ${String(S[7])}px`,
          borderRadius: R.md,
          background: COLOR.ink, color: COLOR.tx,
          border: `1px solid ${focused ? COLOR.amber : COLOR.line2}`,
          boxShadow: focused
            ? `0 0 0 3px ${tint(COLOR.amber, 0.16)}`
            : 'inset 0 1px 2px rgba(0,0,0,0.3)',
          transition: `border-color ${MOTION.fast} ${MOTION.ease}, box-shadow ${MOTION.fast} ${MOTION.ease}`,
          outline: 'none',
          fontFamily: FONT.ui, fontSize: 16,
          // Safari draws its own clear button on a search input, in its own
          // colours, next to the one below.
          WebkitAppearance: 'none',
        }}
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Clear search"
          data-testid={`${testId}-clear`}
          onClick={() => { onChange(''); }}
          style={{
            position: 'absolute', right: S[2], top: '50%', transform: 'translateY(-50%)',
            width: 28, height: 28, borderRadius: R.pill,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 0, color: COLOR.mut, cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" focusable="false">
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
