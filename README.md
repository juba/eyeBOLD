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
CREATE INDEX IF NOT EXISTS idx_taxon_genus        ON specimen(taxon_genus);
CREATE INDEX IF NOT EXISTS idx_taxon_species      ON specimen(taxon_species);

-- === Identification rank ===
CREATE INDEX IF NOT EXISTS idx_identification_rank ON specimen(identification_rank);

-- === Specimen join for primer pairs ===
CREATE INDEX IF NOT EXISTS idx_primer_specimen_id ON primer_pairs(specimenid);
CREATE INDEX IF NOT EXISTS idx_primer_forward_match ON primer_pairs(forward_match_id);
CREATE INDEX IF NOT EXISTS idx_primer_reverse_match ON primer_pairs(reverse_match_id);

-- === Countries and zones ===
CREATE INDEX idx_species_countries_key_code ON species_countries(gbif_key, country_code);
CREATE INDEX idx_species_zones_key_zone ON species_zones(gbif_key, zone);

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



