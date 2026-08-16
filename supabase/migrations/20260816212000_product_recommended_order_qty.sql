ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS recommended_order_qty numeric(14,3) NOT NULL DEFAULT 0
  CHECK (recommended_order_qty >= 0);

COMMENT ON COLUMN public.products.recommended_order_qty IS
  'Minimum stok həddinə çatdıqda alınması planlaşdırılan baza məhsul miqdarı';
