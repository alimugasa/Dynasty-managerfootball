// Pieces of the illustrated-avatar lab.
//
// Kept out of the screen so the screen reads as three sections rather than as
// a wall of plumbing, and so neither file gets near the 400-line ceiling.

import { useMemo } from 'react';
import { COLOR, FONT, R, TYPE } from '../app/tokens';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import type { AvatarProfile } from '../../supabase/functions/_shared/avatar/profile';
import { skinBand } from '../../supabase/functions/_shared/avatar/skin';
import { BUILD_LABEL } from '../../supabase/functions/_shared/avatar/build';
import { IllustratedPortrait } from '../avatar/illustrated/Portrait';
import { selectFeatures } from '../avatar/illustrated/select';
import { faceMorph } from '../../supabase/functions/_shared/avatar/morph';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS', 'FB'] as const;

export function seedAt(batch: string, i: number): string {
  let h = 0x811c9dc5;
  const text = `${batch}#${String(i)}`;
  for (let k = 0; k < text.length; k += 1) h = Math.imul(h ^ text.charCodeAt(k), 0x01000193) >>> 0;
  const b = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return `${h.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

export interface Subject {
  readonly profile: AvatarProfile;
  readonly position: string;
  readonly age: number;
}

/** Twenty players, spread across positions and ages rather than drawn from one
 *  corner of the distribution. A grid of twenty 24-year-old receivers would
 *  flatter the system by hiding the build and age systems entirely. */
export function cohort(batch: string, count: number): readonly Subject[] {
  const out: Subject[] = [];
  for (let i = 0; i < count; i += 1) {
    const position = POSITIONS[i % POSITIONS.length] as string;
    const age = 21 + (i * 5) % 18;
    out.push({ profile: generateAvatar({ seed: seedAt(batch, i), position, age }), position, age });
  }
  return out;
}

/**
 * Players who share a skin tone.
 *
 * The diagnostic the brief asks for, and the reason it matters: a grid where
 * every player has a different complexion can look diverse while every face
 * underneath is the same drawing. Holding pigmentation fixed removes that
 * cover. Structures are taken greedily -- a seed is kept only if it brings a
 * skull the set does not already have -- so the row tests the head library
 * rather than the luck of the draw.
 */
export function sameSkin(batch: string, count: number, step: number): readonly Subject[] {
  const out: Subject[] = [];
  const used = new Set<string>();
  for (let pass = 0; pass < 2 && out.length < count; pass += 1) {
    for (let i = 0; i < 9000 && out.length < count; i += 1) {
      const position = POSITIONS[out.length % POSITIONS.length] as string;
      const age = 23 + (out.length * 3) % 12;
      const profile = generateAvatar({ seed: seedAt(batch, i), position, age });
      if (Math.abs(profile.identity.skinStep - step) > 1) continue;
      const head = selectFeatures(profile, faceMorph(profile)).head;
      if (pass === 0 && used.has(head)) continue;
      used.add(head);
      out.push({ profile, position, age });
    }
  }
  return out;
}

export function Section({ title, note, children }: {
  readonly title: string; readonly note: string; readonly children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 30 }}>
      <h2 style={{
        fontFamily: FONT.display, color: COLOR.tx, fontSize: 19, margin: 0,
        textTransform: 'uppercase', letterSpacing: '.06em',
      }}
      >
        {title}
      </h2>
      <p style={{ ...TYPE.prose, color: COLOR.mut, margin: '5px 0 14px', maxWidth: 760, fontSize: 13 }}>
        {note}
      </p>
      {children}
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#10161D', border: `1px solid ${COLOR.line}`, borderRadius: R.sm,
  overflow: 'hidden',
};

const capStyle: React.CSSProperties = {
  ...TYPE.micro, color: COLOR.mut, textAlign: 'center', padding: '5px 4px 7px',
  fontFamily: FONT.display, lineHeight: 1.4,
};

export function PlayerCard({ subject, size, bare, caption }: {
  readonly subject: Subject; readonly size: number;
  readonly bare: boolean; readonly caption: React.ReactNode;
}) {
  return (
    <figure style={{ ...cardStyle, width: size, margin: 0 }}>
      <IllustratedPortrait profile={subject.profile} px={size} bare={bare} />
      <figcaption style={capStyle}>{caption}</figcaption>
    </figure>
  );
}

export function PlayerCaption({ subject }: { readonly subject: Subject }) {
  const p = subject.profile;
  return (
    <>
      <div style={{ color: COLOR.tx, letterSpacing: '.08em' }}>
        {subject.position} <span style={{ color: COLOR.dim }}>|</span> {String(subject.age)}
      </div>
      <div style={{ color: COLOR.dim }}>{BUILD_LABEL[p.appearance.build]}</div>
    </>
  );
}

export function StructureCaption({ subject, index }: {
  readonly subject: Subject; readonly index: number;
}) {
  const sel = useMemo(
    () => selectFeatures(subject.profile, faceMorph(subject.profile)),
    [subject.profile],
  );
  return (
    <>
      <div style={{ color: COLOR.tx, letterSpacing: '.1em' }}>{String(index + 1).padStart(2, '0')}</div>
      <div style={{ color: COLOR.dim }}>{sel.head}</div>
      <div style={{ color: COLOR.dim }}>{skinBand(subject.profile.identity.skinStep)}</div>
    </>
  );
}

/** One variant of one family, on a fixed base face, so the only thing that
 *  changes between tiles is the thing being inspected. */
export function VariantTile({ base, override, label, size }: {
  readonly base: AvatarProfile;
  readonly override: Record<string, string>;
  readonly label: string;
  readonly size: number;
}) {
  return (
    <figure style={{ ...cardStyle, width: size, margin: 0 }}>
      <IllustratedPortrait profile={base} px={size} bare override={override} />
      <figcaption style={{ ...capStyle, fontSize: 9.5 }}>{label}</figcaption>
    </figure>
  );
}

/** A copy of a player wearing something else. Appearance is the changeable
 *  half of identity, so patching it is exactly what the profile model says is
 *  allowed -- and it means the hair library shows real hair on a real face
 *  rather than sixty-two detached silhouettes. */
export function withAppearance(
  base: AvatarProfile, patch: Partial<AvatarProfile['appearance']>,
): AvatarProfile {
  return { ...base, appearance: { ...base.appearance, ...patch } };
}

export function HairTile({ profile, label, size }: {
  readonly profile: AvatarProfile; readonly label: string; readonly size: number;
}) {
  return (
    <figure style={{ ...cardStyle, width: size, margin: 0 }}>
      <IllustratedPortrait profile={profile} px={size} />
      <figcaption style={{ ...capStyle, fontSize: 9.5 }}>{label}</figcaption>
    </figure>
  );
}

export function Grid({ children, gap = 10 }: {
  readonly children: React.ReactNode; readonly gap?: number;
}) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap }}>{children}</div>;
}
