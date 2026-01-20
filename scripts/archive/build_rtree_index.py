import sqlite3
import time

DB_FILE = "../data/my_small.db"
SRC_TABLE = "species_locations"          # your table with gbif_key, latitude, longitude
RTREE_TABLE = "species_rtree"            # the R-tree index table name
BATCH_SIZE = 500_000                     # rows per transaction

# --- Connect and enable R*Tree extension ---
conn = sqlite3.connect(DB_FILE)
cur = conn.cursor()
cur.execute("PRAGMA journal_mode = WAL;")  # faster writes
cur.execute("PRAGMA synchronous = OFF;")   # safe for bulk insert

# --- Create R-tree table with auxiliary gbif_key ---
cur.execute(f"""
CREATE VIRTUAL TABLE IF NOT EXISTS {RTREE_TABLE}
USING rtree(
    rowid,          -- implicit
    minX, maxX,     -- longitude
    minY, maxY,     -- latitude
    +gbif_key TEXT  -- extra non-indexed column
);
""")
conn.commit()

# --- Ask user if they want to rebuild ---
cur.execute(f"SELECT COUNT(*) FROM {RTREE_TABLE}")
existing_count = cur.fetchone()[0]
if existing_count > 0:
    print(f"⚠️  The table '{RTREE_TABLE}' already contains {existing_count:,} entries.")
    choice = input("Do you want to DELETE and rebuild the R-tree from scratch? (y/N): ").strip().lower()
    if choice == "y":
        cur.execute(f"DELETE FROM {RTREE_TABLE};")
        conn.commit()
        print("✅ Existing R-tree entries deleted.")
    else:
        print("↩️  Keeping existing entries. New rows will be appended where possible (duplicates ignored).")

# --- Count total rows ---
cur.execute(f"SELECT COUNT(*) FROM {SRC_TABLE}")
total_rows = cur.fetchone()[0]
print(f"Total points to index: {total_rows:,}")

# --- Spatially sorted reading ---
cur.execute(f"SELECT rowid, gbif_key, longitude, latitude FROM {SRC_TABLE} ORDER BY longitude, latitude")
rows = cur.fetchmany(BATCH_SIZE)
print("✅ Database successfully sorted by latitude and longitude!")

start_time = time.time()
inserted = 0

while rows:
    conn.execute("BEGIN TRANSACTION;")
    # Use INSERT OR IGNORE to avoid duplicates
    conn.executemany(
        f"INSERT OR IGNORE INTO {RTREE_TABLE}(rowid, minX, maxX, minY, maxY, gbif_key) VALUES (?, ?, ?, ?, ?, ?)",
        [(r[0], r[2], r[2], r[3], r[3], r[1]) for r in rows if r[2] is not None and r[3] is not None]
    )
    conn.commit()
    inserted += len(rows)

    elapsed = time.time() - start_time
    rate = inserted / elapsed if elapsed > 0 else 0
    print(f"Inserted {inserted:,}/{total_rows:,} ({rate:,.0f} pts/s)")

    rows = cur.fetchmany(BATCH_SIZE)

conn.close()
print("✅ R-tree build completed successfully!")
