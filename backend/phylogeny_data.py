# Open Tree of Life supplies topology; unmatched taxa are grafted as unresolved genus or subfamily branches.

import asyncio
import re
from collections import defaultdict

import dendropy
import httpx

import fishbase_data
import tree_overrides

MATCH_URL = "https://api.opentreeoflife.org/v3/tnrs/match_names"
SUBTREE_URL = "https://api.opentreeoflife.org/v3/tree_of_life/induced_subtree"
TNRS_BATCH_SIZE = 1000
_OTT_SUFFIX_RE = re.compile(r"_ott\d+$")

_lock = asyncio.Lock()
_cache: dict = {"fish_version": None, "newick": None, "trees": {}}


async def invalidate_trait_cache() -> None:
    """Rebuild trait-decorated trees without refetching the topology backbone."""
    async with _lock:
        _cache["trees"] = {}


def _clean(value):
    if isinstance(value, float) and value != value:
        return None
    return value


def _node_to_dict(node, traits_by_name):
    out = {"length": 1}
    if node.is_leaf() and node.taxon:
        name = node.taxon.label
        out["name"] = name
        traits = traits_by_name.get(name, {})
        out["traits"] = {
            key: value for key, value in traits.items() if key != "_CommunityContributions"
        }
        out["contributions"] = traits.get("_CommunityContributions") or []
    children = node.child_nodes()
    if children:
        out["children"] = [_node_to_dict(c, traits_by_name) for c in children]
    return out


async def _resolve_ott_ids(client: httpx.AsyncClient, names: list[str]) -> dict[str, int]:
    """Map 'Genus species' -> OTT id for names that resolve unambiguously."""
    name_to_ott: dict[str, int] = {}
    for i in range(0, len(names), TNRS_BATCH_SIZE):
        batch = names[i : i + TNRS_BATCH_SIZE]
        res = await client.post(
            MATCH_URL,
            json={"names": batch, "do_approximate_matching": False},
            timeout=60,
        )
        res.raise_for_status()
        for r in res.json().get("results", []):
            matches = r.get("matches", [])
            if len(matches) == 1:
                name_to_ott[r["name"]] = matches[0]["taxon"]["ott_id"]
    return name_to_ott


async def _fetch_induced_newick(client: httpx.AsyncClient, ott_ids: list[int]) -> str:
    """Fetch OToL's induced subtree, pruning any OTT ids it reports as unknown."""
    ott_ids = list(ott_ids)
    for _ in range(20):
        res = await client.post(SUBTREE_URL, json={"ott_ids": ott_ids}, timeout=120)
        body = res.json()
        if res.status_code == 200:
            return body["newick"]
        unknown = body.get("unknown")
        if not unknown:
            res.raise_for_status()
        for ott_key in unknown:
            bad_id = int(ott_key.replace("ott", ""))
            if bad_id in ott_ids:
                ott_ids.remove(bad_id)
    raise RuntimeError("Could not resolve OToL induced_subtree after pruning unknown ids")


async def _build_backbone_newick(client: httpx.AsyncClient, species_names: list[str]) -> str:
    name_to_ott = await _resolve_ott_ids(client, species_names)
    return await _fetch_induced_newick(client, list(name_to_ott.values()))


def _target_node(tree, anchor_leaves: list):
    """Attach under an anchor clade or the parent of one anchor leaf."""
    if len(anchor_leaves) > 1:
        return tree.mrca(taxa=[leaf.taxon for leaf in anchor_leaves])
    return anchor_leaves[0].parent_node


