// The index of the portrait library, and the rules it has to satisfy.
//
// The manifest is the only thing the game knows about the asset directory. A
// file on disk with no entry here is invisible; an entry here with no file is
// a fault the loader reports rather than a face the compositor invents.
//
// Validation is strict on purpose, and the purpose is rule 3 of
// ARCHITECTURE.md: missing data is reported, never invented. A manifest
// missing an anchor could be defaulted to "probably 0.395" and the whole
// library would then sit two pixels wrong forever, silently. It is rejected
// instead, with the reason, and nothing draws.
//
// See docs/AVATAR-ASSET-SPEC.md for what each field means to the artist.

/** Where the head sits in the frame. Fractions of canvas size. Every layer of
 *  every kind is authored against these, which is the entire reason a hair
 *  file painted for one base face composites onto another. */
export interface AssetAnchors {
  readonly crownY: number;
  readonly eyeY: number;
  readonly chinY: number;
  readonly eyeCentreX: number;
  readonly eyeSpanX: number;
  readonly shoulderY: number;
}

/** A point on the 36-step skin scale that was *painted* rather than tinted. */
export interface PigmentAnchor {
  readonly id: string;
  readonly step: number;
}

export type AgeBand = 'prime' | 'veteran';

export interface BaseFaceAsset {
  readonly id: string;
  /** Which of the twelve structure families, `s0`..`s11`. */
  readonly structure: string;
  readonly pigment: string;
  readonly age: AgeBand;
  readonly albedo: string;
  readonly shading: string;
  readonly mask: string;
}

export interface HairAsset {
  readonly id: string;
  /** The hairstyle ids from _shared/avatar/hair.ts this file serves. One file
   *  covers several styles; the manifest says which, so the compositor never
   *  has to guess from a name. */
  readonly styles: readonly string[];
  readonly family: string;
  /** The mass behind the skull. Null for a shaved crown or a tight fade that
   *  has nothing behind the silhouette. */
  readonly back: string | null;
  readonly front: string;
}

export interface FacialHairAsset {
  readonly id: string;
  readonly styles: readonly string[];
  readonly file: string;
}

/** Complexion, age and accessory layers are all the same shape: one tintless
 *  file, laid over the face at an authored strength. */
export interface OverlayAsset {
  readonly id: string;
  readonly file: string;
  /** 0-1, the strength the artist intends at full effect. */
  readonly strength: number;
}

export interface ClothingAsset {
  readonly id: string;
  /** Build ids from _shared/avatar/build.ts. */
  readonly builds: readonly string[];
  readonly back: string;
  readonly front: string;
}

export interface BackgroundAsset {
  readonly id: string;
  readonly file: string;
}

export interface AssetManifest {
  readonly version: number;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly anchors: AssetAnchors;
  readonly pigmentAnchors: readonly PigmentAnchor[];
  readonly baseFaces: readonly BaseFaceAsset[];
  readonly hair: readonly HairAsset[];
  readonly facialHair: readonly FacialHairAsset[];
  readonly complexion: readonly OverlayAsset[];
  readonly age: readonly OverlayAsset[];
  readonly accessories: readonly OverlayAsset[];
  readonly clothing: readonly ClothingAsset[];
  readonly background: readonly BackgroundAsset[];
}

export const MANIFEST_VERSION = 1;

export type ManifestResult =
  | { readonly ok: true; readonly manifest: AssetManifest }
  | { readonly ok: false; readonly problems: readonly string[] };

/* ---------------------------------------------------------- validation --- */

type Bag = Record<string, unknown>;

const isBag = (v: unknown): v is Bag =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

class Check {
  readonly problems: string[] = [];

  fail(where: string, what: string): void {
    this.problems.push(`${where}: ${what}`);
  }

  str(bag: Bag, key: string, where: string): string {
    const v = bag[key];
    if (typeof v !== 'string' || v.trim() === '') {
      this.fail(where, `"${key}" must be a non-empty string`);
      return '';
    }
    return v;
  }

