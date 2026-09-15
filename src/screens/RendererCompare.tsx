// AVATAR RENDERER TEST
//
// The same AvatarProfile down two paths, side by side, so the question is
// about rendering and nothing else. Both columns are fed from the identical
// seed, position and age; the only difference is which AvatarRenderer is
// asked to draw.
//
// A development surface. No game screen uses V2.

import { useMemo, useState } from 'react';
import { COLOR, FONT, R, S, TYPE } from '../app/tokens';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import type { AvatarProfile } from '../../supabase/functions/_shared/avatar/profile';
import { skinBand } from '../../supabase/functions/_shared/avatar/skin';
import { BUILD_LABEL } from '../../supabase/functions/_shared/avatar/build';
import { ANCESTRY_LABEL } from '../../supabase/functions/_shared/avatar/ancestry';
import { portraitDataUrl } from '../avatar/raster/rasterRenderer';
import { portraitV2DataUrl } from '../avatar/v2/rendererV2';
import { distance, signature } from '../../supabase/functions/_shared/avatar/unique';

const seedAt = (batch: string, i: number): string => {
  let h = 0x811c9dc5;
  const text = `${batch}#${String(i)}`;
  for (let k = 0; k < text.length; k += 1) {
    h ^= text.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0;
  }
  const b = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return `${h.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
};

/** Twelve players chosen to cover the axes the brief names: pigment, facial
 *  structure, hair texture, hairstyle, facial hair, age and build. Picked by
 *  scanning seeds rather than by overriding the generator -- an overridden
 *  player proves nothing about what the generator does. */
interface Subject { profile: AvatarProfile; position: string; age: number; note: string }

const WANTED: readonly { position: string; age: number; note: string;
  want: (p: AvatarProfile) => boolean }[] = [
  { position: 'CB', age: 23, note: 'Deep pigment · coily · lean', want: (p) => p.identity.skinStep <= 8 && p.identity.hairTexture.startsWith('coily') },
  { position: 'OT', age: 31, note: 'Deep pigment · heavy build', want: (p) => p.identity.skinStep <= 10 && p.appearance.build === 'massive' },
  { position: 'WR', age: 26, note: 'Medium deep · full beard', want: (p) => p.identity.skinStep >= 12 && p.identity.skinStep <= 17 && p.appearance.facialHair.startsWith('beard') },
  { position: 'LB', age: 37, note: 'Medium deep · veteran', want: (p) => p.identity.skinStep >= 12 && p.identity.skinStep <= 18 },
  { position: 'QB', age: 22, note: 'Medium · rookie · clean', want: (p) => p.identity.skinStep >= 18 && p.identity.skinStep <= 23 && p.appearance.facialHair === 'clean' },
  { position: 'TE', age: 29, note: 'Medium · wavy hair', want: (p) => p.identity.skinStep >= 18 && p.identity.skinStep <= 24 && p.identity.hairTexture.startsWith('wavy') },
  { position: 'DT', age: 28, note: 'Light medium · massive', want: (p) => p.identity.skinStep >= 24 && p.identity.skinStep <= 29 },
  { position: 'S', age: 25, note: 'Light medium · fade', want: (p) => p.identity.skinStep >= 24 && p.identity.skinStep <= 30 && p.appearance.hairstyle.startsWith('fade') },
  { position: 'K', age: 34, note: 'Light · specialist', want: (p) => p.identity.skinStep >= 29 },
  { position: 'OG', age: 27, note: 'Light · straight hair', want: (p) => p.identity.skinStep >= 27 && p.identity.hairTexture.startsWith('straight') },
  { position: 'RB', age: 24, note: 'Mixed heritage', want: (p) => p.identity.ancestry.length === 2 },
  { position: 'EDGE', age: 30, note: 'Bald · prime', want: (p) => p.appearance.hairstyle === 'bald' || p.appearance.hairstyle === 'shaved' },
];

function cast(batch: string): readonly Subject[] {
  return WANTED.map((w, k) => {
    for (let i = 0; i < 4000; i += 1) {
      const profile = generateAvatar({ seed: seedAt(`${batch}-${String(k)}`, i), position: w.position, age: w.age });
      if (w.want(profile)) return { profile, position: w.position, age: w.age, note: w.note };
    }
    const profile = generateAvatar({ seed: seedAt(batch, k), position: w.position, age: w.age });
    return { profile, position: w.position, age: w.age, note: `${w.note} (no match)` };
  });
}

function Shot({ url, size }: { readonly url: string | null; readonly size: number }) {
  if (url === null) {
    return (
      <div style={{ width: size, height: size, borderRadius: size * 0.2, background: COLOR.raise,
        display: 'grid', placeItems: 'center', color: COLOR.dim, fontSize: 11 }}
      >
        no canvas
      </div>
    );
  }
  return <img src={url} width={size} height={size} alt=""
    style={{ display: 'block', width: size, height: size, borderRadius: size * 0.2 }} />;
}

export function RendererCompare() {
  const [batch, setBatch] = useState('compare');
  const subjects = useMemo(() => cast(batch), [batch]);
  const bare = useMemo(() => {
    const out: Subject[] = [];
    for (let i = 0; out.length < 20 && i < 4000; i += 1) {
      const position = ['CB', 'WR', 'QB', 'TE', 'OG', 'DT', 'LB', 'S'][out.length % 8] as string;
      out.push({
        profile: generateAvatar({ seed: seedAt(`${batch}-bare`, i), position, age: 22 + (i * 5) % 16 }),
        position, age: 22 + (i * 5) % 16, note: '',
      });
    }
    return out;
  }, [batch]);

  const stats = useMemo(() => {
    let closest = Number.POSITIVE_INFINITY;
    for (let a = 0; a < bare.length; a += 1) {
      for (let b = a + 1; b < bare.length; b += 1) {
        const dd = distance((bare[a] as Subject).profile.identity, (bare[b] as Subject).profile.identity);
        if (dd < closest) closest = dd;
      }
    }
    return { distinct: new Set(bare.map((s) => signature(s.profile.identity))).size, closest };
  }, [bare]);

  const head: React.CSSProperties = {
    ...TYPE.micro, color: COLOR.mut, textTransform: 'uppercase', letterSpacing: '.08em',
  };

  return (
    <div style={{ padding: S[4], maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontFamily: FONT.display, color: COLOR.tx, fontSize: 28, margin: 0,
        textTransform: 'uppercase', letterSpacing: '.04em' }}
      >
        Avatar Renderer Test
      </h1>
      <p style={{ ...TYPE.micro, color: COLOR.mut, marginTop: 6, maxWidth: 720 }}>
        The same AvatarProfile through both renderers. Left is the current painted vector
        renderer the game ships. Right is AvatarRendererV2, which builds a depth map of the
        face, derives surface normals and cavity occlusion from it, and lights every pixel
        with one rig. No game screen uses V2.
      </p>
      <div style={{ marginTop: S[3], maxWidth: 260 }}>
        <span style={{ ...head, display: 'block', marginBottom: 4 }}>Batch seed</span>
        <input
          aria-label="Batch seed" value={batch}
          onChange={(e) => { setBatch(e.target.value); }}
          style={{ background: COLOR.panel, color: COLOR.tx, border: `1px solid ${COLOR.line}`,
            borderRadius: R.sm, padding: '6px 9px', fontSize: 13, fontFamily: FONT.ui, width: '100%' }}
        />
      </div>

      <div style={{ display: 'grid', gap: 14, marginTop: S[5] }} data-testid="compare-grid">
        <div style={{ display: 'grid', gridTemplateColumns: '176px 176px 1fr', gap: 14, alignItems: 'center' }}>
          <span style={head}>Current</span>
          <span style={{ ...head, color: COLOR.amber }}>V2 relief</span>
          <span style={head}>Same profile</span>
        </div>
        {subjects.map((s) => (
          <div key={s.profile.seed}
            style={{ display: 'grid', gridTemplateColumns: '176px 176px 1fr', gap: 14,
              alignItems: 'center', borderTop: `1px solid ${COLOR.line}`, paddingTop: 12 }}
          >
            <Shot url={portraitDataUrl(s.profile, 176, false, '#2C4A6E')} size={176} />
            <Shot url={portraitV2DataUrl(s.profile, 176, false, '#2C4A6E')} size={176} />
            <div style={{ ...TYPE.micro, color: COLOR.dim, lineHeight: 1.5 }}>
              <div style={{ color: COLOR.tx, fontSize: 13 }}>{s.note}</div>
              <div>{`${s.position} · age ${String(s.age)} · ${BUILD_LABEL[s.profile.appearance.build]}`}</div>
              <div>{s.profile.identity.ancestry.map((a) => ANCESTRY_LABEL[a]).join(' + ')}</div>
              <div>{`${skinBand(s.profile.identity.skinStep)} ${String(s.profile.identity.skinStep)} · ${s.profile.identity.undertone}`}</div>
              <div>{`${s.profile.appearance.hairstyle} · ${s.profile.identity.hairTexture}`}</div>
              <div>{`${s.profile.appearance.facialHair} · ${s.profile.identity.nose} · ${s.profile.identity.jaw}`}</div>
            </div>
          </div>
        ))}
      </div>

      <section style={{ marginTop: 44, paddingTop: 20, borderTop: `2px solid ${COLOR.amber}` }}>
        <h2 style={{ fontFamily: FONT.display, color: COLOR.amber, fontSize: 20, margin: 0,
          textTransform: 'uppercase', letterSpacing: '.05em' }}
        >
          V2 face-only test
        </h2>
        <p style={{ ...TYPE.micro, color: COLOR.mut, margin: '4px 0 6px', maxWidth: 720 }}>
          Twenty players with no hair, no facial hair and no accessories, in identical
          clothing under identical lighting on an identical background. If these read as
          twenty configurations of one template rather than twenty people, V2 has failed
          and nothing above this line matters.
        </p>
        <p style={{ ...TYPE.micro, color: COLOR.dim, margin: '0 0 12px' }}>
          {`${String(stats.distinct)} distinct structural signatures · closest pair ${String(stats.closest)} of 47`}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }} data-testid="v2-face-only">
          {bare.map((s) => (
            <Shot key={s.profile.seed} url={portraitV2DataUrl(s.profile, 168, true, '#232b33')} size={168} />
          ))}
        </div>
      </section>
    </div>
  );
}
