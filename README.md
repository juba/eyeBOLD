# eyeBOLD

## Notes for development

To run the server simply type
`uvicorn app:app --reload --port 8000`

## Database manipulation (could be on the database developer side, see later)

```sql
-- == Add columns for bits 2, 3, 4 and 15
ALTER TABLE specimen ADD COLUMN check_flag_2 BOOLEAN;
ALTER TABLE specimen ADD COLUMN check_flag_3 BOOLEAN;
ALTER TABLE specimen ADD COLUMN check_flag_4 BOOLEAN;
ALTER TABLE specimen ADD COLUMN check_flag_15 BOOLEAN;

UPDATE specimen SET check_flag_2 = (((checks >> 2) & 1) = 1);
UPDATE specimen SET check_flag_3 = (((checks >> 3) & 1) = 1);
UPDATE specimen SET check_flag_4 = (((checks >> 4) & 1) = 1);
UPDATE specimen SET check_flag_15 = (((checks >> 15) & 1) = 1);
```

## Indexing
Indexing is needed for the GUI to be usable. Here is how it must be done:

```sql
-- == COMPOSITE INDEXES FOR COLUMNS ALWAYS QUERIED TOGETHER AND IN THIS ORDER ==
CREATE INDEX idx_specimen_ident_rank ON specimen(identification_rank);
CREATE INDEX idx_specimen_gbif_rank ON specimen(gbif_rank);

-- == INDEX FOR TAXONOMY ==
CREATE INDEX IF NOT EXISTS idx_taxon_kingdom ON specimen(taxon_kingdom);
CREATE INDEX IF NOT EXISTS idx_taxon_phylum  ON specimen(taxon_phylum);
CREATE INDEX IF NOT EXISTS idx_taxon_class   ON specimen(taxon_class);
CREATE INDEX IF NOT EXISTS idx_taxon_order   ON specimen(taxon_order);
CREATE INDEX IF NOT EXISTS idx_taxon_family  ON specimen(taxon_family);
CREATE INDEX IF NOT EXISTS idx_taxon_genus   ON specimen(taxon_genus);
CREATE INDEX IF NOT EXISTS idx_taxon_species ON specimen(taxon_species);

-- === Specimen join for primer pairs ===
CREATE INDEX IF NOT EXISTS idx_primer_specimen_id ON primer_pairs(specimenid);
CREATE INDEX IF NOT EXISTS idx_primer_forward_match ON primer_pairs(forward_match_id, reverse_match_id);
CREATE INDEX IF NOT EXISTS idx_primer_specimen ON primer_pairs(specimenid);
CREATE INDEX IF NOT EXISTS idx_primer_pair     ON primer_pairs(forward_match_id, reverse_match_id);

-- === Countries and zones ===
CREATE INDEX IF NOT EXISTS idx_species_countries_key_code ON species_countries(gbif_key, country_code);
CREATE INDEX IF NOT EXISTS idx_species_zones_key_zone ON species_zones(gbif_key, zone);
```

```sql
-- === ADDITIONAL SYUFF ===


## TODO list / new functionalities
- [x] write clean code to extract taxonomy from db and write it in json
- [x] write clean code toextract countries from db and format it into a json
- [ ] idem for climatic zones
- [x] Add continent info somewhere to help organize countries better
- [x] Add search bar for taxo

## SPATIAL DATA: what to do

We chose for easy request of points in cell boxes to use a simple R-tree for storing efficiently the lat lon coordinates of points. 
It is very efficient for 700000 points. Let's see later for other solutions? 

R-tree construction is done with the script in: `script/build_rtree_index.py`

It creates a new table: species_rtree that will be used for the sql requests. 



