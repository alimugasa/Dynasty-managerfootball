"""League rules (configurable per season) and mutable world state."""
import csv, os, random
import numpy as np

DB = "/mnt/user-data/outputs/dynasty_manager_pro"

# ---------------------------------------------------------------- RULES
# Nothing here is hard-coded into engine logic; every system reads from this.
class Rules:
    def __init__(self, season):
        self.season = season
        self.games_per_team = 17
        self.weeks = 18
        self.roster_limit = 53
        self.offseason_roster_limit = 90
        self.practice_squad_limit = 16
        self.playoff_teams_per_conf = 7
        self.first_round_byes_per_conf = 1
        self.trade_deadline_week = 9
        self.ir_return_limit = 8
        self.franchise_tag_enabled = True
        self.fifth_year_option_enabled = True
        self.comp_picks_max = 4
        self.draft_rounds = 7
        # cap grows off a base year; growth is bounded so 2056 stays sane
        base, base_year = 302_000_000, 2026
        self.salary_cap = int(base * (1.062 ** (season - base_year)))
        self.vet_min = int(1_120_000 * (1.062 ** (season - base_year)))
        self.rookie_pool_r1_top = int(11_000_000 * (1.062 ** (season - base_year)))

POSITION_GROUPS = {
    "QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE",
    "OT": "OL", "OG": "OL", "C": "OL", "EDGE": "EDGE", "DT": "DT",
    "LB": "LB", "CB": "CB", "S": "S", "K": "ST", "P": "ST", "LS": "ST",
}
# how much a starting snap at this position swings a game outcome
POSITION_IMPACT = {
    "QB": 0.260, "OT": 0.058, "EDGE": 0.075, "WR": 0.055, "CB": 0.060,
    "DT": 0.048, "TE": 0.030, "OG": 0.032, "C": 0.028, "S": 0.034,
    "LB": 0.030, "RB": 0.030, "FB": 0.004, "K": 0.012, "P": 0.006, "LS": 0.002,
}
# age at which each position group peaks, and how hard it falls after
PEAK_AGE = {"QB": 29, "RB": 25, "WR": 27, "TE": 27, "OL": 29,
            "EDGE": 27, "DT": 28, "LB": 27, "CB": 26, "S": 27, "ST": 32}
DECLINE_RATE = {"QB": 1.10, "RB": 2.85, "WR": 1.75, "TE": 1.55, "OL": 1.20,
                "EDGE": 1.70, "DT": 1.55, "LB": 1.80, "CB": 2.30, "S": 1.80, "ST": 0.70}

FA_PERSONALITIES = ["MAX_MONEY", "CHAMPIONSHIP", "LOYALTY", "ROLE",
                    "LOCATION", "COACH_RELATIONSHIP", "LONG_TERM_SECURITY"]


