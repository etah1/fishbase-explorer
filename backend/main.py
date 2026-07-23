from dotenv import load_dotenv

load_dotenv()

import asyncio
import math

import httpx
import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import auth
import fishbase_data
import phylogeny_data
import submissions

app = FastAPI(title="FishBase Explorer API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://localhost:\d+|https://cichlidfishexplorer\.com",
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


def _clean(value):
    if isinstance(value, float) and math.isnan(value):
        return None
    if value is pd.NaT:
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
        "location": (["Continent", "Country"], "text"),
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
    q: str = Query(None),
    genus: str = Query(None),
    habitat: str = Query(None),
    max_length: float = Query(None),
    dangerous: str = Query(None),
    body_shape: str = Query(None),
    migration: str = Query(None),
    location: str = Query(None),
    sort_by: str = Query("species"),
    sort_dir: str = Query("asc"),
    limit: int = Query(50),
    offset: int = Query(0),
):
    async with httpx.AsyncClient(timeout=15) as client:
        df, version = await fishbase_data.get_species_table(client)

    if q:
        query = q.strip().casefold()
        if query:
            scientific_name = (
                df["Genus"].fillna("").astype(str)
                + " "
                + df["Species"].fillna("").astype(str)
            )
            common_name = df["FBname"].fillna("").astype(str)
            df = df[
                scientific_name.str.casefold().str.contains(query, regex=False)
                | common_name.str.casefold().str.contains(query, regex=False)
            ]
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
    if location:
        if location.startswith("Lake "):
            name = location.removeprefix("Lake ")
            df = df[df["Lake"].fillna("").str.contains(name, regex=False)]
        else:
            df = df[df["Continent"].fillna("").str.contains(location, regex=False)]

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


@app.get("/fish/species")
async def get_species():
    async with httpx.AsyncClient(timeout=15) as client:
        df, _ = await fishbase_data.get_species_table(client)
    species = (
        df[["Genus", "Species"]]
        .dropna()
        .drop_duplicates()
        .sort_values(["Genus", "Species"], key=lambda col: col.astype(str).str.casefold())
    )
    return {
        "species": [
            {"genus": row.Genus, "species": row.Species}
            for row in species.itertuples(index=False)
        ]
    }


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


@app.get("/fish/locations")
async def get_locations():
    async with httpx.AsyncClient(timeout=15) as client:
        locations = await fishbase_data.get_locations(client)
    return {"locations": locations}


@app.get("/fish/tree")
async def get_tree(trait: str = Query(None)):
    async with httpx.AsyncClient(timeout=30) as client:
        tree = await phylogeny_data.get_cichlid_tree(client, trait=trait)
    return tree


class SubmissionCreate(BaseModel):
    genus: str
    species: str
    field_name: str
    field_value: str
    source_citation: str = ""


class ReviewAction(BaseModel):
    review_notes: str | None = None


class DisplayNameUpdate(BaseModel):
    display_name: str


class SpeciesNoteUpdate(BaseModel):
    genus: str
    species: str
    note: str


class AdminDataOverrideCreate(BaseModel):
    genus: str
    species: str
    field_name: str
    field_value: str


@app.delete("/account")
async def delete_account(user: dict = Depends(auth.verify_token)):
    await asyncio.to_thread(submissions.delete_personal_species_notes, user)
    await asyncio.to_thread(auth.delete_user, user["user_id"])
    return {"status": "deleted"}


@app.post("/account/display-name")
async def update_display_name(
    payload: DisplayNameUpdate,
    user: dict = Depends(auth.verify_token),
):
    display_name = payload.display_name.strip()
    if len(display_name) > 60:
        raise HTTPException(status_code=422, detail="Display name must be 60 characters or fewer")
    await asyncio.to_thread(
        submissions.update_submitter_display_name,
        user,
        display_name,
    )
    await phylogeny_data.invalidate_trait_cache()
    return {"display_name": display_name}


@app.get("/species-notes")
async def get_species_note(
    genus: str = Query(...),
    species: str = Query(...),
    user: dict = Depends(auth.verify_token),
):
    note = await asyncio.to_thread(
        submissions.get_personal_species_note,
        user,
        genus,
        species,
    )
    return {"note": note}


@app.post("/species-notes")
async def save_species_note(
    payload: SpeciesNoteUpdate,
    user: dict = Depends(auth.verify_token),
):
    genus = payload.genus.strip()
    species = payload.species.strip()
    note = payload.note.strip()
    if not genus or not species:
        raise HTTPException(status_code=422, detail="Species is required")
    if len(note) > 2000:
        raise HTTPException(status_code=422, detail="Notes must be 2,000 characters or fewer")
    await asyncio.to_thread(
        submissions.save_personal_species_note,
        user,
        genus,
        species,
        note,
    )
    return {"note": note}


