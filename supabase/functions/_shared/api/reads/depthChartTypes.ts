export interface DepthPlayerOut {
  readonly playerId: string; readonly name: string; readonly position: string;
  readonly age: number; readonly overall: number; readonly rosterStatus: string;
  readonly out: number | null; readonly rank: number;
  readonly role: 'Starter' | 'Backup' | 'Reserve' | 'Specialist';
  readonly persisted: boolean;
}
export interface DepthGroupOut {
  readonly group: string; readonly startingPlaces: number; readonly available: number;
  readonly startersSet: number; readonly injuredStarters: number; readonly needsSave: boolean;
  readonly warnings: readonly string[]; readonly order: readonly DepthPlayerOut[];
}
export interface DepthChartOut {
  readonly revision: string; readonly phase: string; readonly season: number; readonly week: number;
  readonly rosterCount: number; readonly rosterTarget: number; readonly countEnforced: boolean;
  readonly rosterFault: string | null; readonly blockers: readonly string[];
  readonly warnings: readonly string[]; readonly groups: readonly DepthGroupOut[];
  readonly chartSaved: boolean; readonly startersSet: number; readonly startingPlaces: number;
  readonly injuredStarters: number; readonly canFinalize: boolean;
  readonly action: 'FINALIZE' | 'PLAY' | 'CAMP' | 'OFFSEASON';
  readonly nextGame: { readonly gameId: string; readonly week: number; readonly opponentId: string;
    readonly opponentName: string; readonly home: boolean; readonly competition: string } | null;
}
