CREATE TABLE IF NOT EXISTS public.personal_species_notes (
    user_id uuid NOT NULL,
    genus text NOT NULL,
    species text NOT NULL,
    note text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, genus, species)
);

ALTER TABLE public.personal_species_notes ENABLE ROW LEVEL SECURITY;
