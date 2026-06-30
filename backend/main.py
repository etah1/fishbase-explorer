from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx
import math

import fishbase_data
import phylogeny_data

app = FastAPI(title="FishBase Explorer API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://localhost:\d+|https://cichlidfishexplorer\.com",
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _clean(value):
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def _to_records(df):
    return [{k: _clean(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


def _habitat_label(row):
    habitats = []
    if row["Fresh"] == 1:
        habitats.append("Fresh")
    if row["Saltwater"] == 1:
        habitats.append("Salt")
    if row["Brackish"] == 1:
        habitats.append("Brackish")
    return ", ".join(habitats)


def _sort_fish(df, sort_by: str, sort_dir: str):
    ascending = sort_dir != "desc"
    sort_map = {
        "species": (["Genus", "Species"], "text"),
        "common_name": (["FBname"], "text"),
        "habitat": (["HabitatSort"], "text"),
        "length": (["Length"], "number"),
        "dangerous": (["Dangerous"], "text"),
        "body_shape": (["BodyShapeI"], "text"),
        "migration": (["AnaCat"], "text"),
    }
    by, kind = sort_map.get(sort_by, sort_map["species"])
    df = df.copy()
    df["HabitatSort"] = df.apply(_habitat_label, axis=1)
    if kind == "number":
        return df.sort_values(by=by, ascending=ascending, na_position="last", kind="mergesort")
    return df.sort_values(
        by=by,
        ascending=ascending,
        na_position="last",
        key=lambda col: col.fillna("").astype(str).str.strip().str.casefold(),
        kind="mergesort",
    )


@app.get("/fish")
async def get_fish(
    genus: str = Query(None),
    habitat: str = Query(None),
    max_length: float = Query(None),
    dangerous: str = Query(None),
    body_shape: str = Query(None),
    migration: str = Query(None),
    sort_by: str = Query("species"),
    sort_dir: str = Query("asc"),
    limit: int = Query(50),
    offset: int = Query(0),
):
    async with httpx.AsyncClient(timeout=15) as client:
        df, version = await fishbase_data.get_species_table(client)

    if genus:
        df = df[df["Genus"] == genus]
    if habitat == "fresh":
        df = df[df["Fresh"] == 1]
    elif habitat == "salt":
        df = df[df["Saltwater"] == 1]
    elif habitat == "brackish":
        df = df[df["Brackish"] == 1]
    if max_length is not None:
        df = df[df["Length"].notna() & (df["Length"] <= max_length)]
    if dangerous:
        df = df[df["Dangerous"] == dangerous]
    if body_shape:
        df = df[df["BodyShapeI"] == body_shape]
    if migration:
        df = df[df["AnaCat"] == migration]

    df = _sort_fish(df, sort_by, sort_dir)

    total = len(df)

    page = df.iloc[offset : offset + limit]
    return {
        "data": _to_records(page),
        "total": total,
        "offset": offset,
        "limit": limit,
        "fishbase_version": version,
    }


@app.get("/fish/genera")
async def get_genera():
    async with httpx.AsyncClient(timeout=15) as client:
        genera = await fishbase_data.get_genera(client)
    return {"genera": genera}


@app.get("/fish/dangerous-categories")
async def get_dangerous_categories():
    async with httpx.AsyncClient(timeout=15) as client:
        categories = await fishbase_data.get_dangerous_categories(client)
    return {"categories": categories}


@app.get("/fish/body-shapes")
async def get_body_shapes():
    async with httpx.AsyncClient(timeout=15) as client:
        shapes = await fishbase_data.get_body_shapes(client)
    return {"shapes": shapes}


@app.get("/fish/migration-categories")
async def get_migration_categories():
    async with httpx.AsyncClient(timeout=15) as client:
        categories = await fishbase_data.get_migration_categories(client)
    return {"categories": categories}


@app.get("/fish/tree")
async def get_tree(trait: str = Query(None)):
    async with httpx.AsyncClient(timeout=30) as client:
        tree = await phylogeny_data.get_cichlid_tree(client, trait=trait)
    return tree



