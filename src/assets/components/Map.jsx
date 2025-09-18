import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import { useSelector } from "react-redux";
import { createModelLayer } from "../utils/modelLayerUtil";
import { createAirplaneLayer } from "../utils/airplaneLayerUtil";
import { createSatelliteLayer } from "../utils/satelliteLayerUtil";

export default function Map() {
  const mapRef = useRef(null);
  const models = useSelector((state) => state.models.models);
  const chasedModelId = useSelector((state) => state.models.chasedModelId);

  // Refs to always expose latest state to custom layers
  const modelsRef = useRef(models);
  const chasedRef = useRef(chasedModelId);
  const lastFollowTsRef = useRef(0);

  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  useEffect(() => {
    chasedRef.current = chasedModelId;
  }, [chasedModelId]);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: "map",
      style:
        "https://api.maptiler.com/maps/streets/style.json?key=ptfxXLdhtmf4nGINCED1",
      zoom: 16,
      center: [51.409623, 35.736233],
      pitch: 60,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;

    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
      // Add each route and model layer
      models.forEach((config) => {
        const routeSourceId = `route-${config.id}`;
        if (!map.getSource(routeSourceId)) {
          if (config.type !== "satellite") {
            const routeLine = turf.lineString(config.route);
            map.addSource(routeSourceId, {
              type: "geojson",
              data: routeLine,
            });
            map.addLayer({
              id: `route-line-${config.id}`,
              type: "line",
              source: routeSourceId,
              layout: { "line-join": "round", "line-cap": "round" },
              paint: { "line-color": config.color, "line-width": 4 },
            });
          }
          if (config.type === "airplane") {
            map.addLayer(
              createAirplaneLayer({
                id: config.id,
                url: config.url,
                route: config.route,
                speed: config.speed,
                getSpeed: () => {
                  const current = modelsRef.current.find(
                    (m) => m.id === config.id
                  );
                  return current ? current.speed : config.speed;
                },
                altitude: config.altitude || 150,
                scale: config.scale || 1.0,
                onMove: (coords) => {
                  const now = Date.now();
                  if (
                    chasedRef.current === config.id &&
                    now - lastFollowTsRef.current > 100
                  ) {
                    lastFollowTsRef.current = now;
                    map.easeTo({ center: coords, zoom: 16, duration: 800 });
                  }
                },
              })
            );
          } else if (config.type === "vehicle") {
            const layerOptions = {
              id: config.id,
              url: config.url,
              route: config.route,
              speed: config.speed,
              getSpeed: () => {
                const current = modelsRef.current.find(
                  (m) => m.id === config.id
                );
                return current ? current.speed : config.speed;
              },
              onMove: (coords, bearingDeg) => {
                const now = Date.now();
                if (
                  chasedRef.current === config.id &&
                  now - lastFollowTsRef.current > 100
                ) {
                  lastFollowTsRef.current = now;
                  map.easeTo({
                    center: coords,
                    zoom: 20,
                    bearing: bearingDeg,
                    duration: 400,
                  });
                }
              },
            };
            // Apply per-model scale only for moto-1
            if (config.id === "moto-1" && typeof config.scale === "number") {
              layerOptions.modelScale = [
                config.scale,
                config.scale,
                config.scale,
              ];
            }
            map.addLayer(createModelLayer(layerOptions));
          } else if (config.type === "satellite") {
            map.addLayer(
              createSatelliteLayer({
                id: config.id,
                url: config.url,
                tle: config.tle,
                scale: config.scale || 1.0,
                altitudeOffset: config.altitudeOffset || 0,
                onMove: (coords) => {
                  const now = Date.now();
                  if (
                    chasedRef.current === config.id &&
                    now - lastFollowTsRef.current > 200
                  ) {
                    lastFollowTsRef.current = now;
                    map.easeTo({ center: coords, zoom: 5, duration: 1000 });
                  }
                },
              })
            );
          }
        }
      });
    });

    return () => {
      map.remove();
    };
  }, []);

  // Update route sources when models change (without recreating map)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    models.forEach((config) => {
      const source = map.getSource(`route-${config.id}`);
      if (source) {
        source.setData(turf.lineString(config.route));
      }
    });
  }, [models]);

  return <div id="map" className="w-screen h-screen" />;
}
