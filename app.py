from fastapi import FastAPI, Request, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, StreamingResponse   # ← add this line
from pathlib import Path
import sqlite3
import io
import csv



DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "final_bold_7_Nov.db"
LINEAGE_JSON = DATA_DIR / "lineage_bold._Nov-7.json" # the taxonomy data
COUNTRIES_CSV = DATA_DIR / "unique_countries_Nov-7.csv" # the taxonomy data

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def query_db_old(sql):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute(sql)
    rows = cur.fetchall()
    con.close()
    return rows

def query_db(sql):
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row  # <-- gives access to column names
    cur = con.cursor()
    cur.execute(sql)
    rows = cur.fetchall()
    con.close()
    return rows

@app.get("/api/testdb")
def test_db():
    try:
        con = sqlite3.connect(DB_PATH)
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) FROM specimen;")
        count = cur.fetchone()[0]
        con.close()
        return {"status": "ok", "rows_in_specimen": count}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/taxonomy_json")
def get_taxonomy_json():
    print("Serving taxonomy JSON file:", LINEAGE_JSON)
    if LINEAGE_JSON.exists():
        return FileResponse(LINEAGE_JSON, media_type="application/json", filename="lineage_bold.json")
    return {"error": "TAXONOMY JSON file not found"}


@app.get("/api/countries_csv")
def get_countries_csv():
    if COUNTRIES_CSV.exists():
        return FileResponse(COUNTRIES_CSV, media_type="text/csv", filename="unique_countries.csv")
    return {"error": "COUNTRIES CSV file not found"}

#########################################################################################
# THIS FUNCTION BUILDS A SQL QUERY BASED ON FRONTEND INPUT SEND IN JSON FORMAT. COOL ####
#########################################################################################

# Maximum number of rows to fetch when probing total count
MAX_COUNT_ROWS = 10_001        # query limit
DISPLAY_COUNT_CAP = MAX_COUNT_ROWS - 1  # if more than this, show ">CAP"

