# Turns researcher spreadsheets (CSV or XLSX) into per-value trait submissions.
#
# The downloadable template is the public species table: one row per species, one
# column per contributable trait, prefilled with current values. Researchers edit it
# (or bring their own sheet with Genus/Species columns plus any extra trait columns)
# and only cells that differ from the current public value become submissions, so
# re-uploading the untouched template produces nothing to review.
#
# Kept free of Postgres/FishBase imports so it can be tested with a plain DataFrame.

import csv
import io
import math
import re

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_ROWS = 20_000
MAX_CHANGES = 5_000
MAX_FIELD_NAME_LEN = 60
MAX_VALUE_LEN = 500
MAX_CITATION_LEN = 500
MAX_REPORTED_ERRORS = 200

IUCN_CODES = ["LC", "NT", "VU", "EN", "CR", "EW", "EX", "DD", "NE"]

# type: "category" (fixed vocabulary, matched case-insensitively), "number",
# "list" (semicolon-separated, order-insensitive), "text" (free text).
FIELDS = [
    {"key": "Fertilization", "label": "Fertilization site", "type": "category",
     "values": ["external", "internal", "in mouth", "in brood pouch"]},
    {"key": "ParentalCare", "label": "Which parent provides care", "type": "category",
     "values": ["maternal", "paternal", "biparental"]},
    {"key": "RepGuild1", "label": "Broad care strategy", "type": "category",
     "values": ["nonguarders", "guarders", "bearers"]},
    {"key": "RepGuild2", "label": "Specific egg or young care method", "type": "category",
     "values": ["open substratum egg scatterers", "brood hiders", "clutch tenders",
                "nesters", "external brooders", "internal live bearers"]},
    {"key": "MatingSystem", "label": "Mating system", "type": "text"},
    {"key": "FeedingType", "label": "Diet", "type": "text"},
    {"key": "Encephalization", "label": "Brain size relative to body", "type": "number"},
    {"key": "Lake", "label": "Lake", "type": "list"},
    {"key": "Country", "label": "Country", "type": "list"},
    {"key": "Continent", "label": "Continent", "type": "list"},
    {"key": "IUCN_Code", "label": "Conservation status", "type": "category", "values": IUCN_CODES},
    {"key": "GrowthRate", "label": "Growth rate (K)", "type": "number"},
]
_FIELD_BY_KEY = {f["key"]: f for f in FIELDS}

TEMPLATE_CITATION_HEADER = "Source citation"

# Species-table columns that exist but aren't open to community contributions
# (identity/taxonomy fields that drive tree placement, plus admin-only fields).
_RESERVED_COLUMNS = {
    "speccode", "fbname", "commonname", "family", "subfamily", "fresh", "brackish",
    "saltwater", "length", "dangerous", "bodyshapei", "anacat",
}


class BulkUploadError(Exception):
    """The file as a whole can't be read (bad format, no header, too big...)."""


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.casefold())


_GENUS_HEADERS = {"genus"}
_SPECIES_HEADERS = {"species", "specificepithet", "epithet"}
_NAME_HEADERS = {"scientificname", "speciesname", "binomial", "taxon", "name"}
_CITATION_HEADERS = {"sourcecitation", "source", "citation", "reference", "doi"}
_FIELD_HEADERS = {}
for _f in FIELDS:
    _FIELD_HEADERS[_norm(_f["key"])] = _f["key"]
    _FIELD_HEADERS[_norm(_f["label"])] = _f["key"]
_FIELD_HEADERS[_norm("Diet")] = "FeedingType"
_FIELD_HEADERS[_norm("IUCN")] = "IUCN_Code"


# ---------- reading files ----------

