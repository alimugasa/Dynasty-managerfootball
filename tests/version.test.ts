// The version on the front door is the version in package.json.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, VERSION_LABEL } from '../src/app/version';

describe('the advertised version', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('prints with a leading v', () => {
    expect(VERSION_LABEL).toBe(`v${APP_VERSION}`);
  });
});
