// A hundred faces at once, with the dials that made them.
//
// A development surface, not a destination: it sits outside the navigation
// stack and reads nothing from a save. Its whole job is to make a generator
// that produces thousands of people inspectable by a person, because the only
// way to find out that every linebacker has the same jaw is to put two hundred
// linebackers on one screen and look.
//
// Every face here is generated from a seed typed into the box. Nothing is
// sampled from a league and nothing is written anywhere.

import { useMemo, useState } from 'react';
import { COLOR, FONT, R, S, TYPE } from '../app/tokens';
import { PlayerAvatar } from '../avatar/PlayerAvatar';
import { PORTRAIT_SIZES, type PortraitSize } from '../avatar/portrait';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import { FaceRegistry, distance, signature } from '../../supabase/functions/_shared/avatar/unique';
import { skinBand } from '../../supabase/functions/_shared/avatar/skin';
import { BUILD_LABEL } from '../../supabase/functions/_shared/avatar/build';
import { ANCESTRY_LABEL } from '../../supabase/functions/_shared/avatar/ancestry';
import type { Ancestry } from '../../supabase/functions/_shared/avatar/ancestry';

const POSITIONS = [
  'QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C',
  'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS',
] as const;

const AGE_BANDS = [
  { label: 'Rookies (21-23)', lo: 21, hi: 23 },
  { label: 'Prime (24-29)', lo: 24, hi: 29 },
  { label: 'Veterans (30-34)', lo: 30, hi: 34 },
  { label: 'Late career (35-39)', lo: 35, hi: 39 },
  { label: 'Whole career (21-38)', lo: 21, hi: 38 },
] as const;

/** Seeds derived from the batch seed by a stable mix, so the same batch seed
 *  always yields the same hundred players and a colleague can be sent one. */
function seedsFrom(batch: string, count: number): readonly string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let h = 0x811c9dc5;
    const text = `${batch}#${String(i)}`;
    for (let k = 0; k < text.length; k += 1) {
      h ^= text.charCodeAt(k);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out.push(`${h.toString(16).padStart(8, '0')}${(h ^ 0x9e3779b9).toString(16).padStart(8, '0')}`);
  }
  return out;
}

const label: React.CSSProperties = {
  ...TYPE.micro, color: COLOR.mut, display: 'block', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '.06em',
};

const field: React.CSSProperties = {
  background: COLOR.panel, color: COLOR.tx, border: `1px solid ${COLOR.line}`,
  borderRadius: R.sm, padding: '6px 8px', fontSize: 13, fontFamily: FONT.ui,
  minWidth: 0, width: '100%', boxSizing: 'border-box',
};

