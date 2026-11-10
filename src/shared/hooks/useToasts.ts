import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastMessage {
  id: number;
  message: string;
  variant: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, []);
  const notify = useCallback((message: string, variant = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(items => [...items, { id, message, variant }]);
    const timer = setTimeout(() => {
      setToasts(items => items.filter(item => item.id !== id));
      timers.current.delete(timer);
    }, 3200);
    timers.current.add(timer);
  }, []);
  return { toasts, setToasts, notify };
}