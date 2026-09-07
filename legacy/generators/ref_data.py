"""Dynasty Manager Pro - reference data (original league, real metro areas)."""

CAP_2026 = 302_000_000
SEASON = 2026

CONFERENCES = [
    ("AC", "American Conference"),
    ("NC", "National Conference"),
]

DIVISIONS = [
    ("AC-E", "AC", "East"), ("AC-N", "AC", "North"),
    ("AC-S", "AC", "South"), ("AC-W", "AC", "West"),
    ("NC-E", "NC", "East"), ("NC-N", "NC", "North"),
    ("NC-S", "NC", "South"), ("NC-W", "NC", "West"),
]

# team_id, metro, nickname, division_id, primary, secondary, founded, market_size(1-10)
TEAMS = [
    ("BUF", "Buffalo",        "Stampede",    "AC-E", "#12376B", "#C8102E", 1960, 4),
    ("MIA", "Miami",          "Barracuda",   "AC-E", "#00857D", "#F26522", 1966, 7),
    ("NE",  "New England",    "Colonials",   "AC-E", "#0B2340", "#A6192E", 1960, 8),
    ("NYJ", "New York",       "Aviators",    "AC-E", "#0F5132", "#FFFFFF", 1960, 10),
    ("BAL", "Baltimore",      "Blackbirds",  "AC-N", "#2B1B5C", "#000000", 1996, 6),
    ("PIT", "Pittsburgh",     "Forge",       "AC-N", "#000000", "#FFB612", 1933, 5),
    ("CLE", "Cleveland",      "Ironmen",     "AC-N", "#41230A", "#F26A21", 1946, 5),
    ("CIN", "Cincinnati",     "Riverkings",  "AC-N", "#F04B24", "#000000", 1968, 5),
    ("HOU", "Houston",        "Wildcatters", "AC-S", "#0B2340", "#B32134", 2002, 9),
    ("IND", "Indianapolis",   "Speed",       "AC-S", "#00327A", "#FFFFFF", 1953, 5),
    ("JAX", "Jacksonville",   "Reef",        "AC-S", "#0B7A75", "#C9A227", 1995, 4),
    ("TEN", "Tennessee",      "Ridgebacks",  "AC-S", "#1B3A6B", "#5FA3D9", 1960, 5),
    ("DEN", "Denver",         "Summit",      "AC-W", "#F26522", "#0B2340", 1960, 6),
    ("KC",  "Kansas City",    "Drovers",     "AC-W", "#C8102E", "#F2C100", 1960, 5),
    ("LV",  "Las Vegas",      "Highrollers", "AC-W", "#000000", "#B0B7BC", 1960, 5),
    ("LAC", "Los Angeles",    "Current",     "AC-W", "#0A6DA0", "#F2C100", 1960, 10),
    ("DAL", "Dallas",         "Outlaws",     "NC-E", "#0B2340", "#8E9BA5", 1960, 9),
    ("PHI", "Philadelphia",   "Liberty",     "NC-E", "#1B4D3E", "#B0B7BC", 1933, 8),
    ("WAS", "Washington",     "Federals",    "NC-E", "#5C1F1B", "#F2C100", 1932, 8),
    ("NYG", "New York",       "Empire",      "NC-E", "#12376B", "#C8102E", 1925, 10),
    ("CHI", "Chicago",        "Windjammers", "NC-N", "#0B1F33", "#D24E01", 1920, 9),
    ("DET", "Detroit",        "Motors",      "NC-N", "#0076B6", "#B0B7BC", 1930, 6),
    ("GB",  "Green Bay",      "Lumberjacks", "NC-N", "#1B3A26", "#F2C100", 1919, 2),
    ("MIN", "Minnesota",      "Northmen",    "NC-N", "#4F2683", "#F2C100", 1961, 6),
    ("ATL", "Atlanta",        "Phoenix",     "NC-S", "#A6192E", "#000000", 1966, 7),
    ("CAR", "Carolina",       "Copperheads", "NC-S", "#0085CA", "#101820", 1995, 5),
    ("NO",  "New Orleans",    "Krewe",       "NC-S", "#9F8958", "#101820", 1967, 4),
    ("TB",  "Tampa Bay",      "Tempest",     "NC-S", "#B32134", "#3B3B3B", 1976, 6),
    ("ARI", "Arizona",        "Scorpions",   "NC-W", "#8C1D40", "#FFC627", 1988, 6),
    ("LAR", "Los Angeles",    "Stars",       "NC-W", "#00295B", "#C9A227", 1946, 10),
    ("SF",  "San Francisco",  "Prospectors", "NC-W", "#8B1A1A", "#C9A227", 1946, 9),
    ("SEA", "Seattle",        "Evergreens",  "NC-W", "#0C2340", "#5FA83E", 1976, 7),
]

