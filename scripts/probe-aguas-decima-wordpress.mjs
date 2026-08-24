const BASE = 'https://www.aguasdecima.cl/';
const HEADERS = {
  Accept: 'text/html,application/javascript,application/json,*/*;q=0.8',
  'Accept-Language': 'es-CL,es;q=0.9,en;q=0.7',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36',
};

async function fetchText(url) {
  const response = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  return { response, text: await response.text() };
}

const route = new URL('eventos-via-publica', BASE).toString();
const { response, text } = await fetchText(route);
console.log('AGUAS_DECIMA_EVENTS_PAGE', JSON.stringify({
  status: response.status,
  ok: response.ok,
  finalUrl: response.url,
  contentType: response.headers.get('content-type'),
  length: text.length,
  prefix: text.replace(/\s+/g, ' ').slice(0, 260),
}));

const scripts = [...text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
  .map((match) => new URL(match[1], response.url).toString());
console.log('AGUAS_DECIMA_EVENTS_SCRIPTS', JSON.stringify(scripts));

const tokens = ['evento', 'corte', 'suministro', 'interrup', 'programad', 'api/', '/api', 'fetch(', '$.get', '$.post', 'ajax', 'mapa', 'latitude', 'longitude', 'latitud', 'longitud'];
for (const token of tokens) {
  let from = 0;
  let emitted = 0;
  while (emitted < 8) {
    const index = text.toLowerCase().indexOf(token.toLowerCase(), from);
    if (index < 0) break;
    console.log('AGUAS_DECIMA_EVENTS_HINT', JSON.stringify({ token, index, snippet: text.slice(Math.max(0, index - 480), index + 1000).replace(/\s+/g, ' ') }));
    from = index + token.length;
    emitted += 1;
  }
}

for (const scriptUrl of scripts) {
  try {
    const { response: sr, text: js } = await fetchText(scriptUrl);
    if (!sr.ok || js.length > 4_000_000) continue;
    if (!/evento|corte|suministro|interrup|programad|api\/?|fetch\(|ajax|mapa|latitud|longitud/i.test(js)) continue;
    console.log('AGUAS_DECIMA_EVENTS_SCRIPT', JSON.stringify({ url: scriptUrl, status: sr.status, length: js.length }));
    for (const token of tokens) {
      let from = 0;
      let emitted = 0;
      while (emitted < 8) {
        const index = js.toLowerCase().indexOf(token.toLowerCase(), from);
        if (index < 0) break;
        console.log('AGUAS_DECIMA_EVENTS_SCRIPT_HINT', JSON.stringify({ script: scriptUrl.split('/').pop(), token, index, snippet: js.slice(Math.max(0, index - 500), index + 1100).replace(/\s+/g, ' ') }));
        from = index + token.length;
        emitted += 1;
      }
    }
  } catch (error) {
    console.log('AGUAS_DECIMA_EVENTS_SCRIPT_ERROR', JSON.stringify({ url: scriptUrl, error: String(error).slice(0, 180) }));
  }
}
