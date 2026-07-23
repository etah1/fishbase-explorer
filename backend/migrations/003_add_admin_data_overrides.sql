CREATE TABLE IF NOT EXISTS public.admin_data_overrides (
    id uuid PRIMARY KEY,
    genus text NOT NULL,
    species text NOT NULL,
    field_name text NOT NULL,
    field_value text NOT NULL,
    updated_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (genus, species, field_name)
);

ALTER TABLE public.admin_data_overrides ENABLE ROW LEVEL SECURITY;
