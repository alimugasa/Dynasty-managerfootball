/** Tailwind references the CSS custom properties in src/app/tokens.css.
 *  It must never duplicate a hex value — one source of truth for colour. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)', panel: 'var(--panel)', raise: 'var(--raise)',
        line: 'var(--line)', line2: 'var(--line2)',
        tx: 'var(--tx)', mut: 'var(--mut)', dim: 'var(--dim)',
        amber: 'var(--amber)', teal: 'var(--teal)', red: 'var(--red)',
        blue: 'var(--blue)', violet: 'var(--violet)',
        'g-elite': 'var(--g-elite)', 'g-vgood': 'var(--g-vgood)',
        'g-good': 'var(--g-good)', 'g-avg': 'var(--g-avg)',
        'g-poor': 'var(--g-poor)', 'g-bad': 'var(--g-bad)',
      },
      fontFamily: { disp: 'var(--f-disp)', ui: 'var(--f-ui)' },
      maxWidth: { shell: '520px' },
    },
  },
  plugins: [],
};