def _cell_to_str(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        return str(int(value)) if value.is_integer() else repr(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value).strip()


def _read_csv(data: bytes) -> list[list[str]]:
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise BulkUploadError("Couldn't read the file's text encoding. Save it as UTF-8 CSV.")
    first_line = text.split("\n", 1)[0]
    # Excel in some locales saves CSVs with semicolons or tabs.
    delimiter = max([",", ";", "\t"], key=first_line.count)
    return [[cell.strip() for cell in row] for row in csv.reader(io.StringIO(text), delimiter=delimiter)]


def _read_xlsx(data: bytes) -> list[list[str]]:
    try:
        import openpyxl  # imported lazily: only needed for Excel uploads
    except ImportError as exc:  # pragma: no cover
        raise BulkUploadError("Excel uploads aren't available on this server; upload a CSV.") from exc
    try:
        workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as exc:
        raise BulkUploadError("Couldn't open this Excel file. Is it a valid .xlsx?") from exc
    try:
        sheet = workbook.worksheets[0]
        rows = []
        for row in sheet.iter_rows(values_only=True):
            rows.append([_cell_to_str(v) for v in row])
            if len(rows) > MAX_ROWS + 1:
                break
        return rows
    finally:
        workbook.close()


def read_table(filename: str, data: bytes) -> list[list[str]]:
    if len(data) > MAX_UPLOAD_BYTES:
        raise BulkUploadError("File is larger than 5 MB. Split it into smaller uploads.")
    lower = filename.lower()
    if lower.endswith(".xlsx"):
        rows = _read_xlsx(data)
    elif lower.endswith((".csv", ".tsv", ".txt")):
        rows = _read_csv(data)
    elif lower.endswith(".xls"):
        raise BulkUploadError("Old .xls files aren't supported. Save as .xlsx or .csv.")
    else:
        raise BulkUploadError("Upload a .csv or .xlsx file.")
    rows = [r for r in rows if any(cell for cell in r)]
    if not rows:
        raise BulkUploadError("The file is empty.")
    if len(rows) - 1 > MAX_ROWS:
        raise BulkUploadError(f"The file has more than {MAX_ROWS:,} rows.")
    return rows


# ---------- values ----------

def _parse_number(raw: str) -> float | None:
    raw = raw.replace(" ", "")
    if raw.count(",") == 1 and "." not in raw:
        raw = raw.replace(",", ".")  # decimal comma from European-locale Excel
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def _split_list(raw: str) -> list[str]:
    parts = []
    for part in raw.split(";"):
        part = " ".join(part.split())
        if part and part.casefold() not in {p.casefold() for p in parts}:
            parts.append(part)
    return parts


def _format_current(value, field_type: str) -> str | None:
    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value):
            return None
        if field_type == "number":
            return format(value, ".6g")
    text = _cell_to_str(value)
    return text or None


def _same(field_type: str, current: str, new: str) -> bool:
    if field_type == "number":
        a, b = _parse_number(current), _parse_number(new)
        if a is None or b is None:
            return current.strip().casefold() == new.strip().casefold()
        return math.isclose(a, b, rel_tol=1e-3, abs_tol=1e-9)
    if field_type == "list":
        return {p.casefold() for p in _split_list(current)} == {p.casefold() for p in _split_list(new)}
    return " ".join(current.split()).casefold() == " ".join(new.split()).casefold()


class SpeciesContext:
    """Lookup tables derived once from the (merged) public species table."""

    def __init__(self, df):
        self.df = df
        self.columns = set(df.columns)
        self.row_by_name: dict[str, int] = {}
        self.canonical: dict[str, tuple[str, str]] = {}
        for idx, genus, species in zip(df.index, df["Genus"], df["Species"]):
            if not isinstance(genus, str) or not isinstance(species, str):
                continue
            key = f"{genus} {species}".casefold()
            self.row_by_name[key] = idx
            self.canonical[key] = (genus, species)
        # Category vocabularies: the known values plus anything already in the data,
        # keeping the dataset's own spelling so comparisons line up.
        self.vocab: dict[str, dict[str, str]] = {}
        for f in FIELDS:
            if f["type"] != "category":
                continue
            vocab = {v.casefold(): v for v in f["values"]}
            if f["key"] in self.columns:
                for v in df[f["key"]].dropna().unique():
                    if isinstance(v, str) and v.strip():
                        vocab.setdefault(v.strip().casefold(), v.strip())
            self.vocab[f["key"]] = vocab

    def lookup(self, genus: str, species: str):
        key = f"{' '.join(genus.split())} {' '.join(species.split())}".casefold()
        if key not in self.row_by_name:
            return None
        return self.canonical[key], self.row_by_name[key]

    def current_value(self, row_idx, field_name: str) -> str | None:
        if field_name not in self.columns:
            return None
        field_type = _FIELD_BY_KEY.get(field_name, {}).get("type", "text")
        return _format_current(self.df.at[row_idx, field_name], field_type)


