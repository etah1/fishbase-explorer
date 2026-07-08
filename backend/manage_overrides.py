"""Validate and write manual phylogeny overrides.

Examples:
    python manage_overrides.py move-taxon --taxon "Genus_species" --new-parent-clade "sp1,sp2" --source "Citation"
    python manage_overrides.py move-clade --taxa "sp1,sp2" --new-parent-clade "sp3,sp4" --source "Citation"
    python manage_overrides.py mark-unplaced --taxon "Genus_species" --source "Citation"
    python manage_overrides.py list
"""

import argparse
import asyncio
import datetime
import json
import sys

import httpx

import phylogeny_data
import tree_overrides


def _split(csv: str) -> list[str]:
    return [n.strip() for n in csv.split(",") if n.strip()]


async def _load_tree():
    async with httpx.AsyncClient(timeout=60) as client:
        return await phylogeny_data.get_admin_tree(client)


def _require_present(tree, labels: list[str], role: str):
    present = {t.label for t in tree.taxon_namespace}
    missing = [n for n in labels if n not in present]
    if missing:
        sys.exit(f"Error: {role} not found in current tree: {missing}")


def _require_monophyletic(tree, labels: list[str]):
    if len(labels) < 2:
        return
    mrca = tree.mrca(taxon_labels=labels)
    leaves_under_mrca = {leaf.taxon.label for leaf in mrca.leaf_iter()}
    extra = leaves_under_mrca - set(labels)
    if extra:
        sys.exit(
            "Error: the taxa given don't currently form a clade by themselves "
            f"in the tree; {sorted(extra)[:5]} would move along with them. "
            "Use move-taxon per-species instead, or include those taxa too."
        )


def _append(directive: dict):
    overrides = tree_overrides.load()
    overrides.append(directive)
    tree_overrides.OVERRIDES_PATH.write_text(json.dumps(overrides, indent=2) + "\n")
    print(f"Added: {directive}")


async def cmd_move_taxon(args):
    tree = await _load_tree()
    new_parent_clade = _split(args.new_parent_clade)
    _require_present(tree, [args.taxon], "taxon")
    _require_present(tree, new_parent_clade, "new-parent-clade taxa")
    _append({
        "type": "move_taxon",
        "taxon": args.taxon,
        "new_parent_clade": new_parent_clade,
        "source": args.source,
        "added": datetime.date.today().isoformat(),
    })


async def cmd_move_clade(args):
    tree = await _load_tree()
    taxa = _split(args.taxa)
    new_parent_clade = _split(args.new_parent_clade)
    _require_present(tree, taxa, "taxa")
    _require_present(tree, new_parent_clade, "new-parent-clade taxa")
    _require_monophyletic(tree, taxa)
    _append({
        "type": "move_clade",
        "taxa": taxa,
        "new_parent_clade": new_parent_clade,
        "source": args.source,
        "added": datetime.date.today().isoformat(),
    })


async def cmd_mark_unplaced(args):
    tree = await _load_tree()
    _require_present(tree, [args.taxon], "taxon")
    _append({
        "type": "mark_unplaced",
        "taxon": args.taxon,
        "source": args.source,
        "added": datetime.date.today().isoformat(),
    })


def cmd_list(args):
    overrides = tree_overrides.load()
    if not overrides:
        print("No overrides recorded.")
        return
    for o in overrides:
        print(json.dumps(o))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("move-taxon", help="Reparent a single species")
    p.add_argument("--taxon", required=True)
    p.add_argument("--new-parent-clade", required=True, help="Comma-separated taxa defining the target clade")
    p.add_argument("--source", required=True, help="Citation for this correction")
    p.set_defaults(func=cmd_move_taxon, is_async=True)

    p = sub.add_parser("move-clade", help="Reparent a group of species together")
    p.add_argument("--taxa", required=True, help="Comma-separated taxa to move")
    p.add_argument("--new-parent-clade", required=True, help="Comma-separated taxa defining the target clade")
    p.add_argument("--source", required=True, help="Citation for this correction")
    p.set_defaults(func=cmd_move_clade, is_async=True)

    p = sub.add_parser("mark-unplaced", help="Remove a species from the tree pending better data")
    p.add_argument("--taxon", required=True)
    p.add_argument("--source", required=True, help="Citation or reason for removal")
    p.set_defaults(func=cmd_mark_unplaced, is_async=True)

    p = sub.add_parser("list", help="Show recorded overrides")
    p.set_defaults(func=cmd_list, is_async=False)

    args = parser.parse_args()
    if args.is_async:
        asyncio.run(args.func(args))
    else:
        args.func(args)


if __name__ == "__main__":
    main()

