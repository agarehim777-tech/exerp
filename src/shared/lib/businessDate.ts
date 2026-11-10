import { formatDateInput } from '../../services/date.js';

// Shared legacy reference date; retain the existing load-time date semantics.
export const currentBusinessDate: string = formatDateInput(new Date());