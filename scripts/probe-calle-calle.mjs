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
console.log('HIDROLINEA_PAGE', JSON.stringify({
  status: response.status,
  finalUrl: response.url,
  contentType: response.headers.get('content-type'),
  length: html.length,
  title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g,' ').trim(),
  forms: [...html.matchAll(/<form\b[^>]*(?:action=["']([^"']*)["'])?[^>]*>/gi)].slice(0,10).map((m)=>m[1] ?? ''),
  scripts: [...html.matchAll(/<script\b[^>]+src=["']([^"']+)["']/gi)].slice(0,30).map((m)=>m[1]),
  hidden: [...html.matchAll(/<input\b[^>]*type=["']hidden["'][^>]*>/gi)].slice(0,30).map((m)=>m[0]),
  hrefs: [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m)=>m[1]).filter((x)=>/map|estac|caudal|nivel|informe|sat/i.test(x)).slice(0,50),
}));
for (const token of ['Pupunahue','Calle Calle','caudal','nivel','fluviometr','station','estacion','google.maps','ViewState','javax.faces']) {
  const index = html.toLowerCase().indexOf(token.toLowerCase());
  if (index >= 0) console.log('HIDROLINEA_HTML_HINT', JSON.stringify({ token, snippet: html.slice(Math.max(0,index-1000), index+2500).replace(/\s+/g,' ') }));
}
