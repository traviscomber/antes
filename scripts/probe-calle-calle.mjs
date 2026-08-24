const api = 'https://vipnet.mop.gob.cl';
const home = await (await fetch(`${api}/`, { signal: AbortSignal.timeout(15000) })).text();
const scripts = [...home.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => new URL(match[1], `${api}/`).toString());
for (const scriptUrl of scripts) {
  const js = await (await fetch(scriptUrl, { signal: AbortSignal.timeout(15000) })).text();
  for (const token of ['.getStationValues(', '.getOldestMeasurement(', 'getStationValues(', 'numeroParametros']) {
    let from = 0;
    let occurrence = 0;
    while (occurrence < 12) {
      const index = js.indexOf(token, from);
      if (index < 0) break;
      console.log('VIPNET_CALLSITE', JSON.stringify({ token, occurrence, snippet: js.slice(Math.max(0, index - 1200), index + 2200).replace(/\s+/g, ' ') }));
      from = index + token.length;
      occurrence += 1;
    }
  }
}
