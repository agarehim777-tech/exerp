ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_path TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS product_images_storage_insert ON storage.objects;
DROP POLICY IF EXISTS product_images_storage_update ON storage.objects;
DROP POLICY IF EXISTS product_images_storage_delete ON storage.objects;

CREATE POLICY product_images_storage_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND private.is_tenant_member((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY product_images_storage_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND private.is_tenant_member((storage.foldername(name))[1]::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'product-images'
  AND private.is_tenant_member((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY product_images_storage_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND private.is_tenant_member((storage.foldername(name))[1]::uuid, auth.uid())
);
