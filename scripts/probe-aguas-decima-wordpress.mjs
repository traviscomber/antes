const BASE = 'https://www.aguasdecima.cl/';
const HEADERS = {
  Accept: 'text/html,application/javascript,application/json,*/*;q=0.8',
  'Accept-Language': 'es-CL,es;q=0.9,en;q=0.7',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36',
};

const homeResponse = await fetch(BASE, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) });
const home = await homeResponse.text();
console.log('AGUAS_DECIMA_HOME', JSON.stringify({ status: homeResponse.status, length: home.length, finalUrl: homeResponse.url }));

const scripts = [...home.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
  .map((match) => new URL(match[1], BASE).toString());
const links = [...home.matchAll(/href=["']([^"']*(?:corte|emerg|interrup)[^"']*)["']/gi)]
  .map((match) => new URL(match[1], BASE).toString());
console.log('AGUAS_DECIMA_HOME_LINKS', JSON.stringify({ scripts, links }));

const homeTokens = ['interrup', 'corte', 'emerg', 'suministro', 'ajax', 'fetch(', '$.get', '$.post', '/api/', '/Home/', '/Emerg'];
for (const token of homeTokens) {
  let from = 0;
  let emitted = 0;
  while (emitted < 5) {
    const index = home.toLowerCase().indexOf(token.toLowerCase(), from);
    if (index < 0) break;
    console.log('AGUAS_DECIMA_HOME_HINT', JSON.stringify({ token, index, snippet: home.slice(Math.max(0, index - 320), index + 700).replace(/\s+/g, ' ') }));
    from = index + token.length;
    emitted += 1;
  }
}

for (const scriptUrl of scripts) {
  try {
    const response = await fetch(scriptUrl, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const js = await response.text();
    if (!response.ok || js.length > 3_000_000) continue;
    const interesting = /interrup|corte|emerg|suministro|ajax|fetch\(|\.get\(|\.post\(|\/api\//i.test(js);
    if (!interesting) continue;
    console.log('AGUAS_DECIMA_SCRIPT', JSON.stringify({ url: scriptUrl, status: response.status, length: js.length }));
    const tokens = ['interrup', 'corte', 'emerg', 'suministro', 'ajax', 'fetch(', '$.get', '$.post', '/api/', '/Home/', '/Emerg'];
    for (const token of tokens) {
      let from = 0;
      let emitted = 0;
      while (emitted < 6) {
        const index = js.toLowerCase().indexOf(token.toLowerCase(), from);
        if (index < 0) break;
        console.log('AGUAS_DECIMA_SCRIPT_HINT', JSON.stringify({ script: scriptUrl.split('/').pop(), token, index, snippet: js.slice(Math.max(0, index - 420), index + 850).replace(/\s+/g, ' ') }));
        from = index + token.length;
        emitted += 1;
      }
    }
  } catch (error) {
    console.log('AGUAS_DECIMA_SCRIPT_ERROR', JSON.stringify({ url: scriptUrl, error: String(error).slice(0, 180) }));
  }
}
