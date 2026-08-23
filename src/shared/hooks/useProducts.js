import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync';

const PRODUCTS_PAGE_SIZE = 500;
const PRODUCT_IMAGES_BUCKET = 'product-images';

function withImageUrl(product) {
  if (!product?.image_path) return { ...product, image_url: '' };
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(product.image_path);
  return { ...product, image_url: data?.publicUrl || '' };
}

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function uploadProductFile(path, file) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (!error) return;
    lastError = error;
    const bucketCacheMiss = /bucket\s+not\s+found/i.test(String(error.message || error));
    if (!bucketCacheMiss || attempt === 2) break;
    await wait(700 * (attempt + 1));
  }
  throw lastError || new Error('Şəkil yüklənmədi.');
}

export function useProducts(tenantId) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(PRODUCTS_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);
    if (error) setError(error);
    else {
      const rows = data || [];
      setHasMore(rows.length > limit);
      setProducts(rows.slice(0, limit).map(withImageUrl));
    }
    setLoading(false);
  }, [tenantId, limit]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loadMore = useCallback(() => setLimit((value) => value + PRODUCTS_PAGE_SIZE), []);

  useRealtimeResync(tenantId, ['products'], fetchAll, { channelPrefix: 'products' });

  const create = async (values) => {
    const { data, error } = await supabase
      .from('products')
      .insert({ ...values, tenant_id: tenantId })
      .select().single();
    if (error) throw error;
    const next = withImageUrl(data);
    setProducts((current) => current.some((item) => item.id === next.id) ? current : [next, ...current]);
    return next;
  };

  const update = async (id, values) => {
    const { data, error } = await supabase
      .from('products').update(values).eq('id', id).select().single();
    if (error) throw error;
    const next = withImageUrl(data);
    setProducts((current) => current.map((item) => item.id === id ? next : item));
    return next;
  };

  const uploadImage = async (id, file, previousPath = '') => {
    if (!file || !id || !tenantId) throw new Error('Şəkil və məhsul seçilməyib.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Yalnız JPG, PNG və WebP şəkilləri qəbul edilir.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Şəklin ölçüsü 5 MB-dan çox ola bilməz.');
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${tenantId}/${id}/${Date.now()}.${extension}`;
    await uploadProductFile(path, file);
    const { data, error } = await supabase.from('products').update({ image_path: path }).eq('id', id).select().single();
    if (error) {
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
      throw error;
    }
    if (previousPath && previousPath !== path) await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([previousPath]);
    const next = withImageUrl(data);
    setProducts((current) => current.map((item) => item.id === id ? next : item));
    return next;
  };

  const removeImage = async (id, path) => {
    const { data, error } = await supabase.from('products').update({ image_path: null }).eq('id', id).select().single();
    if (error) throw error;
    if (path) {
      const { error: storageError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
      if (storageError) throw storageError;
    }
    const next = withImageUrl(data);
    setProducts((current) => current.map((item) => item.id === id ? next : item));
    return next;
  };

  const remove = async (id) => {
    const product = products.find((item) => item.id === id);
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    if (product?.image_path) await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([product.image_path]);
    setProducts((current) => current.filter((item) => item.id !== id));
  };

  return { products, loading, error, hasMore, loadMore, refresh: fetchAll, create, update, remove, uploadImage, removeImage };
}
