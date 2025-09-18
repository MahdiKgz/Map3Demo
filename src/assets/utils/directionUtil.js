import * as turf from "@turf/turf";

export function computeBearingBetween(coordA, coordB) {
  if (!coordA || !coordB) return 0;
  const a = turf.point(coordA);
  const b = turf.point(coordB);
  return turf.bearing(a, b); // -180..180, 0 = North, 90 = East
}

export function bearingToDirection(bearing) {
  const directions = [
    "North",
    "Northeast",
    "East",
    "Southeast",
    "South",
    "Southwest",
    "West",
    "Northwest",
  ];
  const normalized = (bearing + 360) % 360; // 0..360
  const idx = Math.round(normalized / 45) % 8;
  return directions[idx];
}

export function getRouteDirection(coords) {
  if (!Array.isArray(coords) || coords.length < 2)
    return { bearing: 0, direction: "unknown" };
  const start = coords[0];
  const end = coords[coords.length - 1];
  const bearing = computeBearingBetween(start, end);
  return { bearing, direction: bearingToDirection(bearing) };
}