# team_id, stadium name, capacity, roof, surface, opened, city, state
STADIUMS = [
    ("BUF", "Lakeshore Field",          68_400, "open",        "grass",      2026, "Orchard Park", "NY"),
    ("MIA", "Palmetto Bay Stadium",     65_300, "open",        "grass",      1987, "Miami Gardens", "FL"),
    ("NE",  "Commonwealth Field",       65_900, "open",        "artificial", 2002, "Foxborough", "MA"),
    ("NYJ", "Meadowlark Stadium",       82_500, "open",        "artificial", 2010, "East Rutherford", "NJ"),
    ("BAL", "Harborworks Field",        71_000, "open",        "grass",      1998, "Baltimore", "MD"),
    ("PIT", "Three Rivers Yard",        68_400, "open",        "grass",      2001, "Pittsburgh", "PA"),
    ("CLE", "Lakefront Stadium",        67_400, "open",        "grass",      1999, "Cleveland", "OH"),
    ("CIN", "Queen City Field",         65_500, "open",        "artificial", 2000, "Cincinnati", "OH"),
    ("HOU", "Gulf Coast Dome",          72_200, "retractable", "artificial", 2002, "Houston", "TX"),
    ("IND", "Circle City Dome",         67_000, "retractable", "artificial", 2008, "Indianapolis", "IN"),
    ("JAX", "Atlantic Bank Field",      67_800, "open",        "grass",      1995, "Jacksonville", "FL"),
    ("TEN", "Cumberland Yard",          69_100, "open",        "grass",      2027, "Nashville", "TN"),
    ("DEN", "Mile High Park",           76_100, "open",        "grass",      2001, "Denver", "CO"),
    ("KC",  "Stockyards Stadium",       76_400, "open",        "grass",      1972, "Kansas City", "MO"),
    ("LV",  "Silver Vault",             65_000, "dome",        "grass",      2020, "Paradise", "NV"),
    ("LAC", "Pacific Crossing",         70_200, "retractable", "artificial", 2020, "Inglewood", "CA"),
    ("DAL", "Lone Star Palace",         80_000, "retractable", "artificial", 2009, "Arlington", "TX"),
    ("PHI", "Independence Field",       69_800, "open",        "grass",      2003, "Philadelphia", "PA"),
    ("WAS", "Potomac Yard",             67_000, "open",        "grass",      2027, "Landover", "MD"),
    ("NYG", "Meadowlark Stadium",       82_500, "open",        "artificial", 2010, "East Rutherford", "NJ"),
    ("CHI", "Lakeside Grounds",         62_500, "open",        "grass",      1924, "Chicago", "IL"),
    ("DET", "Assembly Dome",            65_000, "dome",        "artificial", 2002, "Detroit", "MI"),
    ("GB",  "Northwoods Field",         81_400, "open",        "grass",      1957, "Green Bay", "WI"),
    ("MIN", "Aurora Bank Dome",         66_900, "dome",        "artificial", 2016, "Minneapolis", "MN"),
    ("ATL", "Peachtree Dome",           71_000, "retractable", "artificial", 2017, "Atlanta", "GA"),
    ("CAR", "Piedmont Field",           74_900, "open",        "grass",      1996, "Charlotte", "NC"),
    ("NO",  "Crescent Dome",            73_200, "dome",        "artificial", 1975, "New Orleans", "LA"),
    ("TB",  "Bayshore Stadium",         69_200, "open",        "grass",      1998, "Tampa", "FL"),
    ("ARI", "Desert Vista Stadium",     63_400, "retractable", "grass",      2006, "Glendale", "AZ"),
    ("LAR", "Pacific Crossing",         70_200, "retractable", "artificial", 2020, "Inglewood", "CA"),
    ("SF",  "Bayview Park",             68_500, "open",        "grass",      2014, "Santa Clara", "CA"),
    ("SEA", "Puget Sound Field",        69_000, "open",        "artificial", 2002, "Seattle", "WA"),
]

OWNER_FIRST = ["Marguerite", "Desmond", "Corinne", "Julian", "Harriet", "Nathaniel", "Priya",
               "Roland", "Evelyn", "Casimir", "Delphine", "Augustin", "Yolanda", "Terrence",
               "Beatrix", "Sylvester", "Imelda", "Ranulph", "Constance", "Barnaby", "Odessa",
               "Leopold", "Winifred", "Cassius", "Marisol", "Thaddeus", "Georgina", "Emmett",
               "Rosalind", "Ignatius", "Clementine", "Absalom"]
