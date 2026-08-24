const url = 'https://shoabucket.s3.amazonaws.com/shoa.cl/shoa-cl%2Fdescargas%2Fcitsu%2Fkmz%2FCITSU_Niebla_1ra%20Ed.%202019.kmz';
const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
const bytes = new Uint8Array(await response.arrayBuffer());
console.log('SHOA_CITSU_PROBE', JSON.stringify({
  ok: response.ok,
  status: response.status,
  contentType: response.headers.get('content-type'),
  contentLength: bytes.length,
  signature: Array.from(bytes.slice(0, 8)),
}));
if (!response.ok || bytes.length < 100 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
  throw new Error('SHOA CITSU KMZ contract failed');
}
