# Real evolutionary tree data, pruned to our Cichlidae species.
# FishBase has no ancestry/phylogeny data, so this comes from a separate
# source: Fish Tree of Life (https://fishtreeoflife.org), a time-calibrated
# phylogeny covering ~12k ray-finned fish species. Only species with an
# exact name match in that tree can be placed on it.

import asyncio
import lzma
import math

import dendropy
import httpx

import fishbase_data

TREE_URL = "https://fishtreeoflife.org/downloads/actinopt_12k_treePL.tre.xz"

_lock = asyncio.Lock()
_cache: dict = {"etag": None, "fish_version": None, "raw_xz": None, "trees": {}}


def _clean(value):
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def _node_to_dict(node, traits_by_name):
    out = {"length": node.edge.length or 0}
    if node.taxon:
        name = node.taxon.label.replace(" ", "_")
        out["name"] = name
        out["traits"] = traits_by_name.get(name, {})
    children = node.child_nodes()
    if children:
        out["children"] = [_node_to_dict(c, traits_by_name) for c in children]
    return out


def _build_tree(raw_xz: bytes, traits_by_name: dict):
    newick = lzma.decompress(raw_xz).decode()
    tree = dendropy.Tree.get(data=newick, schema="newick")
    taxa_to_retain = [
        t for t in tree.taxon_namespace
        if t.label.replace(" ", "_") in traits_by_name
    ]
    tree.retain_taxa(taxa_to_retain)
    return _node_to_dict(tree.seed_node, traits_by_name)


async def get_cichlid_tree(client: httpx.AsyncClient, trait: str | None = None):
    head = await client.head(TREE_URL)
    etag = head.headers.get("etag")

    async with httpx.AsyncClient(timeout=15) as fb_client:
        df, fish_version = await fishbase_data.get_species_table(fb_client)

    traits_by_name = {
        f"{row['Genus']}_{row['Species']}": {
            field: _clean(row[field]) for field in fishbase_data.TRAIT_FIELDS + ["Encephalization"]
        }
        for row in df.to_dict(orient="records")
    }

    cache_key = trait or "__all__"
    async with _lock:
        if _cache["etag"] != etag or _cache["fish_version"] != fish_version:
            res = await client.get(TREE_URL)
            res.raise_for_status()
            _cache["etag"] = etag
            _cache["fish_version"] = fish_version
            _cache["raw_xz"] = res.content
            _cache["trees"] = {}

        if cache_key not in _cache["trees"]:
            if trait:
                wanted = {
                    name: values
                    for name, values in traits_by_name.items()
                    if values.get(trait) is not None
                }
            else:
                wanted = traits_by_name
            _cache["trees"][cache_key] = await asyncio.to_thread(
                _build_tree,
                _cache["raw_xz"],
                wanted,
            )

    return _cache["trees"][cache_key]
