from dotenv import load_dotenv

load_dotenv()

import asyncio
import math
import uuid
from contextlib import asynccontextmanager

import httpx
import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import auth
import bulk_upload
import fishbase_data
import phylogeny_data
import submissions

# Constructing an AsyncClient costs ~0.5s (SSL context + pool setup), so one is shared
# for the app's lifetime. The pool is bounded on purpose: this runs on a 512MB Render
# instance. The tree path is unaffected by the 15s default -- phylogeny_data passes its
# own longer per-request timeouts, which take precedence.
http_client: httpx.AsyncClient | None = None
_HTTP_LIMITS = httpx.Limits(max_connections=10, max_keepalive_connections=5)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(timeout=15, limits=_HTTP_LIMITS)
    try:
        yield
    finally:
        await http_client.aclose()
        http_client = None


app = FastAPI(title="FishBase Explorer API", lifespan=lifespan)

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
    df, version = await fishbase_data.get_species_table(http_client)

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
    genera = await fishbase_data.get_genera(http_client)
    return {"genera": genera}


@app.get("/fish/species")
async def get_species():
    df, _ = await fishbase_data.get_species_table(http_client)
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
    categories = await fishbase_data.get_dangerous_categories(http_client)
    return {"categories": categories}


@app.get("/fish/body-shapes")
async def get_body_shapes():
    shapes = await fishbase_data.get_body_shapes(http_client)
    return {"shapes": shapes}


@app.get("/fish/migration-categories")
async def get_migration_categories():
    categories = await fishbase_data.get_migration_categories(http_client)
    return {"categories": categories}


@app.get("/fish/locations")
async def get_locations():
    locations = await fishbase_data.get_locations(http_client)
    return {"locations": locations}


@app.get("/fish/tree")
async def get_tree(trait: str = Query(None)):
    tree = await phylogeny_data.get_cichlid_tree(http_client, trait=trait)
    return tree


class SubmissionCreate(BaseModel):
    genus: str
    species: str
    field_name: str
    field_value: str
    source_citation: str = ""


class BulkChange(BaseModel):
    genus: str
    species: str
    field_name: str
    field_value: str
    source_citation: str = ""


class BulkSubmissionCreate(BaseModel):
    changes: list[BulkChange]
    default_citation: str = ""


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
    fishbase_data.invalidate_community_cache()
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

    species_df, _ = await fishbase_data.get_species_table(http_client)
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
    fishbase_data.invalidate_community_cache()
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
    fishbase_data.invalidate_community_cache()
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


def _require_uuid(value: str, detail: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(status_code=404, detail=detail)


async def _already_submitted(user: dict) -> set:
    own = await asyncio.to_thread(submissions.list_own_submissions, user)
    return bulk_upload.already_submitted_keys(own)


@app.get("/submissions/template")
async def download_submission_template():
    """Public CSV of every species with its current values, for bulk editing."""
    df, version = await fishbase_data.get_species_table(http_client)
    text = await asyncio.to_thread(bulk_upload.build_template_csv, df)
    return Response(
        content=text.encode("utf-8-sig"),  # BOM so Excel opens it as UTF-8
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="cichlid-traits-template-v{version}.csv"'
        },
    )


@app.post("/submissions/bulk/preview")
async def preview_bulk_submission(
    request: Request,
    filename: str = Query(...),
    user: dict = Depends(auth.verify_token),
):
    """Parse an uploaded CSV/XLSX (raw request body) and report what would be
    submitted. Nothing is saved."""
    declared = int(request.headers.get("content-length") or 0)
    if declared > bulk_upload.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 5 MB.")
    data = await request.body()
    df, _ = await fishbase_data.get_species_table(http_client)
    existing = await _already_submitted(user)
    try:
        return await asyncio.to_thread(bulk_upload.preview_file, filename, data, df, existing)
    except bulk_upload.BulkUploadError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.post("/submissions/bulk")
async def post_bulk_submission(
    payload: BulkSubmissionCreate,
    user: dict = Depends(auth.verify_token),
):
    """Re-validate previewed changes server-side and store them as one pending batch."""
    if not payload.changes:
        raise HTTPException(status_code=422, detail="Nothing to submit.")
    if len(payload.changes) > bulk_upload.MAX_CHANGES:
        raise HTTPException(
            status_code=422,
            detail=f"Upload at most {bulk_upload.MAX_CHANGES:,} values at a time.",
        )
    default_citation = payload.default_citation.strip()
    cells = [
        {
            "row": i + 1,
            "genus": c.genus,
            "species": c.species,
            "field_name": c.field_name.strip(),
            "value": c.field_value,
            "source_citation": c.source_citation.strip() or default_citation,
        }
        for i, c in enumerate(payload.changes)
    ]
    df, _ = await fishbase_data.get_species_table(http_client)
    existing = await _already_submitted(user)
    result = await asyncio.to_thread(
        bulk_upload.evaluate, cells, bulk_upload.SpeciesContext(df), existing
    )
    if result["errors"]:
        first = result["errors"][0]
        raise HTTPException(
            status_code=422,
            detail=f"{result['error_count']} value(s) failed validation, e.g. {first['message']}",
        )
    if not result["changes"]:
        raise HTTPException(status_code=422, detail="Nothing new to submit.")
    batch_id = await asyncio.to_thread(
        submissions.create_submission_batch, user, result["changes"]
    )
    return {"batch_id": batch_id, "count": len(result["changes"])}


@app.delete("/submissions/batches/{batch_id}")
async def delete_my_batch(batch_id: str, user: dict = Depends(auth.verify_token)):
    batch_id = _require_uuid(batch_id, "Upload not found")
    deleted = await asyncio.to_thread(submissions.delete_own_batch, user, batch_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Upload not found")
    fishbase_data.invalidate_community_cache()
    await phylogeny_data.invalidate_trait_cache()
    return {"status": "deleted", "count": deleted}


@app.post("/submissions/batches/{batch_id}/approve")
async def approve_batch(
    batch_id: str, payload: ReviewAction, user: dict = Depends(auth.verify_token)
):
    auth.require_admin(user)
    batch_id = _require_uuid(batch_id, "No pending submissions in this upload")
    count = await asyncio.to_thread(
        submissions.review_batch, batch_id, user["user_id"], "approved", payload.review_notes
    )
    if not count:
        raise HTTPException(status_code=404, detail="No pending submissions in this upload")
    fishbase_data.invalidate_community_cache()
    await phylogeny_data.invalidate_trait_cache()
    return {"status": "approved", "count": count}


@app.post("/submissions/batches/{batch_id}/reject")
async def reject_batch(
    batch_id: str, payload: ReviewAction, user: dict = Depends(auth.verify_token)
):
    auth.require_admin(user)
    batch_id = _require_uuid(batch_id, "No pending submissions in this upload")
    count = await asyncio.to_thread(
        submissions.review_batch, batch_id, user["user_id"], "rejected", payload.review_notes
    )
    if not count:
        raise HTTPException(status_code=404, detail="No pending submissions in this upload")
    return {"status": "rejected", "count": count}


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
    fishbase_data.invalidate_community_cache()
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
    fishbase_data.invalidate_community_cache()
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
