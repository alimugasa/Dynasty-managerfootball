# Player avatars

Every player in a save has a face. There are several thousand of them in a
league and none of them is a photograph, a likeness, or derived from one.

## What this is, and what it is not

The shipped renderer is **code-generated layered vector portraiture**: an SVG
head and shoulders, assembled at draw time from the player's traits. It is not
photoreal, and this is worth saying plainly rather than leaving somebody to
discover it.

The reason is the project, not the ambition. There are no image assets anywhere
in this repository, no asset pipeline to add them to, no 3D, and
`docs/IP-POLICY.md` rules out the one cheap source of photoreal faces —
"Real player likenesses, photographs or derived portraits" are prohibited
without exception. The same reasoning produced `TeamMark.tsx`, which generates
club badges in code rather than shipping art.

What the architecture does guarantee is that a better renderer can replace this
one without touching a line of identity logic. See **The seam**, below.

## The shape of it

```
supabase/functions/_shared/avatar/     who a player is        (pure, no React)
  traits.ts      the libraries: skulls, noses, eyes, lips, ears, hairlines…
  skin.ts        36 continuous melanin steps x 4 undertones
  hair.ts        14 textures, 60+ styles, 17 colours, 26 facial-hair styles
  ancestry.ts    19 influences, the league mix, and how influences blend
  build.ts       7 builds and the position table that weights them
  seed.ts        one named random stream per trait, and the weighted draw
  profile.ts     AvatarProfile: permanent identity vs changeable appearance
  generate.ts    seed -> person
  unique.ts      signatures, distance, the registry, collision resolution

src/avatar/                            how a player is drawn  (React)
  portrait.ts       the PortraitRenderer interface and the size tiers
  geometry.ts       traits -> coordinates
  svgFeatures.tsx   eyes, brows, nose, mouth, ears, modelling
  svgHair.tsx       hair, facial hair, worn items
  svgPortrait.tsx   the shipped renderer: layer order and assembly
  cache.ts          profiles, keyed by seed
  PlayerAvatar.tsx  the component: lazy, cached, with the initials fallback
  PlayerFace.tsx    the two lines a screen adds
```

## The rules the design enforces structurally

These are not conventions anybody has to remember. Each one is true because of
how the code is shaped, which is why they are worth listing.

**No ancestry presets.** No trait in `traits.ts` knows anything about ancestry.
A nose is a nose. Ancestry only multiplies a weight the library already
assigned, so no feature is ever unavailable to anyone and there is no field
anywhere that could hold "a Black face" as a thing.

**Ancestry is not nationality.** The league stores no birthplace, nationality or
demographic column, and the generator reads none: it draws heritage from the
seed and records it in `players.heritage`. A name is not an ancestry and is
never consulted.

**Mixed heritage does not average.** `blendProfiles` takes the *maximum* of two
influences' weights rather than the mean, so a player of two backgrounds can
take strongly after either side, or neither. Averaging would pull every mixed
player toward one middle, which is the failure to avoid.

**Pigment does not touch geometry.** Skin is a step from 0 to 35 and an
undertone. Nothing in `geometry.ts` reads either.

**A seed always makes the same person.** Each trait draws from its own named
stream (`streamFor(seed, 'nose')`), not from one sequence. A single stream would
make every trait depend on how many draws preceded it, so adding a field would
silently change every face in every save already played.

**Age does not change who somebody is.** Nothing in `AvatarIdentity` is passed
an age, a season, a position or a team — it cannot drift, because it is given
nothing that moves. Ageing adds three numbers (`ageWear`, `recession`,
`greying`) to the appearance half, each a curve on age crossed with a tendency
drawn once from the seed.

**A haircut is not a new man.** Hairstyle, hair colour, facial hair, accessories
and expression all live in `AvatarAppearance`. Overriding them leaves the
signature untouched.

**Two faces on the same bones are clones.** `unique.ts` is deliberately blind to
hairstyle, hair colour and skin step. A uniqueness check that hashed every field
would happily call two identical faces distinct because one of them shaved.

## Determinism and the seed

`players.avatar_seed` is `sha256(save_id || ':' || player_id)`, set by a trigger
(`0037_avatar_seed_default.sql`) so that no insert site can forget it. It is a
stored column rather than something the client derives, because a commissioner
can edit it — a client that recomputed the hash would ignore every edit ever
made, and rule 3 forbids inventing a value that is actually on record.

