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
console.log('AGUAS_DECIMA_EVENTS_PAGE', JSON.stringify({ status: response.status, ok: response.ok, finalUrl: response.url, length: text.length }));

const inlineScripts = [...text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
for (let index = 0; index < inlineScripts.length; index += 1) {
  const js = inlineScripts[index];
  if (!/eventosViaPublica|DataTable|ajax|eventoSeleccionado|guardarEvento/i.test(js)) continue;
  console.log('AGUAS_DECIMA_INLINE_SCRIPT', JSON.stringify({ index, length: js.length, script: js.replace(/\s+/g, ' ').slice(0, 12000) }));
}

const htmlNeedles = ['eventosViaPublica', 'DataTable', 'ajax:', 'sAjaxSource', 'fetch(', '/eventos', '/api/', 'eventoSeleccionado'];
for (const needle of htmlNeedles) {
  let from = 0;
  let emitted = 0;
  while (emitted < 8) {
    const index = text.toLowerCase().indexOf(needle.toLowerCase(), from);
    if (index < 0) break;
    console.log('AGUAS_DECIMA_TABLE_HINT', JSON.stringify({ needle, index, snippet: text.slice(Math.max(0, index - 900), index + 2400).replace(/\s+/g, ' ') }));
    from = index + needle.length;
    emitted += 1;
  }
}

const scripts = [...text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
  .map((match) => new URL(match[1], response.url).toString());
for (const scriptUrl of scripts) {
  if (!/main\.js|evento|via-publica/i.test(scriptUrl)) continue;
  const { response: sr, text: js } = await fetchText(scriptUrl);
  console.log('AGUAS_DECIMA_TARGET_SCRIPT', JSON.stringify({ url: scriptUrl, status: sr.status, length: js.length, body: js.slice(0, 16000).replace(/\s+/g, ' ') }));
}
