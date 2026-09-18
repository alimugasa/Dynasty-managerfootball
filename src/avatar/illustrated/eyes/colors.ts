// Eye colour, as colour.
//
// The identity system stores an id -- 'dark-brown', 'hazel', 'grey-blue' --
// because an id is what belongs in a save file. A renderer that passes that id
// straight to an SVG fill gets whatever CSS makes of it, and CSS has opinions:
// `brown` is a red, `grey` is a grey, and `dark-brown` is not a colour at all
// and silently renders black. Every eye in the first draft of this renderer was
// wrong for exactly that reason.

export interface EyeColour {
  readonly iris: string;
  /** The ring at the edge of the iris. Every real eye has one and it is most
   *  of what makes an iris look like an iris rather than a dot. */
  readonly limbal: string;
}

const EYE_COLOURS: Readonly<Record<string, EyeColour>> = {
  'dark-brown': { iris: '#42291a', limbal: '#1c1009' },
  brown: { iris: '#5d3a1f', limbal: '#2a1809' },
  'light-brown': { iris: '#7d5227', limbal: '#3a230d' },
  hazel: { iris: '#7a6a33', limbal: '#33290f' },
  amber: { iris: '#9a6f24', limbal: '#412c0b' },
  green: { iris: '#4f6b46', limbal: '#22301d' },
  blue: { iris: '#4a6c86', limbal: '#1f3243' },
  'grey-blue': { iris: '#66798a', limbal: '#2c3844' },
  grey: { iris: '#6e6f6c', limbal: '#313231' },
  heterochromic: { iris: '#5d3a1f', limbal: '#2a1809' },
};

export const eyeColour = (id: string): EyeColour =>
  EYE_COLOURS[id] ?? (EYE_COLOURS['dark-brown'] as EyeColour);

/** The one trait that differs between a player's two eyes. */
export const heterochromicPair = (id: string): readonly [EyeColour, EyeColour] =>
  id === 'heterochromic'
    ? [eyeColour('brown'), eyeColour('blue')]
    : [eyeColour(id), eyeColour(id)];
