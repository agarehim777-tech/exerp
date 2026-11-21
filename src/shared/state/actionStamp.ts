// Human-readable az-AZ timestamp written into module action records (moved from moduleActions.js).
import { formatDateTime } from "../../services/date.js";
export function getActionStamp() {
  return formatDateTime(new Date(), { seconds: false });
}
