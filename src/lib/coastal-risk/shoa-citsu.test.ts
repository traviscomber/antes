import { describe, expect, it } from "vitest";
import { parseShoAKmlDepthZones, pointInPolygonWithHoles } from "./shoa-citsu";

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark>
    <name>Profundidad de la inundación: 2 a 4 m</name>
    <MultiGeometry><Polygon><outerBoundaryIs><LinearRing><coordinates>
      -73.400,-39.880,0 -73.390,-39.880,0 -73.390,-39.870,0 -73.400,-39.870,0 -73.400,-39.880,0
    </coordinates></LinearRing></outerBoundaryIs>
    <innerBoundaryIs><LinearRing><coordinates>
      -73.397,-39.877,0 -73.393,-39.877,0 -73.393,-39.873,0 -73.397,-39.873,0 -73.397,-39.877,0
    </coordinates></LinearRing></innerBoundaryIs></Polygon></MultiGeometry>
  </Placemark>
  <Placemark>
    <name>Profundidad de la inundación: 6 y más</name>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>
      -73.389,-39.880,0 -73.385,-39.880,0 -73.385,-39.876,0 -73.389,-39.876,0 -73.389,-39.880,0
    </coordinates></LinearRing></outerBoundaryIs></Polygon>
  </Placemark>
</Document></kml>`;

describe("SHOA CITSU geometry", () => {
  it("parses official depth-band naming and polygon holes", () => {
    const zones = parseShoAKmlDepthZones(KML);
    expect(zones).toHaveLength(2);
    expect(zones[0].band).toEqual({ label: "2 a 4 m", minMeters: 2, maxMeters: 4 });
    expect(zones[1].band).toEqual({ label: "6 m o más", minMeters: 6 });
    expect(zones[0].polygons[0].holes).toHaveLength(1);
  });

  it("classifies a point inside the outer ring but excludes an inner hole", () => {
    const zones = parseShoAKmlDepthZones(KML);
    const polygon = zones[0].polygons[0];
    expect(pointInPolygonWithHoles({ longitude: -73.399, latitude: -39.879 }, polygon)).toBe(true);
    expect(pointInPolygonWithHoles({ longitude: -73.395, latitude: -39.875 }, polygon)).toBe(false);
    expect(pointInPolygonWithHoles({ longitude: -73.380, latitude: -39.875 }, polygon)).toBe(false);
  });
});
