"use client";

import { useState } from "react";

type LocationAction = "keep" | "replace" | "clear";

export default function LocationCapture({
  initialLatitude,
  initialLongitude,
}: {
  initialLatitude?: number;
  initialLongitude?: number;
}) {
  const initialHasLocation = validCoordinatePair(initialLatitude, initialLongitude);
  const [latitude, setLatitude] = useState<number | undefined>(
    initialHasLocation ? initialLatitude : undefined,
  );
  const [longitude, setLongitude] = useState<number | undefined>(
    initialHasLocation ? initialLongitude : undefined,
  );
  const [action, setAction] = useState<LocationAction>("keep");
  const [status, setStatus] = useState<string>(
    initialHasLocation
      ? "Ubicación precisa guardada. Se usa sólo para calcular cercanía."
      : "Opcional. Mejora las alertas por distancia sin reemplazar tu comuna o región.",
  );
  const [locating, setLocating] = useState(false);

  function captureLocation() {
    if (!navigator.geolocation) {
      setStatus("Este navegador no permite obtener la ubicación.");
      return;
    }

    setLocating(true);
    setStatus("Esperando permiso del navegador…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(roundCoordinate(position.coords.latitude));
        setLongitude(roundCoordinate(position.coords.longitude));
        setAction("replace");
        setLocating(false);
        const accuracy = Number.isFinite(position.coords.accuracy)
          ? ` Precisión aproximada: ${Math.round(position.coords.accuracy)} m.`
          : "";
        setStatus(`Ubicación lista para guardar.${accuracy}`);
      },
      (error) => {
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setStatus("No se autorizó el acceso a la ubicación. Puedes seguir usando comuna y región.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setStatus("El navegador no pudo determinar la ubicación. Intenta nuevamente.");
        } else {
          setStatus("La ubicación tardó demasiado. Intenta nuevamente.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 300_000,
      },
    );
  }

  function clearLocation() {
    setLatitude(undefined);
    setLongitude(undefined);
    setAction("clear");
    setStatus("La ubicación precisa se quitará al guardar. Comuna y región seguirán activas.");
  }

  return (
    <div className="profileLocationCapture">
      <input type="hidden" name="homeLocationAction" value={action} />
      <input type="hidden" name="homeLatitude" value={latitude ?? ""} />
      <input type="hidden" name="homeLongitude" value={longitude ?? ""} />

      <div>
        <span className="profileLocationLabel">Ubicación precisa</span>
        <p className="sourceMessage">{status}</p>
      </div>

      <div className="profileLocationActions">
        <button
          className="ingestButton"
          type="button"
          onClick={captureLocation}
          disabled={locating}
        >
          {locating ? "OBTENIENDO…" : "USAR MI UBICACIÓN"}
        </button>
        {(latitude !== undefined && longitude !== undefined) || action === "replace" ? (
          <button className="profileSecondaryButton" type="button" onClick={clearLocation}>
            QUITAR PRECISA
          </button>
        ) : null}
      </div>
    </div>
  );
}

function validCoordinatePair(latitude?: number, longitude?: number): boolean {
  return latitude !== undefined && longitude !== undefined &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