def build_sql_from_data(data, limit=None, return_count=False):
    """
    Build optimized SQL query from frontend filters.
    Places JOINs before WHERE for better performance.
    """

    metadata_cols = [
        "s.specimenid", "s.taxon_kingdom", "s.taxon_phylum", "s.taxon_class", "s.taxon_order",
        "s.taxon_family", "s.taxon_genus", "s.taxon_species", "s.identification_rank"
    ]

    joins = []
    where_conditions = []

    # === Identification rank === --> ALWAYS PRESENT
    if data.get("identification_rank"):
        source = data.get("max_rank_source", "gbif")
        if source == "bold":
            where_conditions.append(f"s.identification_rank = '{data['identification_rank']}'")
        elif source == "gbif":
            where_conditions.append(f"s.gbif_rank = '{data['identification_rank']}'")

    # # === Binary flag filters === --> ALWAYS PRESENT --> WILL BE IN COMPSITE INDEX
    # options = data.get("options", {})
    # if options.get("excludeDuplicates"):
    #     where_conditions.append("((s.checks >> 2) & 1) = 0")
    # if options.get("excludeShortLengths"):
    #     where_conditions.append("((s.checks >> 3) & 1) = 0")
    # if options.get("excludeMisclassified"):
    #     where_conditions.append("((s.checks >> 15) & 1) = 0")
    # if options.get("hybrids") == "hybrid":
    #     where_conditions.append("((s.checks >> 4) & 1) = 1")
    # elif options.get("hybrids") == "nohybrid":
    #     where_conditions.append("((s.checks >> 4) & 1) = 0")
    # if options.get("checkedLocationsOnly"):
    #     where_conditions.append("((s.checks >> 17) & 1) = 1")

   # === Binary flag filters === --> ALWAYS PRESENT --> WILL BE IN COMPOSITE INDEX
    options = data.get("options", {})
    # excludeDuplicates
    if options.get("excludeDuplicates"):
        where_conditions.append("s.check_flag_2 = 0")
    else:
        where_conditions.append("s.check_flag_2 IN (0,1)")
    # excludeShortLengths
    if options.get("excludeShortLengths"):
        where_conditions.append("s.check_flag_3 = 0")
    else:
        where_conditions.append("s.check_flag_3 IN (0,1)")
    # hybrids (ternary)
    if options.get("hybrids") == "hybrid":
        where_conditions.append("s.check_flag_4 = 1")
    elif options.get("hybrids") == "nohybrid":
        where_conditions.append("s.check_flag_4 = 0")
    else:
        where_conditions.append("s.check_flag_4 IN (0,1)")
    # excludeMisclassified
    if options.get("excludeMisclassified"):
        where_conditions.append("s.check_flag_15 = 0")
    else:
        where_conditions.append("s.check_flag_15 IN (0,1)")

    # === Taxonomy filters ===
    if data.get("taxonomy"):
        from collections import defaultdict
        taxa_by_rank = defaultdict(list)
        for t in data["taxonomy"]:
            taxa_by_rank[t["rank"]].append(t["name"])
        clauses = []
        for rank, names in taxa_by_rank.items():
            quoted = "', '".join(names)
            clauses.append(f"s.taxon_{rank} IN ('{quoted}')")
        where_conditions.append("(" + " OR ".join(clauses) + ")")

    # === Country filter (JOIN) ===
    if data.get("countries"):
        countries = [c.upper() for c in data["countries"]]
        country_list = "', '".join(countries)
        joins.append(f"JOIN species_countries sc ON sc.gbif_key = s.gbif_key")
        where_conditions.append(f"sc.country_code IN ('{country_list}')")

    # === Climate filter (JOIN) ===
    if data.get("climates"):
        zones = [z.lower() for z in data["climates"]]
        zone_list = "', '".join(zones)
        joins.append(f"JOIN species_zones sz ON sz.gbif_key = s.gbif_key")
        where_conditions.append(f"sz.zone IN ('{zone_list}')")

    # === Bounding boxes (R-tree optimized query) ===
    bounding_boxes = data.get("boundingBoxes", [])
    if bounding_boxes:
        subqueries = []
        for box in bounding_boxes:
            minLat, maxLat = box["minLat"], box["maxLat"]
            minLng, maxLng = box["minLng"], box["maxLng"]
            subqueries.append(f"""
                SELECT DISTINCT gbif_key FROM species_rtree
                WHERE maxX >= {minLng} AND minX <= {maxLng}
                  AND maxY >= {minLat} AND minY <= {maxLat}
            """)
        combined_subquery = " UNION ALL ".join(subqueries)
        where_conditions.append(f"s.gbif_key IN ({combined_subquery})")

    # === Sequence type ===
    seq_type = data.get("sequence", {}).get("type", "primers")
    if seq_type == "raw":
        sequence_col = "s.nuc_raw AS sequence"
    elif seq_type == "sanitized":
        sequence_col = "s.nuc_san AS sequence"
    elif seq_type == "primers":
        primers = data.get("sequence", {}).get("primers", {})
        fwd = primers.get("forward", "")
        rev = primers.get("reverse", "")
        joins.append(f"""
        JOIN primer_pairs p
          ON p.specimenid = s.specimenid
        """)
        where_conditions.extend([
            f"p.forward_match_id = '{fwd}'",
            f"p.reverse_match_id = '{rev}'"
        ])
        sequence_col = "p.inter_primer_sequence AS sequence"
    else:
        sequence_col = "s.nuc_raw AS sequence"


    # === Final WHERE clause ===
    where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"

    # === Assemble SQL ===
    select_cols = metadata_cols + [sequence_col]
    sql = f"""
    SELECT DISTINCT {', '.join(select_cols)}
    FROM specimen s
    {' '.join(joins)}
    WHERE {where_clause}
    """
    if limit:
        sql += f"\nLIMIT {limit};"

    # === Execute ===
    rows = query_db(sql)
    total_count = None

    if return_count:
        count_sql = f"""
        SELECT DISTINCT s.specimenid
        FROM specimen s
        {' '.join(joins)}
        WHERE {where_clause}
        LIMIT {MAX_COUNT_ROWS};
        """
        count_rows = len(query_db(count_sql))
        if count_rows > DISPLAY_COUNT_CAP:
          total_count = f">{DISPLAY_COUNT_CAP}"
        else:
          total_count = str(count_rows)

    return sql, rows, total_count

@app.post("/api/build_query")
async def build_query(request: Request):
    data = await request.json()

    # Get first 100 rows + total count in two optimized queries
    sql, rows, total_count = build_sql_from_data(data, limit=100, return_count=True)

    row_dicts = [dict(r) for r in rows]
    columns = list(row_dicts[0].keys()) if row_dicts else []

    return JSONResponse({
        "sql": sql,
        "nbrows": len(row_dicts),
        "total_count": total_count,
        "columns": columns,
        "results": row_dicts
    })

@app.post("/api/export_query")
async def export_query(request: Request, format: str = Query("json")):
    data = await request.json()

    # No limit, no total_count
    sql, rows, _ = build_sql_from_data(data, limit=None, return_count=False)
    row_dicts = [dict(r) for r in rows]

    if format == "json":
        return JSONResponse({"results": row_dicts})

    elif format == "tsv":
        if not row_dicts:
            return PlainTextResponse("", media_type="text/tab-separated-values")
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=row_dicts[0].keys(), delimiter="\t")
        writer.writeheader()
        writer.writerows(row_dicts)
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/tab-separated-values",
            headers={"Content-Disposition": "attachment; filename=export.tsv"}
        )

    elif format == "fasta":
        output = io.StringIO()
        for row in row_dicts:
            sid = row.get("specimenid", "NA")
            genus = row.get("taxon_genus", "NA")
            species = row.get("taxon_species", "NA")
            seq = row.get("sequence", "")
            output.write(f">{sid} {genus} {species}\n{seq}\n")
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/plain",
            headers={"Content-Disposition": "attachment; filename=export.fasta"}
        )

    else:
        return JSONResponse({"error": f"Unknown format: {format}"})



app.mount("/", StaticFiles(directory="static", html=True), name="static")
