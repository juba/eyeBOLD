import sqlite3
from pathlib import Path

DB_FILE = "../data/final_bold_7_Nov.db"
OUT_FILE = Path("../data/unique_countries_Nov-7.csv")

conn = sqlite3.connect(DB_FILE)
cur = conn.cursor()
#replace NULL entries by UNKNOWN 
cur.execute("UPDATE specimen SET country_iso = 'UNKNOWN' WHERE country_iso IS NULL;")

# Query distinct values
cur.execute("SELECT DISTINCT country_iso FROM specimen;")
rows = cur.fetchall()  # returns list of tuples

# Write to file, one per line
with open(OUT_FILE, "w", encoding="utf-8") as f:
    for (country,) in rows:
        f.write(country + "\n")

conn.close()

print(f"Written {len(rows)} unique countries to {OUT_FILE}")
