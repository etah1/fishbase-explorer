const FIELD_LABELS: Record<string, string> = {
  Fertilization: "Fertilization site",
  ParentalCare: "Which parent provides care",
  RepGuild1: "Broad care strategy",
  RepGuild2: "Specific egg or young care method",
  MatingSystem: "Mating system",
  FeedingType: "Diet",
  Encephalization: "Brain size relative to body",
  Lake: "Lake",
  Country: "Country",
  Continent: "Continent",
  IUCN_Code: "Conservation status",
  GrowthRate: "Growth rate (K)",
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
  Fertilization: {
    external: "Fertilization outside the body",
    internal: "Fertilization inside the reproductive tract",
    "in mouth": "Fertilization in the mouth",
    "in brood pouch": "Fertilization in a brood pouch",
  },
  ParentalCare: {
    maternal: "Mother provides care",
    paternal: "Father provides care",
    biparental: "Both parents provide care",
  },
  RepGuild1: {
    nonguarders: "Does not guard offspring",
    guarders: "Guards eggs or young",
    bearers: "Carries or incubates offspring",
  },
  RepGuild2: {
    "open substratum egg scatterers": "Scatters eggs on open substrate",
    "brood hiders": "Hides eggs or young",
    "clutch tenders": "Tends an exposed egg clutch",
    nesters: "Builds or uses a nest",
    "external brooders": "Carries eggs or young outside the reproductive tract, including mouthbrooding",
    "internal live bearers": "Develops young inside the maternal body",
  },
};

export function formatTraitField(field: string) {
  return FIELD_LABELS[field] ?? field.replaceAll("_", " ");
}

export function formatTraitValue(field: string, value: string | number | null | undefined) {
  if (value == null) return "No data";
  if (typeof value === "number") return String(value);
  return VALUE_LABELS[field]?.[value.trim().toLowerCase()] ?? value;
}

export function getTraitValueOptions(field: string) {
  return Object.entries(VALUE_LABELS[field] ?? {}).map(([value, label]) => ({ value, label }));
}
