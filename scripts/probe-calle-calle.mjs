const url = 'https://snia.mop.gob.cl/sat/site/informes/mapas/mapas.xhtml';
const response = await fetch(url, {
  headers: {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
  },
  redirect: 'follow',
  signal: AbortSignal.timeout(20000),
});
const html = await response.text();
console.log('HIDROLINEA_PAGE', JSON.stringify({ status: response.status, finalUrl: response.url, length: html.length }));
for (const token of [
  'function getParametersMeditionsByStationType',
  'getParametersMeditionsByStationType(',
  'getMeditions',
  'graficoMedicionesPopUp',
  'selectedMarker',
  'parametroInput',
  'Caudal',
  'javax.faces.partial.ajax',
  'RichFaces.ajax',
]) {
  let from = 0;
  let count = 0;
  while (count < 8) {
    const index = html.indexOf(token, from);
    if (index < 0) break;
    console.log('HIDROLINEA_CALL_HINT', JSON.stringify({
      token,
      occurrence: count,
      snippet: html.slice(Math.max(0, index - 2500), index + 5000).replace(/\s+/g,' '),
    }));
    from = index + token.length;
    count += 1;
  }
}
const remoteCalls = [...html.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{[^{}]{0,2500}RichFaces\.ajax\([^;]+/g)]
  .slice(0,50)
  .map((m)=>({name:m[1], body:m[0].replace(/\s+/g,' ').slice(0,3000)}));
console.log('HIDROLINEA_REMOTE_FUNCTIONS', JSON.stringify(remoteCalls));