def _attach_unplaced(tree, all_names: set, genus_of: dict, subfamily_of: dict):
    """Place unmatched species as unresolved genus or subfamily branches."""
    placed = {leaf.taxon.label for leaf in tree.leaf_node_iter()}
    unplaced = sorted(all_names - placed)
    if not unplaced:
        return

    genus_tips = defaultdict(list)
    subfamily_tips = defaultdict(list)
    for leaf in tree.leaf_node_iter():
        name = leaf.taxon.label
        genus_tips[genus_of.get(name)].append(leaf)
        subfamily_tips[subfamily_of.get(name)].append(leaf)

    by_genus = defaultdict(list)
    for name in unplaced:
        by_genus[genus_of.get(name)].append(name)

    still_unplaced = []
    for genus, names in by_genus.items():
        anchors = genus_tips.get(genus)
        if not anchors:
            still_unplaced.extend(names)
            continue
        target = _target_node(tree, anchors)
        for name in names:
            leaf = target.new_child(taxon=tree.taxon_namespace.new_taxon(label=name))
            leaf.edge.length = 1

    by_subfamily = defaultdict(list)
    for name in still_unplaced:
        by_subfamily[subfamily_of.get(name)].append(name)

    for subfamily, names in by_subfamily.items():
        anchors = subfamily_tips.get(subfamily)
        if not anchors:
            continue
        target = _target_node(tree, anchors)
        for name in names:
            leaf = target.new_child(taxon=tree.taxon_namespace.new_taxon(label=name))
            leaf.edge.length = 1


def _build_dendropy_tree(newick: str, wanted_names: set, genus_of: dict, subfamily_of: dict):
    tree = dendropy.Tree.get(data=newick, schema="newick")
    tree.is_rooted = True
    for taxon in tree.taxon_namespace:
        taxon.label = _OTT_SUFFIX_RE.sub("", taxon.label.replace(" ", "_"))
    taxa_to_retain = [t for t in tree.taxon_namespace if t.label in wanted_names]
    tree.retain_taxa(taxa_to_retain)
    _attach_unplaced(tree, wanted_names, genus_of, subfamily_of)
    tree_overrides.apply(tree)
    return tree


def _build_tree(newick: str, traits_by_name: dict, genus_of: dict, subfamily_of: dict):
    tree = _build_dendropy_tree(newick, set(traits_by_name), genus_of, subfamily_of)
    return _node_to_dict(tree.seed_node, traits_by_name)


async def _ensure_backbone(client: httpx.AsyncClient, df, fish_version: str) -> str:
    """Fetch the backbone only when the FishBase species version changes."""
    async with _lock:
        if _cache["fish_version"] != fish_version:
            species_names = [f"{g} {s}" for g, s in zip(df["Genus"], df["Species"])]
            newick = await _build_backbone_newick(client, species_names)
            _cache["fish_version"] = fish_version
            _cache["newick"] = newick
            _cache["trees"] = {}
        return _cache["newick"]


def _lookup_tables(df):
    genus_of = {f"{row['Genus']}_{row['Species']}": row["Genus"] for row in df.to_dict(orient="records")}
    subfamily_of = {f"{row['Genus']}_{row['Species']}": row.get("Subfamily") for row in df.to_dict(orient="records")}
    return genus_of, subfamily_of


async def get_cichlid_tree(client: httpx.AsyncClient, trait: str | None = None):
    async with httpx.AsyncClient(timeout=15) as fb_client:
        df, fish_version = await fishbase_data.get_species_table(fb_client)

    traits_by_name = {
        f"{row['Genus']}_{row['Species']}": {
            field: _clean(row.get(field))
            for field in fishbase_data.TRAIT_FIELDS
            + ["Encephalization", "Subfamily", "Country", "Continent", "Lake",
               "IUCN_Code", "GrowthRate", "_CommunityContributions"]
        }
        for row in df.to_dict(orient="records")
    }
    genus_of, subfamily_of = _lookup_tables(df)

    newick = await _ensure_backbone(client, df, fish_version)

    cache_key = trait or "__all__"
    async with _lock:
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
                newick,
                wanted,
                genus_of,
                subfamily_of,
            )

    return _cache["trees"][cache_key]


async def get_admin_tree(client: httpx.AsyncClient):
    """Build the full override-checked tree for the admin CLI."""
    df, fish_version = await fishbase_data.get_species_table(client)
    all_names = {f"{row['Genus']}_{row['Species']}" for row in df.to_dict(orient="records")}
    genus_of, subfamily_of = _lookup_tables(df)
    newick = await _ensure_backbone(client, df, fish_version)
    return await asyncio.to_thread(_build_dendropy_tree, newick, all_names, genus_of, subfamily_of)


