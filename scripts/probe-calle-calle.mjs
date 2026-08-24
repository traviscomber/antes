const stationCode = '10122003-6';
const layer = 'https://rest-sit.mop.gob.cl/arcgis/rest/services/EMERGENCIA/MAPA_ESTACIONES_DGA/MapServer/1/query';
const url = new URL(layer);
url.searchParams.set('where', `mod_codest = '${stationCode}'`);
url.searchParams.set('outFields', '*');
url.searchParams.set('returnGeometry', 'false');
url.searchParams.set('f', 'json');
const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
const payload = await response.json();
const features = Array.isArray(payload.features) ? payload.features : [];
console.log('CALLE_CALLE_ALERT_LAYER', JSON.stringify({ status: response.status, count: features.length, sample: features[0]?.attributes ?? null }));

const completed = new Date(Date.now() - 60 * 60 * 1000);
const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
}).formatToParts(completed);
const read = (type) => parts.find((part) => part.type === type)?.value ?? '';
const fetchDay = `${read('year')}-${read('month')}-${read('day')}`;
const fetchHour = Number(read('hour'));

for (const tipoEstacion of [0, 1, 2, 3, 4, 5]) {
  const vipResponse = await fetch('https://vipnet.mop.gob.cl/v1/vipnet/estaciones/valor', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: 'https://vipnet.mop.gob.cl', Referer: 'https://vipnet.mop.gob.cl/' },
    body: JSON.stringify({ tipoEstacion, mapStatistic: 4, currentTabIndex: 0, fetchHour, fetchDay, hoursRange: 3 }),
    signal: AbortSignal.timeout(15000),
  });
  const vip = await vipResponse.json();
  const rows = Array.isArray(vip.data) ? vip.data : [];
  const matches = rows.filter((row) => JSON.stringify(row).toLowerCase().includes('10122003'));
  console.log('CALLE_CALLE_VIPNET', JSON.stringify({ tipoEstacion, status: vipResponse.status, rows: rows.length, matches }));
}

const home = await (await fetch('https://vipnet.mop.gob.cl/', { signal: AbortSignal.timeout(15000) })).text();
const scripts = [...home.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => new URL(match[1], 'https://vipnet.mop.gob.cl/').toString());
console.log('VIPNET_SCRIPTS', JSON.stringify({ count: scripts.length, scripts }));
for (const scriptUrl of scripts) {
  const js = await (await fetch(scriptUrl, { signal: AbortSignal.timeout(15000) })).text();
  const tokens = ['Caudal', 'Nivel', 'Precip', 'Temperatura', 'Humedad', 'tipoEstacion'];
  for (const token of tokens) {
    const index = js.toLowerCase().indexOf(token.toLowerCase());
    if (index >= 0) {
      console.log('VIPNET_BUNDLE_HINT', JSON.stringify({ script: scriptUrl.split('/').pop(), token, snippet: js.slice(Math.max(0, index - 240), index + 520).replace(/\s+/g, ' ') }));
    }
  }
}
