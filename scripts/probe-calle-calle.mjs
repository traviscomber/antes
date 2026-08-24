const stationCode = '10122003-6';
const api = 'https://vipnet.mop.gob.cl';
const fetchOptions = { headers: { Accept: 'application/json', Origin: api, Referer: `${api}/` }, signal: AbortSignal.timeout(15000) };

const completed = new Date(Date.now() - 60 * 60 * 1000);
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(completed);
const read = (type) => parts.find((part) => part.type === type)?.value ?? '';
const fetchDay = `${read('year')}-${read('month')}-${read('day')}`;
const fetchHour = Number(read('hour'));
const vipResponse = await fetch(`${api}/v1/vipnet/estaciones/valor`, {
  method: 'POST', headers: { ...fetchOptions.headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tipoEstacion: 0, mapStatistic: 4, currentTabIndex: 0, fetchHour, fetchDay, hoursRange: 3 }),
  signal: AbortSignal.timeout(15000),
});
const vip = await vipResponse.json();
const station = (Array.isArray(vip.data) ? vip.data : []).find((row) => String(row.codigoEstacion).toLowerCase() === stationCode.toLowerCase());
console.log('CALLE_CALLE_STATION', JSON.stringify(station ?? null));

const parameterResults = await Promise.all((station?.numeroParametros ?? []).map(async (parameterId) => {
  try {
    const response = await fetch(`${api}/v1/vipnet/parametro/${parameterId}`, { headers: fetchOptions.headers, signal: AbortSignal.timeout(15000) });
    return { parameterId, status: response.status, payload: await response.json() };
  } catch (error) {
    return { parameterId, error: String(error).slice(0, 180) };
  }
}));
console.log('VIPNET_PARAMETERS', JSON.stringify(parameterResults));

const home = await (await fetch(`${api}/`, { signal: AbortSignal.timeout(15000) })).text();
const scripts = [...home.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => new URL(match[1], `${api}/`).toString());
for (const scriptUrl of scripts) {
  const js = await (await fetch(scriptUrl, { signal: AbortSignal.timeout(15000) })).text();
  for (const token of ['getStationValues(', 'getOldestMeasurement(', 'codigoParametro', 'numeroParametro', 'fechaInicio', 'fechaFin']) {
    const index = js.indexOf(token);
    if (index >= 0) console.log('VIPNET_REQUEST_HINT', JSON.stringify({ token, snippet: js.slice(Math.max(0, index - 900), index + 1900).replace(/\s+/g, ' ') }));
  }
}
