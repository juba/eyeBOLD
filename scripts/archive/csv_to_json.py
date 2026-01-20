import json
from pathlib import Path
import csv

DATA_DIR = Path(__file__).parent / "data"
CSV_FILE = DATA_DIR / "lineage_bold.csv"
JSON_FILE = DATA_DIR / "lineage_bold.json"

# Step 1: read CSV and create all nodes
nodes = {}  # name -> node
csv_data = []

with open(CSV_FILE, newline="", encoding="utf-8") as f:
    reader = csv.reader(f)
    for dad, son, rank in reader:
        dad = dad.strip()
        son = son.strip()
        rank = rank.strip()

        # Ignore rows where dad and son are identical
        if dad == son:
            continue

        csv_data.append((dad, son, rank))

        if dad not in nodes:
            nodes[dad] = {"name": dad, "rank": None, "children": []}
        if son not in nodes:
            nodes[son] = {"name": son, "rank": rank, "children": []}
        else:
            if nodes[son]["rank"] is None:
                nodes[son]["rank"] = rank

# Step 2: attach children to parents
attached = set()
for dad, son, rank in csv_data:
    nodes[dad]["children"].append(nodes[son])
    attached.add(son)

# Step 3: identify top-level nodes (those never attached as children)
top_level_nodes = [node for name, node in nodes.items() if name not in attached]

# Step 4: output either a single top-level node or a list if multiple
output = top_level_nodes if len(top_level_nodes) > 1 else top_level_nodes[0]

# Step 5: save JSON
with open(JSON_FILE, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2)

print(f"Converted CSV → JSON: {JSON_FILE}")