def _normalize_value(field_name: str, raw: str, ctx: SpeciesContext) -> tuple[str | None, str | None]:
    """Returns (normalized_value, error_message)."""
    raw = raw.strip()
    if len(raw) > MAX_VALUE_LEN:
        return None, f"Value is longer than {MAX_VALUE_LEN} characters"
    spec = _FIELD_BY_KEY.get(field_name)
    field_type = spec["type"] if spec else "text"
    if field_type == "number":
        number = _parse_number(raw)
        if number is None:
            return None, f"'{raw}' is not a number"
        return format(number, ".10g"), None
    if field_type == "category":
        canonical = ctx.vocab[field_name].get(" ".join(raw.split()).casefold())
        if canonical is None:
            allowed = ", ".join(spec["values"])
            return None, f"'{raw}' is not a recognized value (expected one of: {allowed})"
        return canonical, None
    if field_type == "list":
        return "; ".join(_split_list(raw)), None
    return " ".join(raw.split()), None


def _clean_custom_field(header: str) -> str | None:
    name = " ".join(header.split())
    if not name or len(name) > MAX_FIELD_NAME_LEN or not re.search(r"[A-Za-z]", name):
        return None
    if name.startswith("_") or name.endswith("_CommunitySource"):
        return None
    return name


# ---------- core evaluation ----------

def evaluate(cells, ctx: SpeciesContext, already_submitted: set) -> dict:
    """Validate cells and keep only real changes.

    cells: iterable of dicts {row, genus, species, field_name, value, source_citation}
    already_submitted: {(genus, species, field_name, value.casefold())} for the user's
        pending/approved submissions, so re-uploading a file doesn't duplicate them.
    """
    changes = []
    errors = []
    unknown_species: dict[str, int] = {}
    unchanged = 0
    duplicates = 0
    seen: dict[tuple, tuple[int, str]] = {}

    def add_error(row, field, message):
        if len(errors) < MAX_REPORTED_ERRORS:
            errors.append({"row": row, "field": field, "message": message})

    for cell in cells:
        raw_value = (cell.get("value") or "").strip()
        if not raw_value:
            continue
        row = cell["row"]
        field_name = cell["field_name"]
        genus, species = cell.get("genus", "").strip(), cell.get("species", "").strip()
        if not genus or not species:
            add_error(row, field_name, "Missing genus or species")
            continue
        found = ctx.lookup(genus, species)
        if not found:
            name = f"{genus} {species}"
            if name not in unknown_species:
                unknown_species[name] = row
                add_error(row, None, f"Species '{name}' isn't in the cichlid list")
            continue
        (genus, species), row_idx = found

        if field_name not in _FIELD_BY_KEY and _clean_custom_field(field_name) is None:
            add_error(row, field_name, "Not a usable field name")
            continue
        value, problem = _normalize_value(field_name, raw_value, ctx)
        if problem:
            add_error(row, field_name, problem)
            continue

        field_type = _FIELD_BY_KEY.get(field_name, {}).get("type", "text")
        key = (genus, species, field_name)
        if key in seen:
            first_row, first_value = seen[key]
            if not _same(field_type, first_value, value):
                add_error(row, field_name,
                          f"Conflicts with row {first_row} for {genus} {species} ('{first_value}' vs '{value}')")
            continue
        seen[key] = (row, value)

        current = ctx.current_value(row_idx, field_name)
        if current is not None and _same(field_type, current, value):
            unchanged += 1
            continue
        if (genus, species, field_name, value.casefold()) in already_submitted:
            duplicates += 1
            continue

        citation = (cell.get("source_citation") or "").strip()
        if len(citation) > MAX_CITATION_LEN:
            add_error(row, field_name, f"Citation is longer than {MAX_CITATION_LEN} characters")
            continue
        changes.append({
            "row": row,
            "genus": genus,
            "species": species,
            "field_name": field_name,
            "field_value": value,
            "current_value": current,
            "kind": "differs" if current is not None else "fills_gap",
            "is_custom": field_name not in _FIELD_BY_KEY,
            "source_citation": citation,
        })

    return {
        "changes": changes,
        "errors": errors,
        "error_count": len(errors),
        "unknown_species": sorted(unknown_species),
        "unchanged_count": unchanged,
        "already_submitted_count": duplicates,
    }


