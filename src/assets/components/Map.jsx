import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import { modelRoutes } from "../constants/modelRoutes";
import { createModelLayer } from "../utils/modelLayerUtil";

export default function Map() {
  const mapRef = useRef(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: "map",
      style:
        "https://api.maptiler.com/maps/streets/style.json?key=ptfxXLdhtmf4nGINCED1",
      zoom: 16,
      center: [51.42020528928899, 35.701488691457925],
      pitch: 60,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;

    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
      // Add each route and model layer
      modelRoutes.forEach((config) => {
        // Add route line
        const routeLine = turf.lineString(config.route);
        map.addSource(`route-${config.id}`, {
          type: "geojson",
          data: routeLine,
        });
        map.addLayer({
          id: `route-line-${config.id}`,
          type: "line",
          source: `route-${config.id}`,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": config.color, "line-width": 4 },
        });
        // Add 3D model layer
        map.addLayer(
          createModelLayer({
            id: config.id,
            url: config.url,
            route: config.route,
            speed: config.speed,
            color: config.color,
          })
        );
      });
    });

    return () => {
      map.remove();
    };
  }, []);

  return <div id="map" className="w-screen h-screen" />;
}
