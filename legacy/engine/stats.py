"""Permanent statistics + original performance grading.

Two hard separations enforced here:
  1. REGULAR_SEASON and PLAYOFFS never aggregate together.
  2. Performance grade is generated from a process model that is only partly
     driven by ability, and statistics are generated from grade plus luck.
     So OVR -> grade and grade -> stats are both loose, by construction.
"""
import os, csv, math, collections
import numpy as np

REG, PO = "REGULAR_SEASON", "PLAYOFFS"
ROUNDS = {19: "WILD_CARD", 20: "DIVISIONAL", 21: "CONFERENCE_CHAMPIONSHIP", 22: "SUPER_BOWL"}

# minimum snaps to qualify for leaderboards / All-Pro (section 19)
MIN_SNAPS = {"QB": 330, "RB": 200, "FB": 90, "WR": 330, "TE": 280, "OT": 500, "OG": 500,
             "C": 500, "EDGE": 330, "DT": 300, "LB": 350, "CB": 350, "S": 350,
             "K": 20, "P": 30, "LS": 20}
SNAPS_PER_GAME = {"QB": 64, "RB": 30, "FB": 12, "WR": 44, "TE": 40, "OT": 66, "OG": 66,
                  "C": 66, "EDGE": 44, "DT": 38, "LB": 46, "CB": 50, "S": 52,
                  "K": 6, "P": 5, "LS": 5}

GRADE_COMPONENTS = ["passing_grade", "rushing_grade", "receiving_grade",
                    "pass_block_grade", "run_block_grade", "pass_rush_grade",
                    "run_defense_grade", "coverage_grade", "tackling_grade",
                    "special_teams_grade"]
POS_COMPONENTS = {
    "QB": ["passing_grade", "rushing_grade"],
    "RB": ["rushing_grade", "receiving_grade", "pass_block_grade"],
    "FB": ["rushing_grade", "run_block_grade", "receiving_grade"],
    "WR": ["receiving_grade", "run_block_grade"],
    "TE": ["receiving_grade", "run_block_grade", "pass_block_grade"],
    "OT": ["pass_block_grade", "run_block_grade"],
    "OG": ["pass_block_grade", "run_block_grade"],
    "C": ["pass_block_grade", "run_block_grade"],
    "EDGE": ["pass_rush_grade", "run_defense_grade", "tackling_grade"],
    "DT": ["pass_rush_grade", "run_defense_grade", "tackling_grade"],
    "LB": ["run_defense_grade", "coverage_grade", "tackling_grade", "pass_rush_grade"],
    "CB": ["coverage_grade", "tackling_grade", "run_defense_grade"],
    "S": ["coverage_grade", "tackling_grade", "run_defense_grade"],
    "K": ["special_teams_grade"], "P": ["special_teams_grade"], "LS": ["special_teams_grade"],
}
COMPONENT_WEIGHT = {
    "QB": {"passing_grade": 0.88, "rushing_grade": 0.12},
    "RB": {"rushing_grade": 0.62, "receiving_grade": 0.28, "pass_block_grade": 0.10},
    "FB": {"rushing_grade": 0.30, "run_block_grade": 0.55, "receiving_grade": 0.15},
    "WR": {"receiving_grade": 0.90, "run_block_grade": 0.10},
    "TE": {"receiving_grade": 0.66, "run_block_grade": 0.24, "pass_block_grade": 0.10},
    "OT": {"pass_block_grade": 0.58, "run_block_grade": 0.42},
    "OG": {"pass_block_grade": 0.46, "run_block_grade": 0.54},
    "C": {"pass_block_grade": 0.48, "run_block_grade": 0.52},
    "EDGE": {"pass_rush_grade": 0.62, "run_defense_grade": 0.28, "tackling_grade": 0.10},
    "DT": {"pass_rush_grade": 0.46, "run_defense_grade": 0.44, "tackling_grade": 0.10},
    "LB": {"run_defense_grade": 0.36, "coverage_grade": 0.34, "tackling_grade": 0.20,
           "pass_rush_grade": 0.10},
    "CB": {"coverage_grade": 0.78, "tackling_grade": 0.12, "run_defense_grade": 0.10},
    "S": {"coverage_grade": 0.56, "tackling_grade": 0.22, "run_defense_grade": 0.22},
    "K": {"special_teams_grade": 1.0}, "P": {"special_teams_grade": 1.0},
    "LS": {"special_teams_grade": 1.0},
}

