const layer = 'https://rest-sit.mop.gob.cl/arcgis/rest/services/EMERGENCIA/MAPA_ESTACIONES_DGA/MapServer/1/query';
const whereCandidates = [
  "mod_codest = '10122003-6'",
  "mod_codest = '10122003'",
];
for (const where of whereCandidates) {
  const url = new URL(layer);
  url.searchParams.set('where', where);
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('f', 'json');
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  const features = Array.isArray(payload.features) ? payload.features : [];
  console.log('CALLE_CALLE_PROBE', JSON.stringify({ where, status: response.status, count: features.length, sample: features[0]?.attributes ?? null }));
}
