const candidates = [
  'https://www.aguasdecima.cl/wp-json/',
  'https://www.aguasdecima.cl/wp-json/wp/v2/pages?search=cortes&per_page=20',
  'https://www.aguasdecima.cl/wp-json/wp/v2/search?search=cortes&per_page=20',
  'https://www.aguasdecima.cl/?p=1',
  'https://www.aguasdecima.cl/?page_id=20',
  'https://www.aguasdecima.cl/?page_id=11069',
  'https://www.aguasdecima.cl/emergencias/cortes-en-proceso?output=1',
  'https://www.aguasdecima.cl/emergencias/cortes-programados?output=1',
];
for (const url of candidates) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json,text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'es-CL,es;q=0.9,en;q=0.7',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    const clean = text.replace(/\s+/g, ' ');
    console.log('AGUAS_DECIMA_WP_PROBE', JSON.stringify({
      url,
      finalUrl: response.url,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      length: text.length,
      hasNoInterruptions: /NO\s+HAY\s+INTERRUPCIONES\s+DEL\s+SERVICIO/i.test(text),
      hasCortes: /Cortes\s+(?:en\s+proceso|programados|de\s+emergencia)/i.test(text),
      hasWpJson: /wp-json|namespaces|wp\/v2/i.test(text),
      prefix: clean.slice(0, 260),
    }));
  } catch (error) {
    console.log('AGUAS_DECIMA_WP_PROBE', JSON.stringify({ url, error: String(error).slice(0, 220) }));
  }
}