# grade scale: z-score -> 0-100. Calibrated so 90+ seasons are rare.
GRADE_MU, GRADE_SD = 62.0, 21.0   # calibrated: see validate_history.py


GRADE_KNEE, GRADE_SLOPE = 87.0, 0.66


def z_to_grade(z):
    """Linear through the middle, compressed at the top.

    Without the knee the scale clips: elite seasons all pile up at 99.9 and a
    genuinely historic year is indistinguishable from a merely excellent one.
    """
    g = GRADE_MU + GRADE_SD * z
    if g > GRADE_KNEE:
        g = GRADE_KNEE + (g - GRADE_KNEE) * GRADE_SLOPE
    return float(np.clip(g, 0.0, 99.9))


def season_form(w, p):
    """Drawn once per season. Ability tilts it; it does not determine it.

    This is the mechanism that lets a 79 OVR quarterback out-grade a 94 OVR one.
    """
    ovr_z = (p["ovr"] + p["mental"] - 72.0) / 9.0
    return 0.52 * ovr_z + 0.48 * float(w.rng.normal(0, 1.0))


def snap_grade_z(w, p, form, opp_strength):
    """Per-game process performance, independent of the box score."""
    return 0.70 * form - 0.10 * opp_strength + 0.72 * float(w.rng.normal(0, 1.0))


class StatStore:
    """Game logs stream to disk; season and career aggregates stay in memory.

    Holding every game log in RAM would be ~11M rows over 30 seasons. Season rows
    (~1,700 x seasons) are small enough to keep and are what every screen reads.
    """

    def __init__(self, outdir):
        self.outdir = outdir
        os.makedirs(outdir, exist_ok=True)
        self.game_buffer = []
        self.season_rows = []          # one row per player-season-team-competition
        self.grade_rows = []           # one row per player-season-team-competition
        self.game_grade_buffer = []
        self._headers_written = set()

    # ---- game level
    def add_game(self, row):
        self.game_buffer.append(row)

    def add_game_grade(self, row):
        self.game_grade_buffer.append(row)

    def flush_games(self, season):
        for name, buf in (("player_game_stats", self.game_buffer),
                          ("player_game_grades", self.game_grade_buffer)):
            if not buf:
                continue
            path = f"{self.outdir}/{name}.csv"
            cols = sorted({k for r in buf for k in r})
            new = name not in self._headers_written
            with open(path, "a", newline="", encoding="utf-8") as f:
                wr = csv.DictWriter(f, fieldnames=cols, restval="", extrasaction="ignore")
                if new:
                    wr.writeheader(); self._headers_written.add(name)
                wr.writerows(buf)
            buf.clear()


# ---------------------------------------------------------------- STAT GENERATION
def blank_line():
    return collections.defaultdict(float)


