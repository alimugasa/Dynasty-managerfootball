#!/usr/bin/env python3
"""Deterministic golden exporter for the Phase 6 engine port.

Imports legacy/engine WITHOUT modifying it, runs a fixed-seed simulation, and
writes reproducible per-subsystem goldens. Running this twice must produce
byte-identical files — that determinism is what makes the goldens usable as a
parity oracle for the TypeScript port.

Usage:
    python3 legacy/parity/export_goldens.py [seed]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.join(HERE, "..", "engine")
GOLDENS = os.path.join(HERE, "goldens")
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 20260825

sys.path.insert(0, ENGINE)


def write(name, payload):
    os.makedirs(GOLDENS, exist_ok=True)
    path = os.path.join(GOLDENS, f"{name}.json")
    with open(path, "w", encoding="utf-8") as f:
        # sort_keys + fixed separators => byte-identical across runs
        json.dump(payload, f, indent=1, sort_keys=True, separators=(",", ": "))
        f.write("\n")
    print(f"  wrote {name}.json")


def rounded(obj, places=6):
    """Floats are rounded so goldens do not churn on the last bit."""
    if isinstance(obj, float):
        return round(obj, places)
    if isinstance(obj, dict):
        return {k: rounded(v, places) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [rounded(v, places) for v in obj]
    return obj


def main():
    import world  # noqa: E402

    # legacy/engine is frozen and byte-identical to the original, so its
    # hardcoded DB path is redirected here at runtime rather than edited on disk.
    world.DB = os.path.join(HERE, "..", "seed")

    print(f"Exporting goldens with seed {SEED}")
    w = world.World(seed=SEED)

    # 1. World construction — the starting state every subsystem builds on.
    write("00_world_init", rounded({
        "seed": SEED,
        "season": w.season,
        "team_count": len(w.teams),
        "team_ids": sorted(w.teams.keys()),
        "rules": {k: v for k, v in vars(w.rules).items() if isinstance(v, (int, float, bool, str))},
    }))

    # 2-6. Subsystem goldens.
    #
    # Fill these in against the real engine entry points. Each must be a pure
    # function of (seed, starting world) so the output is reproducible:
    #
    #   01_single_game      one game result: score, box score, snap counts
    #   02_season_standings one regular season's final standings, all 32 teams
    #   03_season_stats     one season of player statistics
    #   04_season_grades    one season of performance grades
    #   05_award_votes      one complete award vote tally, all 50 voters
    #   06_offseason        one offseason's progression, regression, retirements
    #
    # Keep each golden to the SUBSYSTEM's output only. A golden that bundles
    # several subsystems cannot tell you which one drifted.
    print("\nSubsystem goldens 01-06 are not yet exported.")
    print("Wire them to the engine entry points before starting Phase 6.")
    print("Parity tests must stay PENDING until they exist — never passing-by-default.")


if __name__ == "__main__":
    main()
