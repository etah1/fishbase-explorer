# FishBase data comes from versioned Source Cooperative Parquet snapshots.

import asyncio
import re
import time
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
VERSION_CHECK_TTL_SECONDS = 60 * 60

_lock = asyncio.Lock()
_cache: dict = {
    "version": None,
    "version_checked_at": 0.0,
    "species": None,
    "dangerous_categories": None,
    "genera": None,
    "body_shapes": None,
    "migration_categories": None,
    "locations": None,
}


async def get_latest_version(client: httpx.AsyncClient) -> str:
    now = time.monotonic()
    cached_version = _cache["version"]
    if cached_version and now - _cache["version_checked_at"] < VERSION_CHECK_TTL_SECONDS:
        return cached_version

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
    version = max(versions, key=lambda v: tuple(int(p) for p in v.split(".")))
    _cache["version_checked_at"] = now
    return version


def _load_species(version: str):
    con = duckdb.connect()
    species_url = f"{DATA_URL}/v{version}/parquet/species.parquet"
    families_url = f"{DATA_URL}/v{version}/parquet/families.parquet"
    reproduc_url = f"{DATA_URL}/v{version}/parquet/reproduc.parquet"
    brains_url = f"{DATA_URL}/v{version}/parquet/brains.parquet"
    ecology_url = f"{DATA_URL}/v{version}/parquet/ecology.parquet"
    country_url = f"{DATA_URL}/v{version}/parquet/country.parquet"
    countref_url = f"{DATA_URL}/v{version}/parquet/countref.parquet"
    ecosystem_url = f"{DATA_URL}/v{version}/parquet/ecosystem.parquet"
    ecosystemref_url = f"{DATA_URL}/v{version}/parquet/ecosystemref.parquet"
    stocks_url = f"{DATA_URL}/v{version}/parquet/stocks.parquet"
    popgrowth_url = f"{DATA_URL}/v{version}/parquet/popgrowth.parquet"
    df = con.sql(f"""
        SELECT
            s.SpecCode, s.Genus, s.Species, s.FBname,
            f.Family, s.Subfamily,
            s.Fresh, s.Brack AS Brackish, s.Saltwater,
            s.Length, s.Dangerous,
            lower(s.BodyShapeI) AS BodyShapeI,
            nullif(trim(s.AnaCat), '') AS AnaCat,
            r.Fertilization,
            r.ParentalCare,
            r.RepGuild1,
            lower(r.RepGuild2) AS RepGuild2,
            r.MatingSystem,
            br.Encephalization,
            e.FeedingType,
            geo.Country,
            geo.Continent,
            lakes.Lake,
            iucn.IUCN_Code,
            growth.GrowthRate
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
        LEFT JOIN (
            SELECT
                co.SpecCode,
                string_agg(DISTINCT cr.PAESE, '; ') AS Country,
                string_agg(DISTINCT cr.Continent, '; ') AS Continent
            FROM read_parquet('{country_url}') co
            JOIN read_parquet('{countref_url}') cr USING (C_Code)
            WHERE lower(co.Status) IN ('native', 'endemic')
            GROUP BY co.SpecCode
        ) geo USING (SpecCode)
        LEFT JOIN (
            SELECT eco.Speccode AS SpecCode, string_agg(DISTINCT er.EcosystemName, '; ') AS Lake
            FROM read_parquet('{ecosystem_url}') eco
            JOIN read_parquet('{ecosystemref_url}') er USING (E_CODE)
            WHERE lower(eco.Status) IN ('native', 'endemic') AND er.EcosystemType = 'Lake'
            GROUP BY eco.Speccode
        ) lakes USING (SpecCode)
        LEFT JOIN (
            SELECT SpecCode, IUCN_Code
            FROM read_parquet('{stocks_url}')
            QUALIFY ROW_NUMBER() OVER (PARTITION BY SpecCode ORDER BY IUCN_DateAssessed DESC NULLS LAST) = 1
        ) iucn USING (SpecCode)
        LEFT JOIN (
            SELECT SpecCode, AVG(K) AS GrowthRate
            FROM read_parquet('{popgrowth_url}')
            WHERE K IS NOT NULL
            GROUP BY SpecCode
        ) growth USING (SpecCode)
        WHERE f.Family = 'Cichlidae'
        ORDER BY lower(s.Genus), lower(s.Species)
    """).df()
    con.close()
    return df


def _split_values(column) -> set[str]:
    values: set[str] = set()
    for cell in column.dropna():
        values.update(part.strip() for part in cell.split(";"))
    return values


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
            lakes = sorted(f"Lake {name}" for name in _split_values(df["Lake"]))
            continents = sorted(_split_values(df["Continent"]))
            _cache["locations"] = lakes + continents
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


async def get_locations(client: httpx.AsyncClient):
    await get_species_table(client)
    return _cache["locations"]