  /** A path, which must be relative: an absolute or off-origin URL in a
   *  manifest is somebody else's server, and the library is ours. */
  path(bag: Bag, key: string, where: string): string {
    const v = this.str(bag, key, where);
    if (v !== '' && (v.startsWith('/') || v.includes('://') || v.includes('..'))) {
      this.fail(where, `"${key}" must be a relative path inside the library`);
      return '';
    }
    return v;
  }

  num(bag: Bag, key: string, where: string, lo: number, hi: number): number {
    const v = bag[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
      this.fail(where, `"${key}" must be a number in [${String(lo)}, ${String(hi)}]`);
      return lo;
    }
    return v;
  }

  ids(bag: Bag, key: string, where: string): readonly string[] {
    const v = bag[key];
    if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== 'string')) {
      this.fail(where, `"${key}" must be a non-empty array of ids`);
      return [];
    }
    return v as readonly string[];
  }

  /** Every layer array must be present, even when empty. An absent array is a
   *  manifest that forgot a layer kind; an empty one is a library that has not
   *  been painted yet. Those are different facts and the loader keeps them
   *  apart. */
  list(bag: Bag, key: string): readonly Bag[] {
    const v = bag[key];
    if (!Array.isArray(v)) {
      this.fail('manifest', `"${key}" must be an array (use [] when empty)`);
      return [];
    }
    const rows = v.filter(isBag);
    if (rows.length !== v.length) this.fail(key, 'every entry must be an object');
    return rows;
  }

  unique(ids: readonly string[], key: string): void {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) this.fail(key, `duplicate id "${id}"`);
      seen.add(id);
    }
  }
}

const ANCHOR_KEYS = ['crownY', 'eyeY', 'chinY', 'eyeCentreX', 'eyeSpanX', 'shoulderY'] as const;

function overlays(c: Check, raw: readonly Bag[], key: string): readonly OverlayAsset[] {
  const out = raw.map((r, i) => {
    const where = `${key}[${String(i)}]`;
    return {
      id: c.str(r, 'id', where),
      file: c.path(r, 'file', where),
      strength: c.num(r, 'strength', where, 0, 1),
    };
  });
  c.unique(out.map((o) => o.id), key);
  return out;
}

/**
 * Parse a manifest, or say why not.
 *
 * Never throws and never half-succeeds: either every field checked out, or the
 * caller gets the complete list of what did not. Reporting all the problems
 * rather than the first one is deliberate — an artist fixing a delivery should
 * get one list, not eight rounds.
 */
