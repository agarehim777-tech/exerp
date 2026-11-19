// Human-readable az-AZ timestamp written into module action records (moved from moduleActions.js).
export function getActionStamp() {
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}