A collision is resolved by salting the seed (`seed#1`, `seed#2`, …), which keeps
a resolved face exactly as reproducible as an unresolved one.

## Measured

Over four thousand generated players (`tests/avatar/uniqueness.test.ts`):

| | |
|---|---|
| duplicate structural signatures | 0 |
| near-duplicate pairs (distance < 9) | 0 |
| skin steps used | 36 of 36 |
| distinct heritage combinations | 153 |
| base heads used | 47 of 51 |

## Which renderer draws

`raster/` — painted portraits on a canvas, shaded from ~55 continuous facial
dimensions. `docs/AVATAR-RENDERING.md` explains why Canvas rather than SVG, art
assets or 3D, and what the honest ceiling of the approach is.

The old `svgPortrait` renderer is still in the tree and still implements the
same interface. Switching between them is the `RENDERER` constant in
`PlayerAvatar.tsx` and nothing else.

## The seam

`PortraitRenderer` in `src/avatar/portrait.ts` is the whole contract:

```ts
interface PortraitRenderer {
  id: string;
  label: string;
  render: (request: PortraitRequest) => ReactNode | null;
}
```

A request carries an `AvatarProfile`, a size tier and the club's colours.
`render` returning `null` is a supported answer, not a failure to handle: a
renderer that cannot draw a profile says so and the caller falls back to
initials, which is how "the UI never displays a broken image" is guaranteed
rather than hoped for.

Substituting a layered-art, pre-rendered or 3D renderer means writing a new
implementation of that interface and changing the `RENDERER` constant in
`PlayerAvatar.tsx`. Nothing under `_shared/avatar/` changes, because nothing
under `_shared/avatar/` knows a renderer exists.

## Sizes

| tier | px | detail |
|---|---|---|
| `thumb` | 28 | flat; fine detail drawn away rather than drawn small |
| `list` | 40 | flat |
| `card` | 64 | full |
| `profile` | 160 | full |
| `hero` | 240 | full |

`DETAIL_FLOOR` is 56px. Below it catchlights, nostrils, complexion marks and
hair texture are omitted — at 28px they are noise, not detail.

## Performance

`cache.ts` holds up to 600 generated profiles keyed on seed, position, age and
heritage. `PlayerAvatar` renders nothing until an `IntersectionObserver` says
the portrait is within 200px of the viewport (and renders immediately where
there is no observer, because a face too early costs nothing and a face that
never appears is a bug).

## Where faces appear

Wired: the depth chart (`RosterScreen`), the roster list and the player profile
header, the waiver wire and the free-agent pool, the transaction history, the
league leaders, the all-star and all-league honours, the trade block, the draft
board, the end-of-season awards night and the year recap.

The draft board is the odd one. A prospect has no `players` row — the class
lives in the engine document until somebody takes him — so there is no
`avatar_seed` column to read, and the `offseason` read computes it with the
same pgcrypto expression the trigger uses. That is a derivation rather than a
guess: a drafted prospect keeps his id (`engine/offseason/league.ts`), so it is
the seed his row will actually be given, and the man a manager scouted is the
man who turns up. `tests/api/avatars.test.ts` asserts that continuity after a
real draft, because the day it stops holding is the day the board starts lying.

Not yet wired: the news feed and the camp screens, which are not built. Each is
the same two lines — `useAvatars(ids)` and a `<PlayerFace>` — and the `avatars`
read already serves them.

One rule the panels follow, learned by breaking it: a panel that is rendered in
a test without a `SaveProvider` above it takes `avatars` as an optional prop
and never calls `useAvatars` itself. The screen owns the fetch; the panel draws
what it is handed. `HonoursPanel` fetched for itself in the first version and
took eight tests down with it.

## The lab

`/dev/avatars` generates up to 400 faces from a typed batch seed, with controls
for position, age band and size tier, a full trait readout under each face, and
a live count of distinct signatures, exact repeats and the closest pair in the
batch. It is a development surface outside the navigation stack: it reads no
save and writes nothing.

## Commissioner edits

`players.avatar_overrides` is a JSONB `AvatarOverrides`: an optional partial
identity and an optional partial appearance, applied over the generated profile
and never re-derived. A missing key means "no opinion"; a key present with a
null would be a value indistinguishable from an unset one, which the
architecture rules forbid. Removing an override returns the player to the face
he had, not to a new one.