def gen_qb(w, p, box, tds, grade_z, snaps):
    s = blank_line()
    s["snaps"] = snaps; s["games"] = 1; s["starts"] = 1
    s["pass_att"] = box["att"]; s["completions"] = box["comps"]
    s["pass_yd"] = box["pass_yd"]; s["int"] = box["ints"]
    s["pass_td"] = int(w.rng.binomial(tds, 0.62))
    s["sacks_taken"] = box["sacks_taken"]
    s["sack_yards"] = int(box["sacks_taken"] * w.rng.normal(6.8, 1.2))
    # process stats keyed to grade, not to the box score
    s["big_time_throws"] = max(0, int(w.rng.normal(2.4 + grade_z * 1.5, 1.2)))
    s["turnover_worthy_plays"] = max(0, int(w.rng.normal(2.3 - grade_z * 1.4, 1.1)))
    s["throwaways"] = max(0, int(w.rng.normal(2.2, 1.1)))
    s["drops_by_receivers"] = max(0, int(w.rng.binomial(max(box["att"], 1), 0.042)))
    s["pressure_att"] = int(box["att"] * float(np.clip(w.rng.normal(0.33, 0.06), .12, .55)))
    s["pressure_comp"] = int(s["pressure_att"] * float(np.clip(w.rng.normal(0.47 + grade_z * .05, .09), .1, .85)))
    s["pressure_yd"] = int(s["pressure_comp"] * w.rng.normal(9.5, 2.0))
    s["clean_att"] = s["pass_att"] - s["pressure_att"]
    s["deep_att"] = int(box["att"] * float(np.clip(w.rng.normal(0.12, 0.035), .02, .28)))
    s["deep_comp"] = int(w.rng.binomial(max(s["deep_att"], 0),
                                        float(np.clip(0.39 + grade_z * .05, .05, .8))))
    s["play_action_att"] = int(box["att"] * float(np.clip(w.rng.normal(0.26, 0.06), .05, .5)))
    s["scrambles"] = max(0, int(w.rng.normal(2.6, 1.5)))
    s["rush_att"] = s["scrambles"] + max(0, int(w.rng.normal(1.8, 1.4)))
    s["rush_yd"] = int(max(-4, w.rng.normal(s["rush_att"] * 4.1, 9)))
    s["fumbles"] = int(w.rng.binomial(3, 0.045))
    s["fumbles_lost"] = int(w.rng.binomial(int(s["fumbles"]), 0.5))
    s["first_downs"] = int(box["comps"] * float(np.clip(w.rng.normal(0.50, .06), .3, .75)))
    return s


def passer_rating(att, cmp_, yd, td, ints):
    if att <= 0:
        return 0.0
    a = np.clip((cmp_ / att - 0.3) * 5, 0, 2.375)
    b = np.clip((yd / att - 3) * 0.25, 0, 2.375)
    c = np.clip((td / att) * 20, 0, 2.375)
    d = np.clip(2.375 - (ints / att * 25), 0, 2.375)
    return float((a + b + c + d) / 6 * 100)


def gen_skill(w, p, share, box, tds_avail, grade_z, snaps, is_rb):
    s = blank_line()
    s["snaps"] = snaps; s["games"] = 1
    if is_rb:
        s["rush_att"] = int(box["rushes"] * share)
        s["rush_yd"] = int(box["rush_yd"] * share)
        ybc = float(np.clip(w.rng.normal(2.5, 0.5), 0.4, 4.5))
        s["yards_before_contact"] = int(s["rush_att"] * ybc)
        s["yards_after_contact"] = max(0, s["rush_yd"] - s["yards_before_contact"])
        s["broken_tackles"] = max(0, int(w.rng.normal(1.6 + grade_z * 1.0, 0.9)))
        s["explosive_runs"] = int(w.rng.binomial(max(int(s["rush_att"]), 0), 0.075))
        s["fumbles"] = int(w.rng.binomial(max(int(s["rush_att"]), 1), 0.006))
        s["pass_block_snaps"] = int(w.rng.normal(6, 2.5))
        s["pressures_allowed"] = int(w.rng.binomial(max(int(s["pass_block_snaps"]), 0), 0.09))
    s["targets"] = int(box["att"] * share * (1.15 if not is_rb else 1.0))
    s["rec"] = int(min(s["targets"], box["comps"] * share))
    s["rec_yd"] = int(box["pass_yd"] * share)
    s["yac"] = int(s["rec_yd"] * float(np.clip(w.rng.normal(0.42, .10), .05, .85)))
    s["drops"] = int(w.rng.binomial(max(int(s["targets"]), 0),
                                    float(np.clip(0.055 - grade_z * 0.012, 0.005, 0.20))))
    s["routes"] = int(snaps * (0.86 if not is_rb else 0.35))
    s["contested_targets"] = int(w.rng.binomial(max(int(s["targets"]), 0), 0.17))
    s["contested_catches"] = int(w.rng.binomial(max(int(s["contested_targets"]), 0),
                                                float(np.clip(0.44 + grade_z * .06, .05, .9))))
    s["deep_targets"] = int(w.rng.binomial(max(int(s["targets"]), 0), 0.14))
    s["missed_tackles_forced"] = max(0, int(w.rng.normal(0.8 + grade_z * 0.5, 0.7)))
    s["first_downs"] = int(s["rec"] * float(np.clip(w.rng.normal(0.52, .08), .2, .85)))
    s["run_block_snaps"] = int(snaps * (0.30 if not is_rb else 0.10))
    return s


