# Cichlid Explorer

Cichlid Explorer is a FastAPI and Next.js app for browsing FishBase cichlid data and viewing a trait-filtered phylogeny.

## What it does

- Browse 1,790 Cichlidae species from FishBase snapshots.
- Filter by genus, habitat, length, danger category, body shape, migration, and location.
- Search by scientific name or FishBase common name.
- Sort the species table by common fields.
- View a phylogeny built from Open Tree of Life topology.
- Filter the phylogeny to species with data for selected traits.
- Exclude individual species from the phylogeny view.
- Print the phylogeny view with legend, tree, and source note.
- Toggle dark mode.

## Data source

FishBase's old REST API is deprecated, so the backend reads dated Parquet snapshots from Source Cooperative. These are the same FishBase snapshots used by the `rfishbase` R package.

The backend checks the available FishBase release version and reloads cached tables only when a newer release appears.

Main tables used:

- `species`
- `families`
- `reproduc`
- `brains`
- `ecology`
- `country`
- `countref`
- `ecosystem`
- `ecosystemref`
- `stocks`
- `popgrowth`

## Phylogeny

FishBase does not provide ancestry data. The app uses Open Tree of Life for topology, then attaches FishBase traits to the matching species.

Not every FishBase species has an exact Open Tree of Life match. Unmatched species are placed as unresolved branches near their genus when possible, or near their subfamily when no genus anchor exists. Manual corrections live in `backend/tree_overrides.json` and are applied by `backend/tree_overrides.py`.

The tree is a phylogenetic relationship tree. It is not time-calibrated, so branch lengths should not be read as divergence time.

## Project structure

```text
fishbase-explorer/
  backend/
    main.py              FastAPI routes
    fishbase_data.py     FishBase snapshot loading and cache logic
    phylogeny_data.py    Open Tree loading, grafting, and trait attachment
    tree_overrides.py    Manual topology correction application
    tree_overrides.json  Saved manual topology corrections
    manage_overrides.py  CLI for validating and adding corrections
    requirements.txt     Backend dependencies
  frontend/
    app/
      layout.tsx         Root layout and navbar
      page.tsx           Species table view
      tree/page.tsx      Phylogeny view
      globals.css        Global styles, dark mode, print styles
    components/
      FishTable.tsx
      PhyloTree.tsx
      MultiSelectDropdown.tsx
      NavBar.tsx
      DarkModeToggle.tsx
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

Open `http://localhost:3000`.

## Admin tree overrides

Use the CLI instead of editing `tree_overrides.json` by hand. It validates taxa against the current tree before writing a correction.

```bash
cd backend
python manage_overrides.py move-taxon --taxon "Genus_species" --new-parent-clade "Other_species,Another_species" --source "Citation"
python manage_overrides.py move-clade --taxa "sp1,sp2" --new-parent-clade "sp3,sp4" --source "Citation"
python manage_overrides.py mark-unplaced --taxon "Genus_species" --source "Citation"
python manage_overrides.py list
```

## Notes

- The phylogeny print button opens the browser print dialog. Use "Save as PDF" there.
- The printed phylogeny is scaled to include the full SVG tree.
- Dark mode swaps black and white UI colors on the phylogeny while keeping data colors stable.
