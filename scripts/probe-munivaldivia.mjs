const urls = [
  'https://munivaldivia.cl/feed/',
  'https://munivaldivia.cl/?feed=rss2',
  'https://munivaldivia.cl/wp-json/wp/v2/posts?per_page=5&_fields=id,date,link,title,excerpt,categories',
];
for (const url of urls) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ANTEMANO-source-contract/1.0', Accept: '*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    console.log('MUNIVALDIVIA_PROBE', JSON.stringify({
      url,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      length: text.length,
      prefix: text.slice(0, 180).replace(/\s+/g, ' '),
    }));
  } catch (error) {
    console.log('MUNIVALDIVIA_PROBE', JSON.stringify({ url, error: String(error).slice(0, 180) }));
  }
}