export function AvatarLab() {
  const [batch, setBatch] = useState('dynasty');
  const [count, setCount] = useState(100);
  const [position, setPosition] = useState<string>('mixed');
  const [band, setBand] = useState(4);
  const [size, setSize] = useState<PortraitSize>('card');
  const [traits, setTraits] = useState(true);

  const people = useMemo(() => {
    const ages = AGE_BANDS[band] ?? AGE_BANDS[4];
    const registry = new FaceRegistry();
    return seedsFrom(batch, count).map((seed, i) => {
      const pos = position === 'mixed' ? POSITIONS[i % POSITIONS.length] as string : position;
      const age = ages.lo + (i * 7) % Math.max(1, ages.hi - ages.lo + 1);
      const profile = generateAvatar({ seed, position: pos, age });
      const clone = registry.has(profile.identity);
      registry.add(profile.identity);
      return { seed, pos, age, profile, clone };
    });
  }, [batch, count, position, band]);

  // The closest pair in the batch, which is the number worth watching: a
  // generator gets worse at the margin long before it starts repeating
  // outright, and an average distance would hide exactly that.
  const closest = useMemo(() => {
    let best = { a: '', b: '', d: Number.POSITIVE_INFINITY };
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        const d = distance(
          (people[i] as typeof people[0]).profile.identity,
          (people[j] as typeof people[0]).profile.identity,
        );
        if (d < best.d) {
          best = {
            a: (people[i] as typeof people[0]).seed,
            b: (people[j] as typeof people[0]).seed,
            d,
          };
        }
      }
    }
    return best;
  }, [people]);

  const duplicates = new Set(people.filter((p) => p.clone).map((p) => p.seed)).size;
  const signatures = new Set(people.map((p) => signature(p.profile.identity))).size;

  return (
    <div style={{ padding: S[4], maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{
        fontFamily: FONT.display, color: COLOR.tx, fontSize: 26, margin: 0,
        textTransform: 'uppercase', letterSpacing: '.04em',
      }}
      >
        Avatar Lab
      </h1>
      <p style={{ ...TYPE.micro, color: COLOR.mut, marginTop: 6, maxWidth: 620 }}>
        Every face below is generated from the batch seed. Nothing here is read
        from a save and nothing is written to one.
      </p>

      <div style={{
        display: 'grid', gap: S[3], marginTop: S[4],
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      }}
      >
        <div>
          <span style={label}>Batch seed</span>
          <input
            style={field} value={batch} aria-label="Batch seed"
            onChange={(e) => { setBatch(e.target.value); }}
          />
        </div>
        <div>
          <span style={label}>How many</span>
          <input
            style={field} type="number" min={1} max={400} value={count} aria-label="How many"
            onChange={(e) => { setCount(Math.max(1, Math.min(400, Number(e.target.value)))); }}
          />
        </div>
        <div>
          <span style={label}>Position</span>
          <select
            style={field} value={position} aria-label="Position"
            onChange={(e) => { setPosition(e.target.value); }}
          >
            <option value="mixed">All positions</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <span style={label}>Age</span>
          <select
            style={field} value={band} aria-label="Age"
            onChange={(e) => { setBand(Number(e.target.value)); }}
          >
            {AGE_BANDS.map((b, i) => <option key={b.label} value={i}>{b.label}</option>)}
          </select>
        </div>
        <div>
          <span style={label}>Size</span>
          <select
            style={field} value={size} aria-label="Size"
            onChange={(e) => { setSize(e.target.value as PortraitSize); }}
          >
            {PORTRAIT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <span style={label}>Traits</span>
          <button
            type="button" style={{ ...field, cursor: 'pointer', textAlign: 'left' }}
            onClick={() => { setTraits((t) => !t); }}
          >
            {traits ? 'Shown' : 'Hidden'}
          </button>
        </div>
      </div>

      <div style={{
        marginTop: S[4], display: 'flex', gap: S[4], flexWrap: 'wrap',
        ...TYPE.micro, color: COLOR.mut,
      }}
      >
        <span>{`${String(people.length)} faces`}</span>
        <span>{`${String(signatures)} distinct signatures`}</span>
        <span style={{ color: duplicates > 0 ? COLOR.red : COLOR.teal }}>
          {`${String(duplicates)} exact repeats`}
        </span>
        <span>{`closest pair: ${closest.d === Number.POSITIVE_INFINITY ? '-' : String(closest.d)}`}</span>
      </div>

      <div
        style={{
          marginTop: S[4], display: 'grid', gap: S[3],
          gridTemplateColumns: `repeat(auto-fill, minmax(${String(size === 'hero' ? 250 : size === 'profile' ? 170 : 120)}px, 1fr))`,
        }}
        data-testid="lab-grid"
      >
        {people.map((p) => (
          <div key={p.seed} style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <PlayerAvatar
                seed={p.seed} name={`${p.pos} ${String(p.age)}`} position={p.pos}
                age={p.age} size={size} primary="#26384B" secondary="#7B5C3A"
              />
            </div>
            {traits && (
              <div style={{ ...TYPE.micro, color: COLOR.dim, marginTop: 6, lineHeight: 1.45 }}>
                <div style={{ color: p.clone ? COLOR.red : COLOR.mut }}>
                  {`${p.pos} · ${String(p.age)} · ${BUILD_LABEL[p.profile.appearance.build]}`}
                </div>
                <div>
                  {p.profile.identity.ancestry
                    .map((a: Ancestry) => ANCESTRY_LABEL[a]).join(' + ')}
                </div>
                <div>{`${skinBand(p.profile.identity.skinStep)} ${String(p.profile.identity.skinStep)} · ${p.profile.identity.undertone}`}</div>
                <div>{`${p.profile.identity.baseHead} · ${p.profile.identity.nose} · ${p.profile.identity.eyes}`}</div>
                <div>{`${p.profile.appearance.hairstyle} · ${p.profile.identity.hairTexture}`}</div>
                <div>{`${p.profile.appearance.facialHair} · ${p.profile.appearance.facialHairDensity}`}</div>
                <div style={{ color: COLOR.line2, wordBreak: 'break-all' }}>{p.seed}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
