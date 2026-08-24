import { inflateRawSync } from 'node:zlib';

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

const buffer = Buffer.from(bytes);
const eocdSig = 0x06054b50;
let eocd = -1;
for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
  if (buffer.readUInt32LE(i) === eocdSig) { eocd = i; break; }
}
if (eocd < 0) throw new Error('ZIP EOCD not found');
const entryCount = buffer.readUInt16LE(eocd + 10);
const centralOffset = buffer.readUInt32LE(eocd + 16);
let offset = centralOffset;
let kml;
for (let index = 0; index < entryCount; index += 1) {
  if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('ZIP central directory mismatch');
  const method = buffer.readUInt16LE(offset + 10);
  const compressedSize = buffer.readUInt32LE(offset + 20);
  const uncompressedSize = buffer.readUInt32LE(offset + 24);
  const nameLength = buffer.readUInt16LE(offset + 28);
  const extraLength = buffer.readUInt16LE(offset + 30);
  const commentLength = buffer.readUInt16LE(offset + 32);
  const localOffset = buffer.readUInt32LE(offset + 42);
  const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
  if (name.toLowerCase().endsWith('.kml')) {
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const raw = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
    if (!raw) throw new Error(`Unsupported ZIP compression method ${method}`);
    if (raw.length !== uncompressedSize) throw new Error('KML size mismatch');
    kml = raw.toString('utf8');
    console.log('SHOA_KML_ENTRY', JSON.stringify({ name, method, compressedSize, uncompressedSize }));
    break;
  }
  offset += 46 + nameLength + extraLength + commentLength;
}
if (!kml) throw new Error('KML entry not found');
console.log('SHOA_KML_STRUCTURE', JSON.stringify({
  kmlLength: kml.length,
  placemarks: (kml.match(/<Placemark\b/gi) ?? []).length,
  polygons: (kml.match(/<Polygon\b/gi) ?? []).length,
  coordinateBlocks: (kml.match(/<coordinates\b/gi) ?? []).length,
  names: [...kml.matchAll(/<name>([^<]{1,120})<\/name>/gi)].slice(0, 20).map((match) => match[1].trim()),
}));
