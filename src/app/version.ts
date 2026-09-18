// The build's version, as the interface shows it.
//
// A second copy of package.json's version, for the same reason
// src/domain/phase.ts is a second copy of the server's phase list: the client
// bundle should not pull package.json in just to read one string, and a
// hand-kept copy that nothing checks drifts. tests/version.test.ts holds the
// two equal, so the front door cannot quietly advertise a version this build
// is not.

export const APP_VERSION = '0.1.0';

/** With the leading v the interface prints. */
export const VERSION_LABEL = `v${APP_VERSION}`;
