from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI(title="FishBase Explorer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

FISHBASE_URL = "https://fishbase.ropensci.org/fishbase"

@app.get("/fish")
async def get_fish(
    family: str = Query(None),
    habitat: str = Query(None),
    max_length: float = Query(None),
    dangerous: bool = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
):
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(f"{FISHBASE_URL}/species", params={"limit": 500})
        res.raise_for_status()
        data = res.json().get("data", [])

    if family:
        data = [f for f in data if f.get("Family") == family]
    if habitat == "fresh":
        data = [f for f in data if f.get("Fresh") == 1]
    elif habitat == "salt":
        data = [f for f in data if f.get("Saltwater") == 1]
    elif habitat == "brackish":
        data = [f for f in data if f.get("Brackish") == 1]
    if max_length is not None:
        data = [f for f in data if f.get("Length") is not None and f.get("Length") <= max_length]
    if dangerous is not None:
        data = [f for f in data if bool(f.get("Dangerous")) == dangerous]

    total = len(data)
    page = data[offset : offset + limit]
    return {"data": page, "total": total, "offset": offset, "limit": limit}


@app.get("/fish/families")
async def get_families():
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(f"{FISHBASE_URL}/species", params={"limit": 500})
        res.raise_for_status()
        data = res.json().get("data", [])

    families = sorted(set(f["Family"] for f in data if f.get("Family")))
    return {"families": families}
