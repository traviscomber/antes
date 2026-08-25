import type { MapLayer, MapPoint } from "./read-model";

export type MapMarkerItem =
  | { kind: "point"; point: MapPoint }
  | {
      kind: "cluster";
      id: string;
      layer: MapLayer;
      latitude: number;
      longitude: number;
      count: number;
      points: MapPoint[];
    };

const LOW_CONTEXT_LAYERS = new Set<MapLayer>(["air", "fuel", "seismic"]);

export function clusterMapPoints(points: MapPoint[], zoom: number): MapMarkerItem[] {
  const buckets = new Map<string, MapPoint[]>();

  for (const point of points) {
    const cell = cellSize(point.layer, zoom);
    const key = `${point.layer}:${Math.floor(point.latitude / cell)}:${Math.floor(point.longitude / cell)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }

  const result: MapMarkerItem[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length < 3 || zoom >= 13) {
      for (const point of bucket) result.push({ kind: "point", point });
      continue;
    }

    let latitude = 0;
    let longitude = 0;
    for (const point of bucket) {
      latitude += point.latitude;
      longitude += point.longitude;
    }
    result.push({
      kind: "cluster",
      id: key,
      layer: bucket[0].layer,
      latitude: latitude / bucket.length,
      longitude: longitude / bucket.length,
      count: bucket.length,
      points: bucket,
    });
  }
  return result;
}

function cellSize(layer: MapLayer, zoom: number): number {
  const atZoomNine = LOW_CONTEXT_LAYERS.has(layer) ? 0.18 : 0.085;
  return atZoomNine * 2 ** (9 - Math.max(6, Math.min(zoom, 13)));
}
