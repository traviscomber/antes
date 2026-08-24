const stationCode = '10122003-6';
const completed = new Date(Date.now() - 60 * 60 * 1000);
const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
}).formatToParts(completed);
const read = (type) => parts.find((part) => part.type === type)?.value ?? '';
const fetchDay = `${read('year')}-${read('month')}-${read('day')}`;
const fetchHour = Number(read('hour'));

const layer = new URL('https://rest-sit.mop.gob.cl/arcgis/rest/services/EMERGENCIA/MAPA_ESTACIONES_DGA/MapServer/1/query');
layer.searchParams.set('where', `mod_codest = '${stationCode}'`);
layer.searchParams.set('outFields', '*');
layer.searchParams.set('returnGeometry', 'false');
layer.searchParams.set('f', 'json');
const alertPayload = await (await fetch(layer, { signal: AbortSignal.timeout(15000) })).json();
console.log('CALLE_CALLE_ALERT_LAYER', JSON.stringify(alertPayload.features?.[0]?.attributes ?? null));

const vipResponse = await fetch('https://vipnet.mop.gob.cl/v1/vipnet/estaciones/valor', {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: 'https://vipnet.mop.gob.cl', Referer: 'https://vipnet.mop.gob.cl/' },
  body: JSON.stringify({ tipoEstacion: 0, mapStatistic: 4, currentTabIndex: 0, fetchHour, fetchDay, hoursRange: 3 }),
  signal: AbortSignal.timeout(15000),
});
const vip = await vipResponse.json();
const station = (Array.isArray(vip.data) ? vip.data : []).find((row) => String(row.codigoEstacion).toLowerCase() === stationCode.toLowerCase());
console.log('CALLE_CALLE_STATION', JSON.stringify(station ?? null));

const home = await (await fetch('https://vipnet.mop.gob.cl/', { signal: AbortSignal.timeout(15000) })).text();
const scripts = [...home.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => new URL(match[1], 'https://vipnet.mop.gob.cl/').toString());
for (const scriptUrl of scripts) {
  const js = await (await fetch(scriptUrl, { signal: AbortSignal.timeout(15000) })).text();
  const endpointStrings = [...new Set([...js.matchAll(/(?:https?:\\?\/\\?\/[^"'` ]+|\/v1\/[A-Za-z0-9_?=&/.-]+)/g)].map((match) => match[0]))]
    .filter((value) => /vipnet|estacion|param|medic|serie|dato/i.test(value))
    .slice(0, 80);
  if (endpointStrings.length) console.log('VIPNET_ENDPOINT_STRINGS', JSON.stringify({ script: scriptUrl.split('/').pop(), endpointStrings }));
  for (const token of ['numeroParametros', 'codigoEstacion', 'parametro', 'mediciones', 'serie']) {
    let from = 0;
    let emitted = 0;
    while (emitted < 4) {
      const index = js.toLowerCase().indexOf(token.toLowerCase(), from);
      if (index < 0) break;
      console.log('VIPNET_DETAIL_HINT', JSON.stringify({ token, snippet: js.slice(Math.max(0, index - 420), index + 900).replace(/\s+/g, ' ') }));
      from = index + token.length;
      emitted += 1;
    }
  }
}