def gen_ol(w, p, grade_z, snaps, team_sacks_allowed, share):
    s = blank_line()
    s["snaps"] = snaps; s["games"] = 1; s["starts"] = 1
    s["pass_block_snaps"] = int(snaps * 0.56)
    s["run_block_snaps"] = snaps - s["pass_block_snaps"]
    prate = float(np.clip(w.rng.normal(0.052 - grade_z * 0.016, 0.016), 0.004, 0.16))
    s["pressures_allowed"] = int(w.rng.binomial(max(int(s["pass_block_snaps"]), 0), prate))
    s["sacks_allowed"] = float(min(s["pressures_allowed"],
                                   w.rng.binomial(max(team_sacks_allowed, 0), share)))
    s["hits_allowed"] = int(w.rng.binomial(max(int(s["pressures_allowed"]), 0), 0.22))
    s["hurries_allowed"] = max(0, s["pressures_allowed"] - s["sacks_allowed"] - s["hits_allowed"])
    s["pass_block_efficiency"] = round(100 - (s["pressures_allowed"] +
                                              s["sacks_allowed"] * 2.5) /
                                       max(s["pass_block_snaps"], 1) * 100, 1)
    s["penalties"] = int(w.rng.binomial(6, float(np.clip(0.10 - grade_z * .02, .01, .35))))
    s["run_block_wins"] = int(s["run_block_snaps"] *
                              float(np.clip(w.rng.normal(0.42 + grade_z * .06, .07), .1, .8)))
    s["run_block_losses"] = int(s["run_block_snaps"] *
                                float(np.clip(w.rng.normal(0.11 - grade_z * .03, .04), .01, .4)))
    return s


def gen_front(w, p, grade_z, snaps, sacks_credited):
    s = blank_line()
    s["snaps"] = snaps; s["games"] = 1
    s["pass_rush_snaps"] = int(snaps * 0.58)
    s["pressures"] = int(s["pass_rush_snaps"] *
                         float(np.clip(w.rng.normal(0.105 + grade_z * .035, .03), .005, .35)))
    s["sacks"] = float(sacks_credited)
    s["qb_hits"] = int(w.rng.binomial(max(int(s["pressures"]), 0), 0.28))
    s["hurries"] = max(0, s["pressures"] - s["sacks"] - s["qb_hits"])
    s["pass_rush_win_rate"] = round(float(np.clip(w.rng.normal(0.13 + grade_z * .04, .03),
                                                  .01, .45)), 3)
    s["tackles"] = max(0, int(w.rng.normal(3.2, 1.5)))
    s["solo"] = int(s["tackles"] * 0.65)
    s["assists"] = s["tackles"] - s["solo"]
    s["tfl"] = int(w.rng.binomial(max(int(s["tackles"]), 0), float(np.clip(.16 + grade_z * .05, .01, .5))))
    s["run_stops"] = int(w.rng.normal(1.9 + grade_z * 0.9, 0.9))
    s["missed_tackles"] = int(w.rng.binomial(max(int(s["tackles"]), 0),
                                             float(np.clip(.10 - grade_z * .03, .01, .35))))
    s["forced_fumbles"] = int(w.rng.binomial(2, 0.035))
    s["batted_passes"] = int(w.rng.binomial(3, 0.05))
    s["penalties"] = int(w.rng.binomial(4, 0.055))
    return s


