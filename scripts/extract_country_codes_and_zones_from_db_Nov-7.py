import sqlite3
from pathlib import Path

DB_FILE = "../data/final_bold_7_Nov.db"
OUT_FILE_COUNTRIES = Path("../data/unique_countries_Nov-7.csv")
OUT_FILE_ZONES = Path("../data/unique_zones_Nov-7.csv")

conn = sqlite3.connect(DB_FILE)
cur = conn.cursor()

# Query distinct values
cur.execute("SELECT DISTINCT country_code FROM species_countries;")
rows_countries = cur.fetchall()  # returns list of tuples

# Query distinct values
cur.execute("SELECT DISTINCT zone FROM species_zones;")
rows_zones = cur.fetchall()  # returns list of tuples

# Write to file, one per line
with open(OUT_FILE_COUNTRIES, "w", encoding="utf-8") as f:
    for (country,) in rows_countries:
        f.write(country + "\n")

with open(OUT_FILE_ZONES, "w", encoding="utf-8") as f:
    for (zone,) in rows_zones:
        f.write(zone + "\n")

conn.close()

print(f"Written {len(rows_countries)} unique countries to {OUT_FILE_COUNTRIES}")
print(f"Written {len(rows_zones)} unique zones to {OUT_FILE_ZONES}")

