const api = 'https://vipnet.mop.gob.cl';
const stationCode = '10122003-6';
const now = new Date(Date.now() - 60 * 60 * 1000);
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
const read = (type) => parts.find((part) => part.type === type)?.value ?? '';
const fetchDay = `${read('year')}-${read('month')}-${read('day')}`;
const fetchHour = Number(read('hour'));
const headers = { Accept: 'application/json', 'Content-Type': 'application/json', Origin: api, Referer: `${api}/` };

for (const tipoEstacion of [0,1,2,3,4,5,6,7,10,11,71]) {
  try {
    const response = await fetch(`${api}/v1/vipnet/estacion/valores`, {
      method: 'POST', headers,
      body: JSON.stringify({ codigoEstacion: stationCode, tipoEstacion, fetchHour, fetchDay, hoursRange: 24 }),
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch {}
    const data = Array.isArray(payload?.data) ? payload.data : [];
    console.log('VIPNET_STATION_SERIES', JSON.stringify({
      tipoEstacion, status: response.status, contentType: response.headers.get('content-type'), textLength: text.length,
      rows: data.length, first: data[0] ?? null, last: data.at(-1) ?? null,
      values: data.slice(-8).map((row) => row.instantaneo),
      bodyPrefix: text.slice(0, 180),
    }));
  } catch (error) {
    console.log('VIPNET_STATION_SERIES', JSON.stringify({ tipoEstacion, error: String(error).slice(0, 180) }));
  }
}
