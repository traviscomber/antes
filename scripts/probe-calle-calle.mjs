const stationCode = '10122003-6';
const home = await (await fetch('https://vipnet.mop.gob.cl/', { signal: AbortSignal.timeout(15000) })).text();
const scripts = [...home.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => new URL(match[1], 'https://vipnet.mop.gob.cl/').toString());
console.log('VIPNET_SCRIPTS', JSON.stringify({ count: scripts.length, scripts }));

for (const scriptUrl of scripts) {
  const js = await (await fetch(scriptUrl, { signal: AbortSignal.timeout(15000) })).text();
  if (!scriptUrl.includes('main-')) continue;

  const apiPaths = [...new Set([...js.matchAll(/(?:https:\/\/vipnet\.mop\.gob\.cl)?(\/v1\/[A-Za-z0-9_./?=&${}:+-]+)/g)].map((match) => match[1]))]
    .filter((path) => /estacion|param|medic|valor|serie|dato|histor/i.test(path))
    .slice(0, 120);
  console.log('VIPNET_API_PATHS', JSON.stringify(apiPaths));

  const tokens = [
    'numeroParametros', 'codigoEstacion', 'parametro', 'parametros', 'estaciones/valor',
    'mediciones', 'serie', 'historico', 'datosEstacion', 'detalleEstacion', 'stationCode',
    '/v1/vipnet/estaciones', '/v1/vipnet/parametros', 'Caudal', 'Nivel de Agua', 'Nivel',
  ];
  for (const token of tokens) {
    let from = 0;
    let emitted = 0;
    while (emitted < 4) {
      const index = js.toLowerCase().indexOf(token.toLowerCase(), from);
      if (index < 0) break;
      console.log('VIPNET_DETAIL_HINT', JSON.stringify({
        token,
        index,
        snippet: js.slice(Math.max(0, index - 500), index + 900).replace(/\s+/g, ' '),
      }));
      from = index + token.length;
      emitted += 1;
    }
  }
}

// Keep one canonical station assertion so this probe fails if the station disappears.
const alertUrl = new URL('https://rest-sit.mop.gob.cl/arcgis/rest/services/EMERGENCIA/MAPA_ESTACIONES_DGA/MapServer/1/query');
alertUrl.searchParams.set('where', `mod_codest = '${stationCode}'`);
alertUrl.searchParams.set('outFields', '*');
alertUrl.searchParams.set('returnGeometry', 'false');
alertUrl.searchParams.set('f', 'json');
const alertResponse = await fetch(alertUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
const alertPayload = await alertResponse.json();
const alertFeatures = Array.isArray(alertPayload.features) ? alertPayload.features : [];
console.log('CALLE_CALLE_STATION_ASSERT', JSON.stringify({ status: alertResponse.status, count: alertFeatures.length, sample: alertFeatures[0]?.attributes ?? null }));
if (!alertResponse.ok || alertFeatures.length !== 1) throw new Error('Pupunahue station contract failed');
