# eyeBOLD

## What to do after having cloned this repo
- run code to prepare taxonomy. This produces the file `data/lineage_bold._Nov-7.json`
`python3 scripts/csv_to_json_Nov-7.py`

## Notes for development
To run the server simply type
`uvicorn app:app --reload --port 8000`

## Indexing
Indexing is needed for the GUI to be usable. Here is how it must be done: (it's an example, depends on columns returned)

```sql
-- === Taxonomy filters ===
-- NOTE: test if those can be replaced by those below
CREATE INDEX IF NOT EXISTS idx_taxon_kingdom      ON specimen(taxon_kingdom);
CREATE INDEX IF NOT EXISTS idx_taxon_phylum       ON specimen(taxon_phylum);
CREATE INDEX IF NOT EXISTS idx_taxon_class        ON specimen(taxon_class);
CREATE INDEX IF NOT EXISTS idx_taxon_order        ON specimen(taxon_order);
CREATE INDEX IF NOT EXISTS idx_taxon_family       ON specimen(taxon_family);
CREATE INDEX IF NOT EXISTS idx_taxon_genus        ON specimen(taxon_genus);
CREATE INDEX IF NOT EXISTS idx_taxon_species      ON specimen(taxon_species);

-- == THOS BELOW ARE THESE ONES ==
CREATE INDEX IF NOT EXISTS idx_specimen_kingdom_rank ON specimen (taxon_kingdom, gbif_rank);
CREATE INDEX IF NOT EXISTS idx_specimen_phylum_rank ON specimen (taxon_phylum, gbif_rank);
CREATE INDEX IF NOT EXISTS idx_specimen_class_rank ON specimen (taxon_class, gbif_rank);
CREATE INDEX IF NOT EXISTS idx_specimen_order_rank ON specimen (taxon_order, gbif_rank);
CREATE INDEX IF NOT EXISTS idx_specimen_family_rank ON specimen (taxon_family, gbif_rank);
CREATE INDEX IF NOT EXISTS idx_specimen_genus_rank ON specimen (taxon_genus, gbif_rank);
CREATE INDEX IF NOT EXISTS idx_specimen_species_rank ON specimen (taxon_species, gbif_rank);

-- === Identification rank ===
CREATE INDEX IF NOT EXISTS idx_identification_rank ON specimen(identification_rank);

-- === Specimen join for primer pairs ===
CREATE INDEX IF NOT EXISTS idx_primer_specimen_id ON primer_pairs(specimenid);
CREATE INDEX IF NOT EXISTS idx_primer_forward_match ON primer_pairs(forward_match_id);
CREATE INDEX IF NOT EXISTS idx_primer_reverse_match ON primer_pairs(reverse_match_id);

-- === Countries and zones ===
CREATE INDEX idx_species_countries_key_code ON species_countries(gbif_key, country_code);
CREATE INDEX idx_species_zones_key_zone ON species_zones(gbif_key, zone);

-- === gbif ranks ===
CREATE INDEX idx_specimen_gbif_rank ON specimen(gbif_rank);

```

```sql
-- === ADDITIONAL SYUFF ===
-- Add columns for bits 2, 3, 4 and 15
ALTER TABLE specimen ADD COLUMN check_flag_4 BOOLEAN;
ALTER TABLE specimen ADD COLUMN check_flag_2 BOOLEAN;
ALTER TABLE specimen ADD COLUMN check_flag_3 BOOLEAN;
ALTER TABLE specimen ADD COLUMN check_flag_15 BOOLEAN;

UPDATE specimen SET check_flag_4 = (((checks >> 4) & 1) = 1);
UPDATE specimen SET check_flag_2 = (((checks >> 2) & 1) = 1);
UPDATE specimen SET check_flag_3 = (((checks >> 3) & 1) = 1);
UPDATE specimen SET check_flag_15 = (((checks >> 15) & 1) = 1);

CREATE INDEX idx_specimen_check_flag_4 ON specimen(check_flag_4);
CREATE INDEX idx_specimen_check_flag_2 ON specimen(check_flag_2);
CREATE INDEX idx_specimen_check_flag_3 ON specimen(check_flag_3);
CREATE INDEX idx_specimen_check_flag_15 ON specimen(check_flag_15);
```

## TODO list / new functionalities
- [ ] write clean code to extract taxonomy from db and write it in json
- [ ] write clean code toextract countries from db and format it into a json
- [ ] idem for climatic zones
- [x] Add continent info somewhere to help organize countries better
- [x] Add search bar for taxo

## SPATIAL DATA: what to do

We chose for easy request of points in cell boxes to use a simple R-tree for storing efficiently the lat lon coordinates of points. 
It is very efficient for 700000 points. Let's see later for other solutions? 

R-tree construction is done with the script in: `script/build_rtree_index.py`

It creates a new table: species_rtree that will be used for the sql requests. 



