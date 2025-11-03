# eyeBOLD

## Notes for development

To run the server simply type
`uvicorn app:app --reload --port 8000`

## Indexing
Indexing is needed for the GUI to be usable. Here is how it must be done: (it's an example, depends on columns returned)

```sql
-- === Taxonomy filters ===
CREATE INDEX IF NOT EXISTS idx_taxon_kingdom      ON specimen(taxon_kingdom);
CREATE INDEX IF NOT EXISTS idx_taxon_phylum       ON specimen(taxon_phylum);
CREATE INDEX IF NOT EXISTS idx_taxon_class        ON specimen(taxon_class);
CREATE INDEX IF NOT EXISTS idx_taxon_order        ON specimen(taxon_order);
CREATE INDEX IF NOT EXISTS idx_taxon_family       ON specimen(taxon_family);
CREATE INDEX IF NOT EXISTS idx_taxon_subfamily    ON specimen(taxon_subfamily);
CREATE INDEX IF NOT EXISTS idx_taxon_tribe        ON specimen(taxon_tribe);
CREATE INDEX IF NOT EXISTS idx_taxon_genus        ON specimen(taxon_genus);
CREATE INDEX IF NOT EXISTS idx_taxon_species      ON specimen(taxon_species);
CREATE INDEX IF NOT EXISTS idx_taxon_subspecies   ON specimen(taxon_subspecies);

-- === Identification rank ===
CREATE INDEX IF NOT EXISTS idx_identification_rank ON specimen(identification_rank);

-- === Country filter ===
CREATE INDEX IF NOT EXISTS idx_country_iso ON specimen(country_iso);

-- === Climate join ===
CREATE INDEX IF NOT EXISTS idx_climate_taxonkey ON climate_data(taxon_key);

-- === Checks bitmask (used in filters like ((checks >> 2) & 1) = 0) ===
-- Bitwise operations are not indexable, so no index helps here.

-- === Specimen join for primer pairs ===
CREATE INDEX IF NOT EXISTS idx_primer_specimen_id ON primer_pairs(specimen_id);
CREATE INDEX IF NOT EXISTS idx_primer_forward_match ON primer_pairs(forward_match_id);
CREATE INDEX IF NOT EXISTS idx_primer_reverse_match ON primer_pairs(reverse_match_id);

-- Optional composite indexes (these can greatly help on big datasets)
CREATE INDEX IF NOT EXISTS idx_rank_country ON specimen(identification_rank, country_iso);
CREATE INDEX IF NOT EXISTS idx_taxon_class_family ON specimen(taxon_class, taxon_family);
```


## TODO list / new functionalities
- [ ] write clean code to extract taxonomy from db and write it in json
- [ ] write clean code toextract countries from db and format it into a json
- [ ] idem for climatic zones
- [ ] Add continent info somewhere to help organize countries better
- [ ] Add search bar for taxo

## SPATIAL DATA: what to do

We chose for easy request of points in cell boxes to use a simple R-tree for storing efficiently the lat lon coordinates of points. 
It is very efficient for 700000 points. Let's see later for other solutions? 

R-tree construction is done with the script in: `script/build_rtree_index.py`

It creates a new table: species_rtree that will be used for the sql requests. 