@app.get("/admin/status")
async def get_admin_status(user: dict = Depends(auth.verify_token)):
    return {"is_admin": auth.is_admin(user)}


@app.get("/admin/data-overrides")
async def get_admin_data_overrides(user: dict = Depends(auth.verify_token)):
    auth.require_admin(user)
    df = await asyncio.to_thread(submissions.list_admin_data_overrides)
    return {
        "data": _to_records(df),
        "fields": fishbase_data.ADMIN_EDITABLE_FIELDS,
    }


@app.post("/admin/data-overrides")
async def save_admin_data_override(
    payload: AdminDataOverrideCreate,
    user: dict = Depends(auth.verify_token),
):
    auth.require_admin(user)
    genus = payload.genus.strip()
    species = payload.species.strip()
    field_name = payload.field_name.strip()
    field_value = payload.field_value.strip()
    field_types = {
        field["key"]: field["type"] for field in fishbase_data.ADMIN_EDITABLE_FIELDS
    }
    if field_name not in field_types:
        raise HTTPException(status_code=422, detail="This field cannot be edited")
    if not genus or not species or not field_value:
        raise HTTPException(status_code=422, detail="Species and value are required")
    try:
        if field_types[field_name] == "integer":
            parsed_value = int(field_value)
            if field_name in {"Fresh", "Brackish", "Saltwater"} and parsed_value not in {0, 1}:
                raise ValueError
        elif field_types[field_name] == "number":
            float(field_value)
    except ValueError:
        raise HTTPException(status_code=422, detail="Enter a valid value for this field")

    async with httpx.AsyncClient(timeout=15) as client:
        species_df, _ = await fishbase_data.get_species_table(client)
    exists = ((species_df["Genus"] == genus) & (species_df["Species"] == species)).any()
    if not exists:
        raise HTTPException(status_code=404, detail="Species not found")

    override_id = await asyncio.to_thread(
        submissions.save_admin_data_override,
        user,
        genus,
        species,
        field_name,
        field_value,
    )
    await phylogeny_data.invalidate_trait_cache()
    return {"id": override_id}


@app.delete("/admin/data-overrides/{override_id}")
async def delete_admin_data_override(
    override_id: str,
    user: dict = Depends(auth.verify_token),
):
    auth.require_admin(user)
    deleted = await asyncio.to_thread(
        submissions.delete_admin_data_override,
        override_id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Override not found")
    await phylogeny_data.invalidate_trait_cache()
    return {"status": "deleted"}


@app.post("/submissions")
async def post_submission(payload: SubmissionCreate, user: dict = Depends(auth.verify_token)):
    submission_id = await asyncio.to_thread(
        submissions.create_submission,
        user,
        payload.genus,
        payload.species,
        payload.field_name,
        payload.field_value,
        payload.source_citation,
    )
    return {"id": submission_id}


@app.get("/submissions/mine")
async def get_my_submissions(user: dict = Depends(auth.verify_token)):
    df = await asyncio.to_thread(submissions.list_own_submissions, user)
    return {"data": _to_records(df)}


@app.delete("/submissions/{submission_id}")
async def delete_my_submission(
    submission_id: str,
    user: dict = Depends(auth.verify_token),
):
    deleted = await asyncio.to_thread(
        submissions.delete_own_submission,
        user,
        submission_id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Submission not found")
    await phylogeny_data.invalidate_trait_cache()
    return {"status": "deleted"}


@app.get("/submissions/pending")
async def get_pending_submissions(user: dict = Depends(auth.verify_token)):
    auth.require_admin(user)
    df = await asyncio.to_thread(submissions.list_pending_submissions)
    return {"data": _to_records(df)}


@app.post("/submissions/{submission_id}/approve")
async def approve_submission(
    submission_id: str, payload: ReviewAction, user: dict = Depends(auth.verify_token)
):
    auth.require_admin(user)
    ok = await asyncio.to_thread(
        submissions.review_submission, submission_id, user["user_id"], "approved", payload.review_notes
    )
    if not ok:
        raise HTTPException(status_code=404, detail="No pending submission with this id")
    await phylogeny_data.invalidate_trait_cache()
    return {"status": "approved"}


@app.post("/submissions/{submission_id}/reject")
async def reject_submission(
    submission_id: str, payload: ReviewAction, user: dict = Depends(auth.verify_token)
):
    auth.require_admin(user)
    ok = await asyncio.to_thread(
        submissions.review_submission, submission_id, user["user_id"], "rejected", payload.review_notes
    )
    if not ok:
        raise HTTPException(status_code=404, detail="No pending submission with this id")
    return {"status": "rejected"}
