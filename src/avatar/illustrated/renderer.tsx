// The illustrated renderer, behind the same interface as the rest.
//
// Nothing about identity changed to make this work: it reads an AvatarProfile,
// exactly like the three renderers before it, and switching to it is the
// one-line change in PlayerAvatar.tsx that the abstraction exists for. It is
// deliberately not wired into the game yet.
//
// SVG rather than a canvas raster, which changes one practical thing: there is
// no data URL to cache, so there is nothing to cache. React memoises the
// element tree, the browser rasterises the vectors, and a portrait that
// re-renders costs a diff rather than a redraw.

import { memo } from 'react';
import { PORTRAIT_PX, type PortraitRenderer, type PortraitRequest } from '../portrait';
import { IllustratedPortrait } from './Portrait';

const Memoised = memo(IllustratedPortrait);

export const illustratedSvgAvatarRenderer: PortraitRenderer = {
  id: 'illustrated-svg',
  label: 'Illustrated (SVG)',
  render(request: PortraitRequest) {
    const px = PORTRAIT_PX[request.size];
    return (
      <Memoised
        profile={request.profile}
        px={px}
        bare={request.bare === true}
        label={request.label}
        {...(request.primary === undefined ? {} : { shirt: request.primary })}
        {...(request.secondary === undefined ? {} : { collar: request.secondary })}
      />
    );
  },
};