def cells_from_table(rows: list[list[str]]):
    """Map a header + rows grid onto cells. Returns (cells, warnings, fields)."""
    header = rows[0]
    genus_col = species_col = name_col = citation_col = None
    field_cols: list[tuple[int, str]] = []
    warnings = []
    used_fields: dict[str, str] = {}

    for i, raw in enumerate(header):
        h = _norm(raw)
        if not h:
            if any(i < len(r) and r[i] for r in rows[1:]):
                warnings.append(f"Column {i + 1} has values but no header, so it was ignored.")
            continue
        if h in _GENUS_HEADERS and genus_col is None:
            genus_col = i
        elif h in _SPECIES_HEADERS and species_col is None:
            species_col = i
        elif h in _NAME_HEADERS and name_col is None:
            name_col = i
        elif h in _CITATION_HEADERS and citation_col is None:
            citation_col = i
        elif h in _RESERVED_COLUMNS:
            warnings.append(f"'{raw}' can't be changed through uploads, so it was ignored.")
        else:
            field = _FIELD_HEADERS.get(h) or _clean_custom_field(raw)
            if not field:
                warnings.append(f"'{raw}' isn't a usable column name, so it was ignored.")
                continue
            if field in used_fields:
                raise BulkUploadError(
                    f"Columns '{used_fields[field]}' and '{raw}' both map to the same field."
                )
            used_fields[field] = raw
            field_cols.append((i, field))

    if genus_col is None and species_col is not None and name_col is None:
        # A lone "Species" column holding full names like "Tropheus moorii".
        name_col, species_col = species_col, None
    if not ((genus_col is not None and species_col is not None) or name_col is not None):
        raise BulkUploadError(
            "Couldn't find species columns. Include 'Genus' and 'Species' columns "
            "(or one 'Scientific name' column)."
        )
    if not field_cols:
        raise BulkUploadError("No trait columns found besides the species name.")

    def get(r, i):
        return r[i].strip() if i is not None and i < len(r) else ""

    cells = []
    for offset, r in enumerate(rows[1:]):
        row_number = offset + 2  # 1-based, after the header, as shown in Excel
        if genus_col is not None and species_col is not None and get(r, genus_col):
            genus, species = get(r, genus_col), get(r, species_col)
        else:
            parts = get(r, name_col).replace("_", " ").split()
            genus, species = (parts[0], " ".join(parts[1:])) if len(parts) >= 2 else ("", "")
        citation = get(r, citation_col)
        for col, field in field_cols:
            value = get(r, col)
            if value:
                cells.append({
                    "row": row_number, "genus": genus, "species": species,
                    "field_name": field, "value": value, "source_citation": citation,
                })
    fields = [
        {"field_name": f, "column": used_fields[f], "is_custom": f not in _FIELD_BY_KEY}
        for _, f in field_cols
    ]
    return cells, warnings, fields


def preview_file(filename: str, data: bytes, df, already_submitted: set) -> dict:
    rows = read_table(filename, data)
    cells, warnings, fields = cells_from_table(rows)
    result = evaluate(cells, SpeciesContext(df), already_submitted)
    result["rows_read"] = len(rows) - 1
    result["warnings"] = warnings
    result["fields"] = fields
    result["max_changes"] = MAX_CHANGES
    return result


def build_template_csv(df) -> str:
    """Every species with its current public value for each contributable field."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(["Genus", "Species", *[f["key"] for f in FIELDS], TEMPLATE_CITATION_HEADER])
    ordered = df.sort_values(["Genus", "Species"], key=lambda c: c.astype(str).str.casefold())
    for record in ordered.to_dict(orient="records"):
        row = [record["Genus"], record["Species"]]
        for f in FIELDS:
            row.append(_format_current(record.get(f["key"]), f["type"]) or "")
        row.append("")
        writer.writerow(row)
    return out.getvalue()


def already_submitted_keys(own_submissions_df) -> set:
    keys = set()
    if own_submissions_df is None or own_submissions_df.empty:
        return keys
    for r in own_submissions_df.to_dict(orient="records"):
        if r.get("status") in ("pending", "approved"):
            keys.add((r["genus"], r["species"], r["field_name"], str(r["field_value"]).casefold()))
    return keys