export function parseManifest(input: unknown): ManifestResult {
  const c = new Check();
  if (!isBag(input)) return { ok: false, problems: ['manifest: not an object'] };

  const version = input['version'];
  if (version !== MANIFEST_VERSION) {
    c.fail('manifest', `"version" must be ${String(MANIFEST_VERSION)}`);
  }

  const canvasRaw = input['canvas'];
  const canvas = isBag(canvasRaw)
    ? {
        width: c.num(canvasRaw, 'width', 'canvas', 64, 4096),
        height: c.num(canvasRaw, 'height', 'canvas', 64, 4096),
      }
    : (c.fail('canvas', 'missing'), { width: 0, height: 0 });
  if (canvas.width !== canvas.height) c.fail('canvas', 'must be square');

  const anchorRaw = input['anchors'];
  const anchorBag = isBag(anchorRaw) ? anchorRaw : (c.fail('anchors', 'missing'), {});
  const anchors = Object.fromEntries(
    ANCHOR_KEYS.map((k) => [k, c.num(anchorBag, k, 'anchors', 0, 1)]),
  ) as unknown as AssetAnchors;
  if (anchors.crownY >= anchors.eyeY || anchors.eyeY >= anchors.chinY) {
    c.fail('anchors', 'crownY < eyeY < chinY must hold');
  }

  const pigmentAnchors = c.list(input, 'pigmentAnchors').map((r, i) => ({
    id: c.str(r, 'id', `pigmentAnchors[${String(i)}]`),
    step: c.num(r, 'step', `pigmentAnchors[${String(i)}]`, 0, 35),
  }));
  if (pigmentAnchors.length === 0) c.fail('pigmentAnchors', 'at least one anchor is required');
  c.unique(pigmentAnchors.map((p) => p.id), 'pigmentAnchors');
  const pigmentIds = new Set(pigmentAnchors.map((p) => p.id));

  const baseFaces = c.list(input, 'baseFaces').map((r, i) => {
    const where = `baseFaces[${String(i)}]`;
    const pigment = c.str(r, 'pigment', where);
    if (pigment !== '' && !pigmentIds.has(pigment)) {
      c.fail(where, `"pigment" is not a declared anchor: "${pigment}"`);
    }
    const age = c.str(r, 'age', where);
    if (age !== 'prime' && age !== 'veteran') c.fail(where, '"age" must be prime or veteran');
    return {
      id: c.str(r, 'id', where),
      structure: c.str(r, 'structure', where),
      pigment,
      age: (age === 'veteran' ? 'veteran' : 'prime') as AgeBand,
      albedo: c.path(r, 'albedo', where),
      shading: c.path(r, 'shading', where),
      mask: c.path(r, 'mask', where),
    };
  });
  c.unique(baseFaces.map((b) => b.id), 'baseFaces');

  const hair = c.list(input, 'hair').map((r, i) => {
    const where = `hair[${String(i)}]`;
    const back = r['back'];
    if (back !== null && typeof back !== 'string') {
      c.fail(where, '"back" must be a path or null');
    }
    return {
      id: c.str(r, 'id', where),
      styles: c.ids(r, 'styles', where),
      family: c.str(r, 'family', where),
      back: typeof back === 'string' ? c.path(r, 'back', where) : null,
      front: c.path(r, 'front', where),
    };
  });
  c.unique(hair.map((h) => h.id), 'hair');

  const facialHair = c.list(input, 'facialHair').map((r, i) => {
    const where = `facialHair[${String(i)}]`;
    return {
      id: c.str(r, 'id', where),
      styles: c.ids(r, 'styles', where),
      file: c.path(r, 'file', where),
    };
  });
  c.unique(facialHair.map((f) => f.id), 'facialHair');

  const clothing = c.list(input, 'clothing').map((r, i) => {
    const where = `clothing[${String(i)}]`;
    return {
      id: c.str(r, 'id', where),
      builds: c.ids(r, 'builds', where),
      back: c.path(r, 'back', where),
      front: c.path(r, 'front', where),
    };
  });
  c.unique(clothing.map((x) => x.id), 'clothing');

  const background = c.list(input, 'background').map((r, i) => ({
    id: c.str(r, 'id', `background[${String(i)}]`),
    file: c.path(r, 'file', `background[${String(i)}]`),
  }));
  c.unique(background.map((b) => b.id), 'background');

  const manifest: AssetManifest = {
    version: MANIFEST_VERSION,
    canvas,
    anchors,
    pigmentAnchors,
    baseFaces,
    hair,
    facialHair,
    complexion: overlays(c, c.list(input, 'complexion'), 'complexion'),
    age: overlays(c, c.list(input, 'age'), 'age'),
    accessories: overlays(c, c.list(input, 'accessories'), 'accessories'),
    clothing,
    background,
  };

  if (c.problems.length > 0) return { ok: false, problems: c.problems };
  return { ok: true, manifest };
}

/** True when the manifest is valid but has no anatomy in it — which is the
 *  state this repository is in, and is not the same thing as broken. */
export const isEmptyLibrary = (m: AssetManifest): boolean => m.baseFaces.length === 0;
