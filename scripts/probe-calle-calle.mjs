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

for (let tipoEstacion = 0; tipoEstacion <= 7; tipoEstacion += 1) {
  try {
    const vipResponse = await fetch('https://vipnet.mop.gob.cl/v1/vipnet/estaciones/valor', {
      method: 'POST',
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json',
        Origin: 'https://vipnet.mop.gob.cl', Referer: 'https://vipnet.mop.gob.cl/',
      },
      body: JSON.stringify({ tipoEstacion, mapStatistic: 4, currentTabIndex: 0, fetchHour, fetchDay, hoursRange: 3 }),
      signal: AbortSignal.timeout(15000),
    });
    const vip = await vipResponse.json();
    const rows = Array.isArray(vip.data) ? vip.data : [];
    const matches = rows.filter((row) => {
      const haystack = JSON.stringify(row).toLowerCase();
      return haystack.includes('10122003') || haystack.includes('pupunahue') || haystack.includes('calle - calle') || haystack.includes('calle calle');
    });
    console.log('CALLE_CALLE_VIPNET', JSON.stringify({ tipoEstacion, status: vipResponse.status, rows: rows.length, matches }));
  } catch (error) {
    console.log('CALLE_CALLE_VIPNET', JSON.stringify({ tipoEstacion, error: String(error).slice(0, 180) }));
  }
}
