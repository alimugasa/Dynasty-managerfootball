// The lab's own pieces.
//
// Kept apart from the lab screen so the screen reads as a list of experiments
// rather than as a wall of plumbing. Nothing here is used by the game: this is
// a development surface, and the new renderer is deliberately wired only to
// it until the visual quality has been signed off.

import { useMemo } from 'react';
import { COLOR, FONT, TYPE } from '../app/tokens';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import type { AvatarProfile } from '../../supabase/functions/_shared/avatar/profile';
import { skinBand } from '../../supabase/functions/_shared/avatar/skin';
import { ANCESTRY_LABEL } from '../../supabase/functions/_shared/avatar/ancestry';
import { BUILD_LABEL } from '../../supabase/functions/_shared/avatar/build';
import { portraitDataUrl } from '../avatar/raster/rasterRenderer';

/** A seed shaped like the column's value, derived from a batch name so the
 *  same batch always yields the same hundred players. */
export function seedAt(batch: string, i: number): string {
  let h = 0x811c9dc5;
  const text = `${batch}#${String(i)}`;
  for (let k = 0; k < text.length; k += 1) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const b = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return `${h.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

export interface Subject {
  readonly profile: AvatarProfile;
  readonly position: string;
  readonly age: number;
}

const POSITIONS = [
  'QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C',
  'EDGE', 'DT', 'LB', 'CB', 'S', 'K', 'P', 'LS',
] as const;

/**
 * Scan seeds until `count` players satisfy `want`.
 *
 * Generation is cheap and seeds are endless, so the way to get eight players
 * who share a skin tone or a haircut is to look for them rather than to force
 * them: forcing would mean overriding the generator, and a row of overridden
 * players proves nothing about what the generator does.
 */
export function find(
  batch: string, count: number, want: (s: Subject) => boolean,
  shape: (i: number) => { position: string; age: number } = () => ({ position: 'WR', age: 26 }),
): readonly Subject[] {
  const out: Subject[] = [];
  for (let i = 0; i < 6000 && out.length < count; i += 1) {
    const { position, age } = shape(out.length);
    const profile = generateAvatar({ seed: seedAt(batch, i), position, age });
    const s = { profile, position, age };
    if (want(s)) out.push(s);
  }
  return out;
}

export const spread = (i: number): { position: string; age: number } => ({
  position: POSITIONS[i % POSITIONS.length] as string,
  age: 21 + (i * 5) % 18,
});

/* ----------------------------------------------------------- portraits --- */

export function Portrait({ subject, size, bare, shirt }: {
  readonly subject: Subject;
  readonly size: number;
  readonly bare: boolean;
  readonly shirt?: string;
}) {
  const url = useMemo(
    () => portraitDataUrl(subject.profile, size, bare, shirt),
    [subject.profile, size, bare, shirt],
  );
  if (url === null) {
    return (
      <div style={{
        width: size, height: size, borderRadius: size * 0.22,
        background: COLOR.raise, display: 'grid', placeItems: 'center', color: COLOR.dim,
      }}
      >
        no canvas
      </div>
    );
  }
  return (
    <img
      src={url} width={size} height={size} alt=""
      style={{ display: 'block', width: size, height: size, borderRadius: size * 0.22 }}
    />
  );
}

/** What a face is made of, printed underneath it. The point of the lab is
 *  being able to argue with the numbers, not just look at the picture. */
export function Traits({ subject }: { readonly subject: Subject }) {
  const p = subject.profile;
  const i = p.identity;
  return (
    <div style={{ ...TYPE.micro, color: COLOR.dim, marginTop: 5, lineHeight: 1.45 }}>
      <div style={{ color: COLOR.mut }}>
        {`${subject.position} · ${String(subject.age)} · ${BUILD_LABEL[p.appearance.build]}`}
      </div>
      <div>{i.ancestry.map((a) => ANCESTRY_LABEL[a]).join(' + ')}</div>
      <div>{`${skinBand(i.skinStep)} ${String(i.skinStep)} · ${i.undertone}`}</div>
      <div>{`${i.baseHead} · ${i.nose}`}</div>
      <div>{`${i.eyes} · ${i.lips} · ${i.jaw}`}</div>
      <div>{`${p.appearance.hairstyle} · ${i.hairTexture}`}</div>
      <div>{p.appearance.facialHair}</div>
    </div>
  );
}

export function Section({ title, note, children }: {
  readonly title: string;
  readonly note: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 34 }}>
      <h2 style={{
        fontFamily: FONT.display, color: COLOR.tx, fontSize: 17, margin: 0,
        textTransform: 'uppercase', letterSpacing: '.05em',
      }}
      >
        {title}
      </h2>
      <p style={{ ...TYPE.micro, color: COLOR.mut, margin: '4px 0 12px', maxWidth: 680 }}>
        {note}
      </p>
      {children}
    </section>
  );
}

export function Row({ subjects, size, bare, traits, shirt }: {
  readonly subjects: readonly Subject[];
  readonly size: number;
  readonly bare: boolean;
  readonly traits: boolean;
  readonly shirt?: string;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {subjects.map((s) => (
        <div key={s.profile.seed} style={{ width: size, minWidth: 0 }}>
          <Portrait subject={s} size={size} bare={bare} {...(shirt === undefined ? {} : { shirt })} />
          {traits && <Traits subject={s} />}
        </div>
      ))}
    </div>
  );
}
