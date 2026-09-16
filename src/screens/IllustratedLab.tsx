// /dev/illustrated-avatars
//
// Three sections, in the order the brief sets them, because that order is an
// argument: twenty finished players to judge the art direction, twenty bald
// men to judge whether the face is carrying the identity, and then every
// component individually so a weak asset can be named rather than sensed.
//
// Nothing here is wired into the game. The renderer exists, implements the
// same interface as the other three, and is deliberately not switched on.

import { useMemo } from 'react';
import { COLOR, FONT, TYPE } from '../app/tokens';
import {
  Grid, HairTile, PlayerCaption, PlayerCard, Section, StructureCaption,
  VariantTile, cohort, seedAt, withAppearance,
} from './illustratedParts';
import { generateAvatar } from '../../supabase/functions/_shared/avatar/generate';
import { distance, signature } from '../../supabase/functions/_shared/avatar/unique';
import { HEAD_SHAPES } from '../avatar/illustrated/heads/shapes';
import { EYE_SPECS } from '../avatar/illustrated/eyes/constructions';
import { BROW_SPECS } from '../avatar/illustrated/brows/constructions';
import { NOSE_SPECS } from '../avatar/illustrated/noses/constructions';
import { MOUTH_SPECS } from '../avatar/illustrated/mouths/constructions';
import { EAR_SPECS } from '../avatar/illustrated/ears/constructions';
import { HAIR_STYLES } from '../avatar/illustrated/hair/styles';
import { FACIAL_HAIR_STYLES } from '../avatar/illustrated/facialHair/styles';
import { selectFeatures } from '../avatar/illustrated/select';
import { faceMorph } from '../../supabase/functions/_shared/avatar/morph';

const FAMILIES = [
  { kind: 'head', label: 'Head', items: HEAD_SHAPES },
  { kind: 'eyes', label: 'Eyes', items: EYE_SPECS },
  { kind: 'brows', label: 'Eyebrows', items: BROW_SPECS },
  { kind: 'nose', label: 'Noses', items: NOSE_SPECS },
  { kind: 'mouth', label: 'Mouths', items: MOUTH_SPECS },
  { kind: 'ears', label: 'Ears', items: EAR_SPECS },
] as const;

export function IllustratedLab() {
  const complete = useMemo(() => cohort('illustrated-complete', 20), []);
  const bald = useMemo(() => cohort('illustrated-bald', 20), []);
  const base = useMemo(
    () => generateAvatar({ seed: seedAt('library-base', 3), position: 'WR', age: 26 }),
    [],
  );

  const stats = useMemo(() => {
    let closest = 99;
    for (let a = 0; a < bald.length; a += 1) {
      for (let b = a + 1; b < bald.length; b += 1) {
        const x = bald[a];
        const y = bald[b];
        if (x === undefined || y === undefined) continue;
        closest = Math.min(closest, distance(x.profile.identity, y.profile.identity));
      }
    }
    const heads = new Set(bald.map((s) => selectFeatures(s.profile, faceMorph(s.profile)).head));
    return {
      distinct: new Set(bald.map((s) => signature(s.profile.identity))).size,
      heads: heads.size,
      closest,
    };
  }, [bald]);

  return (
    <div style={{
      width: '100vw', marginLeft: 'calc(50% - 50vw)', boxSizing: 'border-box',
      padding: 20, background: COLOR.ink, minHeight: '100vh',
    }}
    >
      <h1 style={{ ...TYPE.display, color: COLOR.tx, margin: 0 }}>Illustrated avatars</h1>
      <p style={{ ...TYPE.prose, color: COLOR.mut, maxWidth: 760, margin: '8px 0 0', fontSize: 13 }}>
        Original 2D illustration, drawn entirely in SVG from the existing identity system. No
        photographs, no external artwork, no 3D. Twenty-two head silhouettes, fourteen eye
        constructions, eighteen noses, fourteen mouths, twelve brows, seven ears, sixty-two
        hairstyles and twenty-seven beards, selected by nearest match against the morph
        dimensions each family expresses &mdash; so the drawing agrees with the data rather
        than hashing past it.
      </p>

      <Section
        title="20 complete players"
        note="Different hair, facial hair, skin pigmentation, face structures, ages and positions. One art style, one light, one camera. Fictional characters throughout."
      >
        <Grid gap={12}>
          {complete.map((s) => (
            <PlayerCard
              key={s.profile.seed} subject={s} size={168} bare={false}
              caption={<PlayerCaption subject={s} />}
            />
          ))}
        </Grid>
      </Section>

      <Section
        title="20 bald men"
        note="No hair, no facial hair, no accessories, identical jersey, identical background. The face itself has to create the identity, and if these twenty read as one man nothing above this line counts."
      >
        <div style={{ ...TYPE.micro, color: COLOR.mut, marginBottom: 10, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <span>{`${String(stats.distinct)} of 20 distinct structural signatures`}</span>
          <span>{`${String(stats.heads)} of 22 head silhouettes in use`}</span>
          <span>{`closest pair ${String(stats.closest)} of 47`}</span>
        </div>
        <Grid gap={12}>
          {bald.map((s, i) => (
            <PlayerCard
              key={s.profile.seed} subject={s} size={168} bare
              caption={<StructureCaption subject={s} index={i} />}
            />
          ))}
        </Grid>
      </Section>

      <Section
        title="Feature library"
        note="Every implemented variant, on one base face, so a weak asset can be named instead of sensed. Only the named family changes between tiles in each row."
      >
        {FAMILIES.map((family) => (
          <div key={family.kind} style={{ marginBottom: 18 }}>
            <h3 style={{
              fontFamily: FONT.display, color: COLOR.mut, fontSize: 13, margin: '0 0 8px',
              textTransform: 'uppercase', letterSpacing: '.1em',
            }}
            >
              {family.label} · {String(family.items.length)}
            </h3>
            <Grid gap={8}>
              {family.items.map((item) => (
                <VariantTile
                  key={item.id} base={base} size={112}
                  override={{ [family.kind]: item.id }} label={item.id}
                />
              ))}
            </Grid>
          </div>
        ))}

        <div style={{ marginBottom: 18 }}>
          <h3 style={{
            fontFamily: FONT.display, color: COLOR.mut, fontSize: 13, margin: '0 0 8px',
            textTransform: 'uppercase', letterSpacing: '.1em',
          }}
          >
            Hair · {String(HAIR_STYLES.length)}
          </h3>
          <Grid gap={8}>
            {HAIR_STYLES.map((h) => (
              <HairTile
                key={h.id} size={112} label={h.id}
                profile={withAppearance(base, { hairstyle: h.id, facialHair: 'clean', accessory: 'none' })}
              />
            ))}
          </Grid>
        </div>

        <div>
          <h3 style={{
            fontFamily: FONT.display, color: COLOR.mut, fontSize: 13, margin: '0 0 8px',
            textTransform: 'uppercase', letterSpacing: '.1em',
          }}
          >
            Facial hair · {String(FACIAL_HAIR_STYLES.length)}
          </h3>
          <Grid gap={8}>
            {FACIAL_HAIR_STYLES.map((f) => (
              <HairTile
                key={f.id} size={112} label={f.id}
                profile={withAppearance(base, { hairstyle: 'buzz', facialHair: f.id, accessory: 'none' })}
              />
            ))}
          </Grid>
        </div>
      </Section>
    </div>
  );
}
