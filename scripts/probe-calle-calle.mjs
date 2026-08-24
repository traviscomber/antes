const stationCode = '10122003-6';
const api = 'https://vipnet.mop.gob.cl';
const common = { headers: { Accept: 'application/json', Origin: api, Referer: `${api}/` }, signal: AbortSignal.timeout(15000) };

const mapUrl = new URL('https://rest-sit.mop.gob.cl/arcgis/rest/services/EMERGENCIA/MAPA_ESTACIONES_DGA/MapServer/1/query');
mapUrl.searchParams.set('where', `mod_codest = '${stationCode}'`);
mapUrl.searchParams.set('outFields', '*');
mapUrl.searchParams.set('returnGeometry', 'false');
mapUrl.searchParams.set('f', 'json');
const alertPayload = await (await fetch(mapUrl, common)).json();
console.log('CALLE_CALLE_ALERT_LAYER', JSON.stringify(alertPayload.features?.[0]?.attributes ?? null));

const completed = new Date(Date.now() - 60 * 60 * 1000);
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(completed);
const read = (type) => parts.find((part) => part.type === type)?.value ?? '';
const fetchDay = `${read('year')}-${read('month')}-${read('day')}`;
const fetchHour = Number(read('hour'));
const vipResponse = await fetch(`${api}/v1/vipnet/estaciones/valor`, {
  method: 'POST', headers: { ...common.headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tipoEstacion: 0, mapStatistic: 4, currentTabIndex: 0, fetchHour, fetchDay, hoursRange: 3 }),
  signal: common.signal,
});
const vip = await vipResponse.json();
const station = (Array.isArray(vip.data) ? vip.data : []).find((row) => String(row.codigoEstacion).toLowerCase() === stationCode.toLowerCase());
console.log('CALLE_CALLE_STATION', JSON.stringify(station ?? null));

for (const parameterId of station?.numeroParametros ?? []) {
  try {
    const response = await fetch(`${api}/v1/vipnet/parametro/${parameterId}`, common);
    const payload = await response.json();
    console.log('VIPNET_PARAMETER', JSON.stringify({ parameterId, status: response.status, payload }));
  } catch (error) {
    console.log('VIPNET_PARAMETER', JSON.stringify({ parameterId, error: String(error).slice(0, 180) }));
  }
}

const home = await (await fetch(`${api}/`, common)).text();
const scripts = [...home.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => new URL(match[1], `${api}/`).toString());
for (const scriptUrl of scripts) {
  const js = await (await fetch(scriptUrl, common)).text();
  for (const token of ['getStationValues(', 'getOldestMeasurement(', 'codigoParametro', 'numeroParametro', 'fechaInicio', 'fechaFin']) {
    let from = 0;
    let emitted = 0;
    while (emitted < 5) {
      const index = js.indexOf(token, from);
      if (index < 0) break;
      console.log('VIPNET_REQUEST_HINT', JSON.stringify({ token, snippet: js.slice(Math.max(0, index - 650), index + 1300).replace(/\s+/g, ' ') }));
      from = index + token.length;
      emitted += 1;
    }
  }
}
