# avatar-assets

Runtime URL: `/avatar-assets/` — Vite serves everything under `public/` from
the site root, so this directory's path in the browser is exactly the one the
brief asked for.

**This directory is empty of artwork, deliberately.** The repository contains
no portrait assets and cannot produce any at the required quality; see
`docs/AVATAR-ASSET-SPEC.md` §2. Nothing here is a placeholder to be improved —
the compositor reports "cannot draw" and falls back to initials until real
artwork lands.

## What goes where

| Directory | Contents |
|---|---|
| `base-faces/` | `<family>-<pigment>-<age>/{albedo,shading,mask}.png` — the authored anatomy |
| `hair/` | `<id>/{back,front}.png` — neutral greyscale, tinted at composite time |
| `facial-hair/` | `<id>.png` — neutral greyscale, tinted at composite time |
| `complexion/` | `<id>.png` — freckling, moles, scarring, blotch |
| `age/` | `<id>.png` — lines, weathering, hollowing |
| `accessories/` | `<id>.png` — eye black, headband, chin strap |
| `clothing/` | `<id>/{back,front}.png` — shoulders behind, collar in front |
| `background/` | `<id>.png` — the studio sweep, the one opaque layer |

`manifest.json` is the index. A file on disk with no manifest entry is
invisible to the game. The schema is defined and strictly validated in
`src/avatar/hybrid/manifest.ts`: a missing anchor, a missing path or an
unknown layer kind invalidates the whole manifest rather than being defaulted.

Every asset must be an original fictional work with no likeness of, reference
to or derivation from any real person, and no real club marks. See
`docs/IP-POLICY.md`.
