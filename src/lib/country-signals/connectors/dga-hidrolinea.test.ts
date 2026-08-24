import { describe, expect, it } from "vitest";
import {
  CALLE_CALLE_THRESHOLDS,
  parseHidrolineaDetail,
  parseHidrolineaStationMarker,
  technicalFlowState,
} from "./dga-hidrolinea";

const STATION_HTML = `<script>
var markers = [{"codigo":"10122003-6","nombre":"RIO CALLE CALLE EN PUPUNAHUE","fecha":"24/08/2026 13:49","latitud":-39.808334,"longitud":-72.904724,"fuenteEstacion":"SATELITAL","tipoEstacion":"Fluviometricas - Meteorologicas"}];
</script>`;

const DETAIL_XML = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response><changes><update id="medicionesByTypeFunctions:infoWindowPopUp"><![CDATA[
<script>function mostrar(){ var ultimoCaudalReg = "656,78"; var dif24PptacionAcum = "0,00"; var ultimaPptacionAcumuladaReg = "1820,30"; }</script>
]]></update></changes></partial-response>`;

describe("DGA Hidrolínea", () => {
  it("extracts Pupunahue source metadata and converts Chile local time to UTC", () => {
    const marker = parseHidrolineaStationMarker(STATION_HTML, "10122003-6");
    expect(marker).toMatchObject({
      stationCode: "10122003-6",
      stationName: "RIO CALLE CALLE EN PUPUNAHUE",
      stationType: "Fluviometricas - Meteorologicas",
      observedAtRaw: "24/08/2026 13:49",
      observedAt: "2026-08-24T17:49:00.000Z",
      latitude: -39.808334,
      longitude: -72.904724,
      transmissionSource: "SATELITAL",
    });
  });

  it("parses official popup flow and precipitation values with decimal comma", () => {
    expect(parseHidrolineaDetail(DETAIL_XML)).toEqual({
      flowM3s: 656.78,
      precipitation24hMm: 0,
      cumulativePrecipitationMm: 1820.3,
    });
  });

  it("preserves decimal-dot values if the upstream rendering format changes", () => {
    const xml = `<partial-response><script>var ultimoCaudalReg = "656.78"; var dif24PptacionAcum = "1.25"; var ultimaPptacionAcumuladaReg = "1820.30";</script></partial-response>`;
    expect(parseHidrolineaDetail(xml)).toEqual({
      flowM3s: 656.78,
      precipitation24hMm: 1.25,
      cumulativePrecipitationMm: 1820.3,
    });
  });

  it("keeps technical monitoring distinct across pre-threshold and official-plan thresholds", () => {
    expect(technicalFlowState(656.78)).toBe("green");
    expect(technicalFlowState(CALLE_CALLE_THRESHOLDS.yellow.flowM3s * 0.81)).toBe("watch");
    expect(technicalFlowState(CALLE_CALLE_THRESHOLDS.yellow.flowM3s)).toBe("yellow");
    expect(technicalFlowState(CALLE_CALLE_THRESHOLDS.red.flowM3s)).toBe("red");
  });
});
