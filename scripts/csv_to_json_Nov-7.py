import json
from pathlib import Path
import csv

DATA_DIR = Path(__file__).parent / "../data/Nov-7"
CSV_FILE = DATA_DIR / "specimen_taxa.lineage.ranks.file"
JSON_FILE = DATA_DIR / "lineage_bold._Nov-7.json"


# Step 1: read CSV and create all nodes
# key = (name, rank)
nodes = {}          # (name, rank) -> node
csv_data = []       # (dad_key, son_key)

with open(CSV_FILE, newline="", encoding="utf-8") as f:
    reader = csv.reader(f)
    for dad, dadrank, son, sonrank, *_ in reader:
        dad = dad.strip()
        dadrank = dadrank.strip()
        son = son.strip()
        sonrank = sonrank.strip()

        # Ignore self-links at same rank
        if dad == son and dadrank == sonrank:
            continue

        dad_key = (dad, dadrank)
        son_key = (son, sonrank)

        csv_data.append((dad_key, son_key))

        if dad_key not in nodes:
            nodes[dad_key] = {
                "name": dad,
                "rank": dadrank,
                "children": []
            }

        if son_key not in nodes:
            nodes[son_key] = {
                "name": son,
                "rank": sonrank,
                "children": []
            }


# Step 2: attach children to parents
attached = set()
for dad_key, son_key in csv_data:
    nodes[dad_key]["children"].append(nodes[son_key])
    attached.add(son_key)


# Step 3: identify top-level nodes
top_level_nodes = [
    node for key, node in nodes.items()
    if key not in attached
]


# Step 4: output either a single root or a forest
output = top_level_nodes if len(top_level_nodes) > 1 else top_level_nodes[0]


# Step 5: save JSON
with open(JSON_FILE, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2)

print(f"Converted CSV → JSON: {JSON_FILE}")
