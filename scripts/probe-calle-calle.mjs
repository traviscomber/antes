const api = 'https://vipnet.mop.gob.cl';
const home = await (await fetch(`${api}/`, { signal: AbortSignal.timeout(15000) })).text();
const scripts = [...home.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => new URL(match[1], `${api}/`).toString());
for (const scriptUrl of scripts) {
  const js = await (await fetch(scriptUrl, { signal: AbortSignal.timeout(15000) })).text();
  const needle = 'return this.vipnetService.getStationValues(r).subscribe';
  const index = js.indexOf(needle);
  if (index >= 0) {
    console.log('VIPNET_STATION_VALUES_CALLSITE', JSON.stringify({
      script: scriptUrl.split('/').pop(),
      snippet: js.slice(Math.max(0, index - 12000), index + 1800).replace(/\s+/g, ' '),
    }));
  }
  for (const token of ['codigoEstacion:', 'parametro:', 'tipoParametro:', 'codigoParametro:', 'fechaGte:', 'fechaLte:', 'dateGte:', 'dateLte:']) {
    const indexes = [];
    let from = 0;
    while (indexes.length < 8) {
      const found = js.indexOf(token, from);
      if (found < 0) break;
      indexes.push(found);
      from = found + token.length;
    }
    for (const found of indexes) {
      console.log('VIPNET_BODY_HINT', JSON.stringify({ token, snippet: js.slice(Math.max(0, found - 800), found + 1500).replace(/\s+/g, ' ') }));
    }
  }
}
