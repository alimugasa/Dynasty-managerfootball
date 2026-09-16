// The dev surface that stands in for the twelve demonstration portraits.
//
// There is no artwork to draw them with, so what it has to prove is the part
// that does exist: twelve players, each resolved to a real set of asset
// requirements, and an unmissable statement that the library is empty rather
// than broken.

import { describe as suite, afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PortraitPlanScreen } from '../../src/screens/PortraitPlan';
import { resetLibrary, useLibraryForTest } from '../../src/avatar/hybrid/library';

const shipped: unknown = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/avatar-assets/manifest.json'), 'utf8'),
);

afterEach(() => { cleanup(); resetLibrary(); });

suite('/dev/portraits', () => {
  it('says the library is empty, and says it is expected', () => {
    useLibraryForTest(shipped);
    render(<PortraitPlanScreen />);
    expect(screen.getByText(/Library empty/i)).toBeTruthy();
  });

  it('resolves twelve players and lists what each of them is missing', () => {
    useLibraryForTest(shipped);
    render(<PortraitPlanScreen />);
    const grid = screen.getByTestId('portrait-plan-grid');
    expect(grid.childElementCount).toBe(12);
    // Every one of them needs a base set: that is the whole finding.
    expect(screen.getAllByText(/base-face/).length).toBe(12);
  });

  it('reports a rejected manifest with its faults rather than drawing anyway', () => {
    const bad = JSON.parse(JSON.stringify(shipped)) as Record<string, unknown>;
    delete (bad['anchors'] as Record<string, unknown>)['eyeY'];
    useLibraryForTest(bad);
    render(<PortraitPlanScreen />);
    expect(screen.getByText(/Manifest rejected/i)).toBeTruthy();
    expect(screen.getAllByText(/eyeY/).length).toBeGreaterThan(0);
  });
});
