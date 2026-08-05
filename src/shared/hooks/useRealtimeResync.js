import { useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';

/**
 * Bütün modullar üçün ümumi realtime abunə + fallback mexanizmi.
 * - Dəyişiklikdə debounce ilə refetch çağırır (event tufanında bir dəfə).
 * - Kanal xətası, timeout, yenidən qoşulma, tab/şəbəkə bərpasında tam refetch edir.
 * - `degraded` — canlı yenilənmə etibarsız olduqda UI-da göstərmək üçün.
 *
 * @param {string|null} tenantId
 * @param {string[]} tables Dinlənəcək public cədvəllər
 * @param {() => Promise<any>} refetch
 * @param {{ debounceMs?: number, channelPrefix?: string }} [options]
 */
export function useRealtimeResync(tenantId, tables, refetch, options = {}) {
  const { debounceMs = 300, channelPrefix = 'sync' } = options;
  const [degraded, setDegraded] = useState(null);
  const tableKey = tables.join(',');

  useEffect(() => {
    if (!tenantId || !tables.length) return undefined;
    let disposed = false;
    let timer = null;

    const schedule = (reason, markDegraded) => {
      if (disposed) return;
      if (markDegraded) setDegraded(reason);
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        timer = null;
        if (disposed) return;
        try {
          await refetch();
          if (!disposed) setDegraded(null);
        } catch {
          if (!disposed) setDegraded(reason);
        }
      }, debounceMs);
    };

    const filter = `tenant_id=eq.${tenantId}`;
    const suffix = Math.random().toString(36).slice(2, 10);
    let channel = supabase.channel(`${channelPrefix}:${tenantId}:${suffix}`);
    tables.forEach((tableName) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName, filter },
        () => schedule(`change:${tableName}`, false),
      );
    });
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        schedule(`channel-${status.toLowerCase()}`, true);
      } else if (status === 'SUBSCRIBED') {
        schedule('channel-resubscribed', false);
      }
    });

    const onWake = () => {
      if (document.visibilityState === 'visible') schedule('wake', false);
    };
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onWake);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onWake);
      supabase.removeChannel(channel);
    };
  }, [tenantId, tableKey, refetch, debounceMs, channelPrefix]);

  return degraded;
}
