// Only published, placed assets belong in visitor credits. Never expose the private library.
export function placedAssetIds(gallery) {
  const ids = new Set();
  for (const room of gallery.rooms || []) {
    for (const group of ['plants', 'furniture', 'trees', 'pedestals', 'works']) {
      for (const item of room[group] || []) if (item.asset) ids.add(item.asset);
    }
    for (const surface of Object.values(room.surfaces || {})) if (surface.asset) ids.add(surface.asset);
  }
  return ids;
}
export function requiredCredits(gallery, entries = []) {
  const placed = placedAssetIds(gallery), seen = new Set();
  return entries.filter(entry => {
    if (!placed.has(entry.id) || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return entry.attributionRequired === true || !/^(CC0(?:-1\.0)?|CC0 1\.0)$/i.test(entry.license || '');
  }).map(({id, title, credit, license, licenseUrl, source, changes, copyright, notice}) =>
    ({id, title, credit, license, licenseUrl, source, changes, copyright, notice}));
}
export function safeCreditUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
