# Manual tree corrections with source citations, validated by manage_overrides.py.

import json
import pathlib

OVERRIDES_PATH = pathlib.Path(__file__).parent / "tree_overrides.json"


def load() -> list[dict]:
    if not OVERRIDES_PATH.exists():
        return []
    return json.loads(OVERRIDES_PATH.read_text())


def _reparent(mover_node, target_node):
    if mover_node is None or target_node is None or mover_node is target_node:
        return
    old_parent = mover_node.parent_node
    if old_parent is None or old_parent is target_node:
        return
    old_parent.remove_child(mover_node)
    mover_node.edge.length = 1
    target_node.add_child(mover_node)


def _target_node(tree, labels: list[str]):
    """Node to attach under: the MRCA of a clade, or the parent of a single taxon."""
    if len(labels) > 1:
        return tree.mrca(taxon_labels=labels)
    leaf = tree.find_node_with_taxon_label(labels[0])
    return leaf.parent_node if leaf else None


def _apply_one(tree, directive: dict):
    present = {t.label for t in tree.taxon_namespace}
    kind = directive["type"]

    if kind == "mark_unplaced":
        node = tree.find_node_with_taxon_label(directive["taxon"])
        if node is not None:
            tree.prune_taxa([node.taxon])
        return

    if kind == "move_taxon":
        if directive["taxon"] not in present:
            return
        mover = tree.find_node_with_taxon_label(directive["taxon"])
        target_labels = [n for n in directive["new_parent_clade"] if n in present]
        if not target_labels:
            return
        _reparent(mover, _target_node(tree, target_labels))
        return

    if kind == "move_clade":
        move_labels = [n for n in directive["taxa"] if n in present]
        target_labels = [n for n in directive["new_parent_clade"] if n in present]
        if not move_labels or not target_labels:
            return
        mover = tree.mrca(taxon_labels=move_labels) if len(move_labels) > 1 \
            else tree.find_node_with_taxon_label(move_labels[0])
        _reparent(mover, _target_node(tree, target_labels))
        return

    raise ValueError(f"Unknown override type: {kind!r}")


def apply(tree) -> None:
    for directive in load():
        try:
            _apply_one(tree, directive)
        except Exception:
            # Ignore stale overrides so tree serving keeps working.
            continue
    tree.suppress_unifurcations()


