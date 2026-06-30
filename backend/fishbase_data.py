# FishBase's REST API (fishbase.ropensci.org) is dead. Data now ships as
# dated Parquet snapshots on Source Cooperative S3 (same source as
# rfishbase 5: https://github.com/ropensci/rfishbase). We check the bucket
# listing on every request and only reload the tables when the version
# changes, so we're never more than one upstream release behind.

import asyncio
import re
import xml.etree.ElementTree as ET

import duckdb
import httpx

BUCKET = "us-west-2.opendata.source.coop"
PREFIX = "cboettig/fishbase/fb/"
LIST_URL = f"https://s3.us-west-2.amazonaws.com/{BUCKET}?list-type=2&prefix={PREFIX}&delimiter=/"
DATA_URL = "https://data.source.coop/cboettig/fishbase/fb"

_S3_NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
_VERSION_RE = re.compile(r"v(\d+\.\d+)/$")

TRAIT_FIELDS = ["Fertilization", "ParentalCare", "RepGuild1", "RepGuild2", "MatingSystem", "FeedingType"]

_lock = asyncio.Lock()
_cache: dict = {
    "version": None,
    "species": None,
    "dangerous_categories": None,
    "genera": None,
    "trait_categories": None,
    "body_shapes": None,
    "migration_categories": None,
}


async def get_latest_version(client: httpx.AsyncClient) -> str:
    res = await client.get(LIST_URL)
    res.raise_for_status()
    root = ET.fromstring(res.text)
    versions = []
    for prefix_el in root.findall(".//s3:CommonPrefixes/s3:Prefix", _S3_NS):
        match = _VERSION_RE.search(prefix_el.text or "")
        if match:
            versions.append(match.group(1))
    if not versions:
        raise RuntimeError("No FishBase release versions found in bucket listing")
    return max(versions, key=lambda v: tuple(int(p) for p in v.split(".")))


def _load_species(version: str):
    con = duckdb.connect()
    species_url = f"{DATA_URL}/v{version}/parquet/species.parquet"
    families_url = f"{DATA_URL}/v{version}/parquet/families.parquet"
    reproduc_url = f"{DATA_URL}/v{version}/parquet/reproduc.parquet"
    brains_url = f"{DATA_URL}/v{version}/parquet/brains.parquet"
    ecology_url = f"{DATA_URL}/v{version}/parquet/ecology.parquet"
    df = con.sql(f"""
        SELECT
            s.SpecCode, s.Genus, s.Species, s.FBname,
            f.Family, s.Fresh, s.Brack AS Brackish, s.Saltwater,
            s.Length, s.Dangerous,
            lower(s.BodyShapeI) AS BodyShapeI,
            nullif(trim(s.AnaCat), '') AS AnaCat,
            r.Fertilization,
            r.ParentalCare,
            r.RepGuild1,
            lower(r.RepGuild2) AS RepGuild2,
            r.MatingSystem,
            br.Encephalization,
            e.FeedingType
        FROM read_parquet('{species_url}') s
        JOIN read_parquet('{families_url}') f USING (FamCode)
        LEFT JOIN (
            SELECT SpecCode, Fertilization, ParentalCare, RepGuild1, RepGuild2, MatingSystem
            FROM read_parquet('{reproduc_url}')
            QUALIFY ROW_NUMBER() OVER (PARTITION BY SpecCode ORDER BY autoctr) = 1
        ) r USING (SpecCode)
        LEFT JOIN (
            SELECT SpecCode, AVG(EncCoeff) AS Encephalization
            FROM read_parquet('{brains_url}')
            GROUP BY SpecCode
        ) br USING (SpecCode)
        LEFT JOIN (
            SELECT SpecCode, FeedingType
            FROM read_parquet('{ecology_url}')
            QUALIFY ROW_NUMBER() OVER (PARTITION BY SpecCode ORDER BY autoctr) = 1
        ) e USING (SpecCode)
        WHERE f.Family = 'Cichlidae'
        ORDER BY lower(s.Genus), lower(s.Species)
    """).df()
    con.close()
    return df


async def get_species_table(client: httpx.AsyncClient):
    version = await get_latest_version(client)
    async with _lock:
        if _cache["version"] != version:
            df = await asyncio.to_thread(_load_species, version)
            df["Dangerous"] = df["Dangerous"].replace("None", None)
            _cache["version"] = version
            _cache["species"] = df
            _cache["dangerous_categories"] = sorted(
                c for c in df["Dangerous"].dropna().unique()
            )
            _cache["genera"] = sorted(df["Genus"].dropna().unique())
            _cache["body_shapes"] = sorted(df["BodyShapeI"].dropna().unique())
            _cache["migration_categories"] = sorted(df["AnaCat"].dropna().unique())
            _cache["trait_categories"] = {
                field: sorted(c for c in df[field].dropna().unique())
                for field in TRAIT_FIELDS
            }
    return _cache["species"], _cache["version"]


async def get_dangerous_categories(client: httpx.AsyncClient):
    await get_species_table(client)
    return _cache["dangerous_categories"]


async def get_genera(client: httpx.AsyncClient):
    await get_species_table(client)
    return _cache["genera"]


async def get_body_shapes(client: httpx.AsyncClient):
    await get_species_table(client)
    return _cache["body_shapes"]


async def get_migration_categories(client: httpx.AsyncClient):
    await get_species_table(client)
    return _cache["migration_categories"]


async def get_trait_categories(client: httpx.AsyncClient):
    await get_species_table(client)
    return _cache["trait_categories"]


