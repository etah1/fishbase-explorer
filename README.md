# Cichlid Explorer

A filtering web app for Cichlidae (cichlid) species, using FastAPI (backend)
and Next.js (frontend).

## Data source

FishBase's old REST API (`fishbase.ropensci.org`) is deprecated. Data now
ships as dated Parquet snapshots on [Source Cooperative](https://source.coop/),
the same source the `rfishbase` R package uses
(https://github.com/ropensci/rfishbase).

There's no live feed, just dated releases every few months. The backend
checks the release listing on every request and only reloads the
species/family tables when a newer release shows up, so it stays current
without re-downloading data on every call.

## Phylogeny

The species table also pulls a few reproductive/brain/diet traits from
FishBase's `reproduc`, `brains`, and `ecology` tables (fertilization site,
parental care, mating system, encephalization, feeding type). FishBase has
no ancestry data itself, so the tree shape comes from a separate source,
[Fish Tree of Life](https://fishtreeoflife.org) (a time-calibrated phylogeny
of ~12k ray-finned fish). Only species with an exact name match in that tree
are shown, currently 650 of our 1,790 cichlids, with trait coverage on top
of that varying a lot by field (e.g. mating system is only known for a
handful of species).

## Structure

```
fishbase-explorer/
├── backend/
│   ├── main.py             # FastAPI server
│   ├── fishbase_data.py    # Live-checking Parquet data layer
│   ├── phylogeny_data.py   # Tree pruning + trait attachment
│   └── requirements.txt
└── frontend/
    ├── app/
    │   ├── page.tsx        # Landing page
    │   ├── fish/page.tsx   # Filter UI
    │   └── tree/page.tsx   # Phylogeny view
    └── components/
        ├── FishTable.tsx
        └── PhyloTree.tsx
```

## Running locally

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000/fish

## Filters
- Genus (dropdown, scoped to Cichlidae)
- Habitat: freshwater / saltwater / brackish
- Max length (cm)
- Dangerous category (e.g. harmless, venomous, traumatogenic)
