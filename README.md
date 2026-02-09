# eyeBOLD

## Notes for development

To run the server simply install uv and type
`uv run uvicorn app:app --reload --port 8000`

## Database

The database has been converted to a set of parquet files.

The following changes have been applied:

- `species_countries.parquet` has been hive partitioned by `country_code`
- `species_zones.parquet` has been hive partitioned by `zone`
- the `check_flags` columns in the `specimen` table have been converted to booleans
- the `nuc_raw` and `nuc_san` columns of `specimen.parquet` have been moved to another file `sequences.parquet`

## TODO list / new functionalities

- [x] write clean code to extract taxonomy from db and write it in json
- [x] write clean code toextract countries from db and format it into a json
- [x] idem for climatic zones
- [ ] Choose what to do with the countries and zones. SHould we only let users select within countries and zones having data in it or in all the existing list of countries and zones? I prefer the second solution.
- [x] Add continent info somewhere to help organize countries better
- [x] Add search bar for taxo
