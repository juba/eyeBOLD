import csv
import io
import json
import time
from collections import defaultdict
from pathlib import Path

import duckdb
import polars as pl
import sqlparse
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (  # ← add this line
    FileResponse,
    JSONResponse,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles

DATA_DIR = Path(__file__).parent / "data"
LINEAGE_JSON = DATA_DIR / "lineage_bold._Nov-7.json"  # the taxonomy data
COUNTRIES_CSV = DATA_DIR / "unique_countries_Nov-7.csv"  # the taxonomy data

duckdb_conn = duckdb.connect(config={"threads": 2})

app = FastAPI()

app.add_middleware(
    CORSMiddleware,  # ty:ignore[invalid-argument-type]
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

config = {"threads": "1"}


def query_db_pl(sql):
    start_time = time.time()
    res = duckdb_conn.sql(sql).pl()
    end_time = time.time()
    print(f"Query execution time: {(end_time - start_time):.6f} seconds")
    return res


@app.get("/api/testdb")
def test_db():
    try:
        count = duckdb_conn.sql("SELECT COUNT(*) FROM 'data/specimen.parquet'").fetchall()[0][0]
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


def build_sql_from_data(data, limit=None, get_total_count=True):
    """
    Build optimized SQL query from frontend filters.
    Places JOINs before WHERE for better performance.
    """

    limit = f"LIMIT {limit}" if limit else ""

    # === Specimens filter ===
    where_conditions = []
    # Identification rank --> ALWAYS PRESENT
    if data.get("identification_rank"):
        source = data.get("max_rank_source", "gbif")
        if source == "bold":
            where_conditions.append(f"identification_rank = '{data['identification_rank']}'")
        elif source == "gbif":
            where_conditions.append(f"gbif_rank = '{data['identification_rank']}'")
    # Taxonomy filters
    if data.get("taxonomy"):
        taxa_by_rank = defaultdict(list)
        for t in data["taxonomy"]:
            taxa_by_rank[t["rank"]].append(t["name"])
        clauses = []
        for rank, names in taxa_by_rank.items():
            quoted = "', '".join(names)
            clauses.append(f"taxon_{rank} IN ('{quoted}')")
        where_conditions.append("(" + " OR ".join(clauses) + ")")
    # Binary flag filters --> ALWAYS PRESENT
    options = data.get("options", {})
    if options.get("excludeDuplicates"):
        where_conditions.append("NOT check_flag_2")
    if options.get("excludeShortLengths"):
        where_conditions.append("NOT check_flag_3")
    if options.get("hybrids") == "hybrid":
        where_conditions.append("check_flag_4")
    elif options.get("hybrids") == "nohybrid":
        where_conditions.append("NOT check_flag_4")
    if options.get("excludeMisclassified"):
        where_conditions.append("NOT check_flag_15")
    where = " AND ".join(where_conditions)
    specimens_cte = (
        f"specimens_cte AS (\nSELECT gbif_key, specimenid FROM 'data/specimen.parquet' WHERE {where}\n),\n"
    )

    combined_keys_queries = []

    # === Gbif filter on Country (JOIN) ===
    countries_cte = ""
    if data.get("countries"):
        country_list = "', '".join([c.upper() for c in data["countries"]])
        countries_cte = f"countries_gbif AS (SELECT DISTINCT gbif_key FROM read_parquet('data/species_countries/*/*.parquet', hive_partitioning=true) WHERE country_code IN ('{country_list}')),"
        combined_keys_queries.append("SELECT gbif_key FROM countries_gbif")

    # === Gbif filter on Climate zones ===
    climates_cte = ""
    if data.get("climates"):
        zone_list = "', '".join([z.lower() for z in data["climates"]])
        climates_cte = f"zones_gbif AS (\nSELECT DISTINCT gbif_key FROM read_parquet('data/species_zones/*/*.parquet', hive_partitioning=true) WHERE zone IN ('{zone_list}')\n),\n"
        combined_keys_queries.append("SELECT gbif_key FROM zones_gbif")

    # === Gbif filter on Bounding boxes ===
    coords_cte = ""
    bounding_boxes = data.get("boundingBoxes", [])
    if bounding_boxes:
        subqueries = []
        for box in bounding_boxes:
            minLat, maxLat = box["minLat"], box["maxLat"]
            minLng, maxLng = box["minLng"], box["maxLng"]
            subqueries.append(f"""
            SELECT DISTINCT gbif_key FROM 'data/species_locations.parquet' loc
                WHERE longitude >= {minLng} AND longitude <= {maxLng}
                  AND latitude >= {minLat} AND latitude <= {maxLat}
            """)
        combined_subquery = " UNION ALL ".join(subqueries)
        coords_cte = f"coords_gbif AS (\n{combined_subquery}),\n"
        combined_keys_queries.append("SELECT gbif_key FROM coords_gbif")

    combined_keys = ""
    if combined_keys_queries:
        combined_keys = f"combined_keys AS (\n{' INTERSECT '.join(combined_keys_queries)}\n),\n"

    inner_join = "INNER JOIN combined_keys ck ON s.gbif_key = ck.gbif_key" if combined_keys_queries else ""
    total_count = ""
    if get_total_count:
        total_count = ", COUNT(*) OVER () AS total_rows"
    specimenid_cte = f"specimenid_cte AS (\n SELECT specimenid {total_count} FROM specimens_cte s {inner_join} {limit}\n),\n"

    # === Result table ====
    result_cols = [
        "s.specimenid",
        "s.taxon_kingdom",
        "s.taxon_phylum",
        "s.taxon_class",
        "s.taxon_order",
        "s.taxon_family",
        "s.taxon_genus",
        "s.taxon_species",
        f"{'s.identification_rank' if source == 'bold' else 's.gbif_rank'}",
    ]
    if get_total_count:
        result_cols.append("ids.total_rows")
    select_cols = ", ".join(result_cols)
    result_cte = f"result_cte AS (SELECT {select_cols} FROM 'data/specimen.parquet' s INNER JOIN specimenid_cte ids ON s.specimenid = ids.specimenid)"

    # Sequence type
    seq_type = data.get("sequence", {}).get("type", "primers")
    # default: raw sequence
    sequence_col = "p.nuc_raw AS sequence"
    sequence_join = "JOIN 'data/sequences.parquet' p ON p.specimenid = s.specimenid"
    if seq_type == "sanitized":
        sequence_col = "p.nuc_san AS sequence"
    if seq_type == "primers":
        primers = data.get("sequence", {}).get("primers", {})
        primers_fwd = primers.get("forward", "")
        primers_rev = primers.get("reverse", "")
        sequence_col = "p.inter_primer_sequence AS sequence"
        sequence_join = f"JOIN 'data/primer_pairs.parquet' p ON p.specimenid = s.specimenid WHERE p.forward_match_id = '{primers_fwd}' AND p.reverse_match_id = '{primers_rev}'"
    sequences_query = f"SELECT s.*, {sequence_col} FROM result_cte s {sequence_join}"

    sql = f"WITH {coords_cte} {countries_cte} {climates_cte}  {specimens_cte} {combined_keys} {specimenid_cte} {result_cte} {sequences_query};"

    return sqlparse.format(sql, reindent_aligned=True)


@app.post("/api/build_query")
async def build_query(request: Request):
    data = await request.json()

    # Get first 100 rows + total count in two optimized queries
    sql = build_sql_from_data(data, limit=100, get_total_count=True)
    rows = query_db_pl(sql)
    total_count = rows.get_column("total_rows")[0] if not rows.is_empty() else 0
    rows = rows.select(pl.all().exclude("total_rows"))

    row_dicts = rows.to_dicts()
    columns = list(row_dicts[0].keys()) if row_dicts else []

    return JSONResponse(
        {
            "sql": sql,
            "nbrows": len(row_dicts),
            "total_count": total_count,
            "columns": columns,
            "results": row_dicts,
        }
    )


@app.post("/api/export_query")
async def export_query(request: Request, format: str = Query("json")):
    data = await request.json()

    # No limit, no total_count
    sql = build_sql_from_data(data, limit=None, get_total_count=False)

    cursor = duckdb_conn.execute(sql)

    if format == "json":
        generator = json_generator(cursor)
        return StreamingResponse(
            generator,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=export.json"},
        )

    elif format == "tsv":
        generator = tsv_generator(cursor)
        return StreamingResponse(
            generator,
            media_type="text/tab-separated-values",
            headers={"Content-Disposition": "attachment; filename=export.tsv"},
        )

    elif format == "fasta":
        generator = fasta_generator(cursor)
        return StreamingResponse(
            generator,
            media_type="text/plain",
            headers={"Content-Disposition": "attachment; filename=export.fasta"},
        )

    else:
        return JSONResponse({"error": f"Unknown format: {format}"})


app.mount("/", StaticFiles(directory="static", html=True), name="static")


def json_generator(cursor):
    column_names = [desc[0] for desc in cursor.description]
    # Yield start of JSON file
    yield '{"results": ['

    first_batch = True
    while True:
        batch = cursor.fetchmany(10000)
        if not batch:
            break
        # Convert the batch to a list of dictionaries
        batch_dicts = [dict(zip(column_names, row)) for row in batch]
        # Convert to JSON and yield
        batch_json = json.dumps(batch_dicts)
        if not first_batch:
            yield ","
        else:
            first_batch = False
        yield batch_json[1:-1]

    # Yield the closing bracket for the JSON array
    yield "]}"


def fasta_generator(cursor):
    column_names = [desc[0] for desc in cursor.description]
    output = io.StringIO()

    while True:
        batch = cursor.fetchmany(10000)
        if not batch:
            break
        output.seek(0)
        output.truncate(0)
        # Convert the batch to a list of dictionaries
        batch_dicts = [dict(zip(column_names, row)) for row in batch]
        for row in batch_dicts:
            sid = row.get("specimenid", "NA")
            genus = row.get("taxon_genus", "NA")
            species = row.get("taxon_species", "NA")
            seq = row.get("sequence", "")
            output.write(f">{sid} {genus} {species}\n{seq}\n")
        output.flush()
        yield output.getvalue()


def tsv_generator(cursor):
    output = io.StringIO()
    writer = csv.writer(output, delimiter="\t")
    column_names = [desc[0] for desc in cursor.description]
    print(column_names)
    # Yield start of JSON file
    writer.writerow(column_names)
    output.flush()
    yield output.getvalue()

    while True:
        batch = cursor.fetchmany(10000)
        if not batch:
            break
        output.seek(0)
        output.truncate(0)
        writer.writerows(batch)
        output.flush()
        yield output.getvalue()