def _rows(name):
    with open(f"{DB}/{name}.csv", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _i(v, d=0):
    try: return int(float(v))
    except (TypeError, ValueError): return d


class World:
    """Mutable league state. Everything the engines read and write."""

    def __init__(self, seed=20260825):
        self.rng = np.random.default_rng(seed)
        self.py = random.Random(seed)
        self.season = 2026
        self.rules = Rules(self.season)

        self.teams = {}
        for r in _rows("teams"):
            self.teams[r["team_id"]] = {
                "team_id": r["team_id"], "metro": r["metro_area"], "nick": r["nickname"],
                "div": r["division_id"], "conf": r["conference_id"],
                "market": _i(r["market_size"]),
                "prestige": 50.0, "scouting": 50.0, "development": 50.0,
                "medical": 50.0, "cap_mgmt": 50.0,
                "strategy": "COMPETITIVE", "titles": 0, "playoff_apps": 0,
                "wins_history": [],
            }
        for r in _rows("owners"):
            t = self.teams[r["team_id"]]
            t["owner_patience"] = _i(r["patience"])
            t["owner_spending"] = _i(r["spending_willingness"])
            t["win_now"] = float(r["win_now_bias"])
        for r in _rows("team_schemes"):
            t = self.teams[r["team_id"]]
            t["off_scheme"] = r["offensive_scheme"]
            t["def_scheme"] = r["defensive_scheme"]
            t["base_front"] = r["base_front"]
            t["run_pass"] = float(r["run_pass_balance"])
            t["blitz"] = float(r["blitz_rate"])
            t["aggression"] = _i(r["fourth_down_aggression"])
        for r in _rows("stadiums"):
            t = self.teams.get(r["team_id"])
            if t:
                t["roof"] = r["roof_type"]
                t["capacity"] = _i(r["capacity"])
                t["state"] = r["state"]

        # players: contracts folded in so there is one authoritative record
        contracts = {r["player_id"]: r for r in _rows("player_contracts")}
        attrs = {r["player_id"]: r for r in _rows("player_attributes")}
        self.players = {}
        for r in _rows("players"):
            pid = r["player_id"]
            c = contracts.get(pid)
            a = attrs.get(pid, {})
            ov = _i(r["overall_rating"])
            self.players[pid] = {
                "pid": pid, "name": r["display_name"], "team": r["team_id"],
                "pos": r["position"], "grp": POSITION_GROUPS[r["position"]],
                "age": _i(r["age"]), "exp": _i(r["experience_years"]),
                "college": r["college_name"],
                "draft_year": _i(r["draft_year"]), "draft_round": _i(r["draft_round"], 0),
                "draft_pick": _i(r["draft_overall_pick"], 0),
                "ovr": ov,
                # hidden: teams never read these directly
                "true_potential": _i(r["potential_rating"]),
                "dev_rate": float(np.clip(self.rng.normal(1.0, 0.30), 0.25, 2.1)),
                "work_ethic": _i(a.get("work_ethic"), 70),
                "durability": _i(a.get("durability"), 70),
                "iq": _i(a.get("football_iq"), 70),
                "mental": 0.0,                       # accrued experience bonus
                "personality": self.py.choice(FA_PERSONALITIES),
                "status": r["roster_status"],
                "injury_weeks": 0, "injury_type": "", "games_missed_career": 0,
                "retired": False, "hof": False,
                "aav": _i(c["average_annual_value"]) if c else Rules(2026).vet_min,
                "cap_hit": _i(c["cap_hit_2026"]) if c else Rules(2026).vet_min,
                "years_left": _i(c["years_remaining"]) if c else 1,
                "guaranteed": _i(c["guaranteed_money"]) if c else 0,
                "career": {"seasons": _i(r["experience_years"]), "games": 0, "pass_yd": 0, "pass_td": 0, "int": 0,
                           "rush_yd": 0, "rush_td": 0, "rec": 0, "rec_yd": 0, "rec_td": 0,
                           "sacks": 0.0, "tackles": 0, "picks": 0,
                           "pro_bowls": 0, "all_pros": 0, "mvps": 0, "rings": 0},
                "morale": 65.0, "reputation": float(ov),
            }
        self.coaches = {}
        staff = {r["coach_id"]: r for r in _rows("team_coaching_staff")}
        for r in _rows("coaches"):
            cid = r["coach_id"]
            self.coaches[cid] = {
                "cid": cid, "name": r["display_name"], "team": r["team_id"],
                "role": r["role"], "age": _i(r["age"]), "exp": _i(r["years_experience"]),
                "tree": r["coaching_tree"], "ovr": _i(r["overall_rating"]),
                "mentor": "", "scheme_family": r["coaching_tree"],
                "tenure": _i(staff.get(cid, {}).get("years_with_team"), 1),
                "career_w": 0, "career_l": 0, "titles": 0, "retired": False,
            }
        self.schedule_rotation = 0          # advances one step per season
        self.prior_finish = {}
        self.prospect_pipeline = {}         # draft_year -> [prospects]
        self.history = {"seasons": [], "transactions": [], "news": [],
                        "awards": [], "hof": [], "coach_moves": []}
        self.next_id = 100000

    def new_pid(self, pos):
        self.next_id += 1
        return f"P{self.next_id}_{pos}"

    # ---- roster index. Rescanning every player per call made free agency
    # quadratic; this keeps team lookups O(roster).
    def reindex(self):
        self._idx = {}
        for p in self.players.values():
            if not p["retired"]:
                self._idx.setdefault(p["team"], []).append(p)
        self._ur_cache = {}

    def set_team(self, p, new_team):
        """Single point of truth for roster movement, so the index cannot drift."""
        idx = getattr(self, "_idx", None)
        if idx is not None:
            old = idx.get(p["team"])
            if old:
                try: old.remove(p)
                except ValueError: pass
            idx.setdefault(new_team, []).append(p)
        p["team"] = new_team
        if hasattr(self, "_ur_cache"):
            self._ur_cache.pop(new_team, None)

    def roster(self, tid, active_only=True):
        if not hasattr(self, "_idx"):
            self.reindex()
        g = self._idx.get(tid, [])
        return [p for p in g if not p["retired"]
                and (not active_only or p["status"] == "ACTIVE")]

    def free_agents(self):
        if not hasattr(self, "_idx"):
            self.reindex()
        return [p for p in self._idx.get("FA", []) if not p["retired"]]

    def cap_space(self, tid):
        rs = sorted(self.roster(tid, active_only=False), key=lambda p: -p["cap_hit"])[:51]
        return self.rules.salary_cap - sum(p["cap_hit"] for p in rs)

    def log(self, kind, text, season=None):
        self.history["news"].append({"season": season or self.season,
                                     "type": kind, "text": text})

    def txn(self, ttype, pid, frm, to, detail=""):
        self.history["transactions"].append({
            "season": self.season, "type": ttype, "player_id": pid,
            "from_team": frm, "to_team": to, "detail": detail})