def gen_cover(w, p, grade_z, snaps, picks, tackles):
    s = blank_line()
    s["snaps"] = snaps; s["games"] = 1
    s["coverage_snaps"] = int(snaps * 0.78)
    s["targets"] = max(0, int(w.rng.normal(4.6 - grade_z * 0.8, 1.6)))
    comp_allow = float(np.clip(w.rng.normal(0.615 - grade_z * .075, .10), .15, .95))
    s["rec_allowed"] = int(w.rng.binomial(max(int(s["targets"]), 0), comp_allow))
    s["yards_allowed"] = int(max(0, w.rng.normal(s["rec_allowed"] * 11.5, 12)))
    s["td_allowed"] = int(w.rng.binomial(max(int(s["rec_allowed"]), 0), 0.075))
    s["int"] = picks
    s["pass_breakups"] = max(0, int(w.rng.normal(0.6 + grade_z * 0.45, 0.6)))
    s["forced_incompletions"] = s["pass_breakups"] + int(w.rng.binomial(2, 0.15))
    s["passer_rating_allowed"] = round(passer_rating(
        max(int(s["targets"]), 1), int(s["rec_allowed"]), int(s["yards_allowed"]),
        int(s["td_allowed"]), picks), 1)
    s["yards_per_cov_snap"] = round(s["yards_allowed"] / max(s["coverage_snaps"], 1), 3)
    s["tackles"] = tackles
    s["solo"] = int(tackles * 0.72)
    s["missed_tackles"] = int(w.rng.binomial(max(int(tackles), 0),
                                             float(np.clip(.11 - grade_z * .03, .01, .35))))
    s["run_stops"] = max(0, int(w.rng.normal(1.1, 0.8)))
    s["penalties"] = int(w.rng.binomial(4, float(np.clip(.07 - grade_z * .015, .005, .3))))
    return s


def gen_lb(w, p, grade_z, snaps, tackles, picks):
    s = gen_cover(w, p, grade_z, snaps, picks, tackles)
    s["blitz_snaps"] = int(snaps * float(np.clip(w.rng.normal(0.14, .05), .01, .4)))
    s["pressures"] = int(w.rng.binomial(max(int(s["blitz_snaps"]), 0), 0.12))
    s["sacks"] = float(w.rng.binomial(max(int(s["pressures"]), 0), 0.16))
    s["tfl"] = int(w.rng.binomial(max(int(tackles), 0), float(np.clip(.13 + grade_z * .04, .01, .5))))
    return s


def gen_k(w, p, grade_z, pts_ctx):
    s = blank_line()
    s["games"] = 1; s["snaps"] = 6
    s["fg_att"] = max(0, int(w.rng.normal(1.9, 1.0)))
    made_p = float(np.clip(0.845 + grade_z * 0.055, 0.45, 0.99))
    s["fg_made"] = int(w.rng.binomial(int(s["fg_att"]), made_p))
    for lo, hi, tag in [(0, 29, "u30"), (30, 39, "30_39"), (40, 49, "40_49"), (50, 69, "50p")]:
        a = int(w.rng.binomial(int(s["fg_att"]), 0.25))
        s[f"fg_att_{tag}"] = a
        s[f"fg_made_{tag}"] = int(w.rng.binomial(a, made_p * (1.0 if hi < 50 else 0.78)))
    s["longest_fg"] = int(w.rng.normal(46, 7)) if s["fg_made"] else 0
    s["xp_att"] = max(0, int(w.rng.normal(2.4, 1.2)))
    s["xp_made"] = int(w.rng.binomial(int(s["xp_att"]), 0.955))
    s["kickoffs"] = max(0, int(w.rng.normal(4.4, 1.3)))
    s["touchbacks"] = int(w.rng.binomial(int(s["kickoffs"]), 0.62))
    s["gw_att"] = int(w.rng.random() < 0.07)
    return s


def gen_p(w, p, grade_z):
    s = blank_line()
    s["games"] = 1; s["snaps"] = 5
    s["punts"] = max(0, int(w.rng.normal(4.2, 1.5)))
    s["gross_yards"] = int(s["punts"] * w.rng.normal(46.5 + grade_z * 1.8, 2.0))
    s["return_yards_allowed"] = int(w.rng.binomial(max(int(s["punts"]), 0), 0.55) * 8)
    s["net_yards"] = max(0, s["gross_yards"] - s["return_yards_allowed"])
    s["inside_20"] = int(w.rng.binomial(int(s["punts"]),
                                        float(np.clip(0.38 + grade_z * .06, .05, .85))))
    s["inside_10"] = int(w.rng.binomial(int(s["inside_20"]), 0.35))
    s["touchbacks"] = int(w.rng.binomial(int(s["punts"]), 0.07))
    s["longest"] = int(w.rng.normal(56, 6)) if s["punts"] else 0
    return s