OWNER_LAST = ["Hollingsworth", "Vandermeer", "Okonkwo", "Castellanos", "Bergstrom", "Whitlock",
              "Raghunathan", "Delacroix", "Ashworth", "Nakamura", "Pemberton", "Salazar",
              "Thornbury", "Achebe", "Kowalczyk", "Marchetti", "Fairbanks", "Duquesne",
              "Ravenscroft", "Ferreira", "Blackwood", "Sorensen", "Mbeki", "Lindqvist",
              "Carrington", "Ozdemir", "Vasquez", "Huntington", "Broussard", "Stavros",
              "Weatherby", "Calloway"]

OWNER_ARCHETYPES = [
    # label, patience(0-100), spending(0-100), meddling(0-100), win_now_bias
    ("Hands-off Steward",      82, 55, 18, 0.35),
    ("Aggressive Spender",     42, 92, 68, 0.85),
    ("Frugal Traditionalist",  70, 28, 45, 0.30),
    ("Impatient Mogul",        24, 78, 82, 0.90),
    ("Analytics Believer",     68, 62, 35, 0.50),
    ("Legacy Family Trust",    88, 48, 25, 0.40),
    ("Celebrity Investor",     38, 85, 74, 0.80),
    ("Corporate Syndicate",    58, 66, 40, 0.55),
]

# ---------------------------------------------------------------- colleges
COLLEGE_PLACES = [
    "Calderwood", "Fort Grayson", "Ashfield", "Marbury", "Stonewell", "Kelvinridge",
    "Northcrest", "Redbluff", "Havenport", "Silverlake", "Cypress Hollow", "Iron Gate",
    "Westmoor", "Bellhaven", "Thornfield", "Quarry Hill", "Kingsbridge", "Falcon Ridge",
    "Emberton", "Larkspur", "Whitepine", "Cedar Falls", "Granite Bay", "Sablewood",
    "Harrowgate", "Mount Verity", "Sunderland", "Pinehurst Valley", "Copper Creek",
    "Lakemont", "Ravensburg", "Foxcroft", "Dunmore", "Clearwater Ridge", "Talbot",
    "Winslow", "Bramblewood", "Eastvale", "Highmark Hollow", "Rockmoor", "Sterling Heights",
    "Juniper Springs", "Blackstone", "Amberly", "Crestmont", "Fairwinds", "Greyholm",
    "Hartsdale", "Ivywood", "Kestrel Point", "Longview Gap", "Mallory", "Nightingale",
    "Oakhurst Ridge", "Perrinville", "Quill Harbor", "Rosemont", "Saltmarsh", "Tanglewood",
    "Umberton", "Vaughn Hill", "Willowmere", "Yarrow", "Zephyr Point", "Ardmore",
    "Brookhaven Falls", "Cobalt Springs", "Deerfield Run", "Elmsworth", "Fernvale",
    "Glenrock", "Hollybrook", "Inglewood Park", "Jasper Bend", "Kirkland Moor",
    "Lynnfield", "Marshall Point", "Norbury", "Orchard Glen", "Pelham", "Quimby",
    "Ridgemont", "Stormont", "Thistledown", "Uplands", "Verdant Hollow", "Wexford",
    "Yorkfield", "Ashcombe", "Barrowdale", "Coldwater", "Dovecrest", "Edgemere",
    "Fallowfield", "Gaithers Run", "Hunterdon", "Ironwood Flats", "Jubilee Falls",
    "Kestrelmoor", "Lantern Hill", "Merribrook", "Nolanport", "Ospreyville",
    "Pinnacle Grove", "Quarrymont", "Rushton", "Sablecrest", "Torrington",
    "Underhill", "Valemount", "Windrow", "Wrenfield", "Yellowbank", "Zionsburg",
    "Alderbrook", "Bellamy", "Chandlerville", "Drummond", "Estwick", "Fitzroy",
    "Gallatin Ridge", "Hawksmoor", "Islington Bay", "Jarrow", "Kenmare", "Lockridge",
]
COLLEGE_SUFFIX = ["State", "University", "Tech", "A&M", "College", "Institute", "State Tech"]

COLLEGE_CONFS = [
    ("Southern Athletic Conference", "SAC", 1),
    ("Great Lakes Alliance",         "GLA", 1),
    ("Atlantic Coastal League",      "ACL", 1),
    ("Plains Conference",            "PLC", 1),
    ("Pacific Rim Conference",       "PRC", 1),
    ("Heartland Athletic",           "HLA", 2),
    ("Gateway Conference",           "GWY", 2),
    ("Mountain Crest Conference",    "MCC", 2),
    ("Seaboard Association",         "SBA", 2),
    ("Northern Valley Conference",   "NVC", 3),
    ("Frontier League",              "FRL", 3),
    ("Independent",                  "IND", 2),
]
