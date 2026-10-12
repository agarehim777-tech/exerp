export function isLastCollectionPage(contentRange) {
  if (contentRange === '*/0') return true;
  const parts = /^(\d+)-(\d+)\/(\d+)$/.exec(contentRange || '');
  return Boolean(parts && Number(parts[1]) <= Number(parts[2]) && Number(parts[3]) > 0
    && Number(parts[2]) + 1 === Number(parts[3]));
}
