const START_URL = 'https://snia.mop.gob.cl/sat/site/informes/mapas/mapas.xhtml';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const initial = await fetch(START_URL, {
  headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'User-Agent': USER_AGENT },
  redirect: 'follow',
  signal: AbortSignal.timeout(20000),
});
const html = await initial.text();
const action = html.match(/<form id=["']medicionesByTypeFunctions["'][^>]+action=["']([^"']+)["']/i)?.[1];
const viewState = html.match(/<form id=["']medicionesByTypeFunctions["'][\s\S]*?name=["']javax\.faces\.ViewState["'][^>]+value=["']([^"']+)["']/i)?.[1];
const source = html.match(/getParametersMeditionsByStationType=function\(param1,param2\)\{RichFaces\.ajax\(["']([^"']+)["']/i)?.[1];
const cookies = typeof initial.headers.getSetCookie === 'function'
  ? initial.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
  : (initial.headers.get('set-cookie') ?? '').split(',').map((value) => value.split(';')[0]).join('; ');
if (!action || !viewState || !source) throw new Error('Hidrolínea JSF contract not found');
const postUrl = new URL(action.replace(/&amp;/g, '&'), initial.url).toString();
console.log('HIDROLINEA_JSF_CONTRACT', JSON.stringify({ status: initial.status, source, actionPath: new URL(postUrl).pathname, cookiePresent: Boolean(cookies), viewStatePresent: Boolean(viewState) }));

const form = new URLSearchParams();
form.set('javax.faces.partial.ajax', 'true');
form.set('javax.faces.source', source);
form.set('javax.faces.partial.execute', '@all');
form.set('javax.faces.partial.render', 'medicionesByTypeFunctions:infoWindowPopUp graficoMedicionesPopUp:graficoPopUp');
form.set(source, source);
form.set('medicionesByTypeFunctions', 'medicionesByTypeFunctions');
form.set('param1', '10122003-6');
form.set('param2', 'Fluviometricas - Meteorologicas');
form.set('javax.faces.ViewState', viewState);

const ajax = await fetch(postUrl, {
  method: 'POST',
  headers: {
    Accept: 'application/xml, text/xml, */*; q=0.01',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Faces-Request': 'partial/ajax',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': USER_AGENT,
    Referer: initial.url,
    ...(cookies ? { Cookie: cookies } : {}),
  },
  body: form.toString(),
  redirect: 'manual',
  signal: AbortSignal.timeout(30000),
});
const text = await ajax.text();
console.log('HIDROLINEA_JSF_RESPONSE', JSON.stringify({ status: ajax.status, contentType: ajax.headers.get('content-type'), location: ajax.headers.get('location'), length: text.length, prefix: text.slice(0, 400).replace(/\s+/g, ' ') }));
for (const token of ['ultimoCaudalReg', 'Caudal', 'PUPUNAHUE', '10122003-6', 'mediciones', 'parametro', 'Nivel', 'm3/seg', 'partial-response', 'error']) {
  let from = 0;
  let count = 0;
  while (count < 10) {
    const index = text.toLowerCase().indexOf(token.toLowerCase(), from);
    if (index < 0) break;
    console.log('HIDROLINEA_AJAX_HINT', JSON.stringify({ token, occurrence: count, snippet: text.slice(Math.max(0, index - 1800), index + 4200).replace(/\s+/g, ' ') }));
    from = index + token.length;
    count += 1;
  }
}
