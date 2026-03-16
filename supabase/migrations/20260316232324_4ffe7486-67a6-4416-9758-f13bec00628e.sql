
CREATE TABLE public.symbol_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_symbol text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  asset_class text NOT NULL DEFAULT 'stock',
  base_asset text,
  quote_asset text,
  alpaca_symbol text,
  twelvedata_symbol text,
  fcs_symbol text,
  freecrypto_symbol text,
  finnhub_symbol text,
  yahoo_symbol text,
  exchangerate_pair text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(internal_symbol)
);

CREATE INDEX idx_symbol_mapping_internal ON public.symbol_mapping(internal_symbol);
CREATE INDEX idx_symbol_mapping_asset_class ON public.symbol_mapping(asset_class);

ALTER TABLE public.symbol_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read symbol mappings"
  ON public.symbol_mapping FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service can insert symbol mappings"
  ON public.symbol_mapping FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service can update symbol mappings"
  ON public.symbol_mapping FOR UPDATE TO authenticated
  USING (true);
