// Original icons, drawn here rather than pulled from a set.
//
// docs/IP-POLICY.md requires every icon to be original or to carry a permissive
// licence that explicitly allows commercial use in a paid application. These are
// plain geometry on a 24-unit grid, authored for this project, which settles the
// question rather than deferring it to a licence audit later.

import type { ReactNode } from 'react';

interface IconProps {
  readonly size?: number;
  readonly stroke?: string;
  /** Filled when the tab is the active one, so the state survives greyscale. */
  readonly active?: boolean;
}

function Frame({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const strokeProps = (stroke: string, active: boolean) => ({
  stroke,
  strokeWidth: active ? 2.1 : 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** Team: a shield. */
export function ShieldIcon({ size = 22, stroke = 'currentColor', active = false }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M12 3.2 4.8 6v5.6c0 4.2 2.9 7.6 7.2 9.2 4.3-1.6 7.2-5 7.2-9.2V6Z" {...strokeProps(stroke, active)} fill={active ? stroke : 'none'} fillOpacity={active ? 0.16 : 0} />
      <path d="M12 8.4v6.4" {...strokeProps(stroke, active)} />
    </Frame>
  );
}

/** League: standings, as stacked bars of unequal length. */
export function LeagueIcon({ size = 22, stroke = 'currentColor', active = false }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M4.6 6.4h14.8M4.6 12h10.6M4.6 17.6h7" {...strokeProps(stroke, active)} />
    </Frame>
  );
}

/** Schedule: a calendar grid. */
export function CalendarIcon({ size = 22, stroke = 'currentColor', active = false }: IconProps) {
  return (
    <Frame size={size}>
      <rect x="3.8" y="5.4" width="16.4" height="14.2" rx="2" {...strokeProps(stroke, active)} fill={active ? stroke : 'none'} fillOpacity={active ? 0.14 : 0} />
      <path d="M3.8 10h16.4M8.4 3.6v3.4M15.6 3.6v3.4" {...strokeProps(stroke, active)} />
    </Frame>
  );
}

/** Roster: a depth chart, as a column of ranked entries. */
export function RosterIcon({ size = 22, stroke = 'currentColor', active = false }: IconProps) {
  return (
    <Frame size={size}>
      <rect x="3.8" y="4.6" width="16.4" height="4.6" rx="1.4" {...strokeProps(stroke, active)} fill={active ? stroke : 'none'} fillOpacity={active ? 0.18 : 0} />
      <rect x="3.8" y="11.4" width="16.4" height="4.6" rx="1.4" {...strokeProps(stroke, active)} />
      <path d="M6.4 19.8h11.2" {...strokeProps(stroke, active)} />
    </Frame>
  );
}

/** Office: the front office, as a desk with a drawer. */
export function OfficeIcon({ size = 22, stroke = 'currentColor', active = false }: IconProps) {
  return (
    <Frame size={size}>
      <rect x="3.4" y="8.2" width="17.2" height="11.4" rx="2" {...strokeProps(stroke, active)} fill={active ? stroke : 'none'} fillOpacity={active ? 0.14 : 0} />
      <path d="M9 8.2V6a1.8 1.8 0 0 1 1.8-1.8h2.4A1.8 1.8 0 0 1 15 6v2.2" {...strokeProps(stroke, active)} />
      <path d="M3.4 13.4h17.2" {...strokeProps(stroke, active)} />
    </Frame>
  );
}

/** Back: a chevron. */
export function ChevronLeftIcon({ size = 20, stroke = 'currentColor' }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M14.4 5.6 8 12l6.4 6.4" {...strokeProps(stroke, false)} />
    </Frame>
  );
}

export function ChevronRightIcon({ size = 18, stroke = 'currentColor' }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M9.6 5.6 16 12l-6.4 6.4" {...strokeProps(stroke, false)} />
    </Frame>
  );
}

// ---------------------------------------------------------------- utilities
// The three quiet actions along the foot of the main menu. Drawn a hair
// thinner than the navigation icons: they sit at 15px beside 11px text and
// must read as secondary to the two buttons above them, not compete.

const thin = (stroke: string) => ({
  stroke,
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** Settings: two sliders. A gear at 15px is a smudge; sliders stay legible. */
export function SettingsIcon({ size = 15, stroke = 'currentColor' }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M4 8h16M4 16h16" {...thin(stroke)} />
      <circle cx="9" cy="8" r="2.4" {...thin(stroke)} />
      <circle cx="16" cy="16" r="2.4" {...thin(stroke)} />
    </Frame>
  );
}

/** Database tools: a cylinder, the shape every storage icon has settled on. */
export function DatabaseIcon({ size = 15, stroke = 'currentColor' }: IconProps) {
  return (
    <Frame size={size}>
      <ellipse cx="12" cy="6" rx="7" ry="2.8" {...thin(stroke)} />
      <path d="M5 6v12c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8V6" {...thin(stroke)} />
      <path d="M5 12c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8" {...thin(stroke)} />
    </Frame>
  );
}

/** Credits: a star. Recognition, without borrowing anyone's mark for it. */
export function CreditsIcon({ size = 15, stroke = 'currentColor' }: IconProps) {
  return (
    <Frame size={size}>
      <path
        d="M12 3.8l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 17.08l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85z"
        {...thin(stroke)}
      />
    </Frame>
  );
}
