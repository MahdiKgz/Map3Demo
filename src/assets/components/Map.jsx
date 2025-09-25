import React, { useEffect, useRef } from "react";
import maplibregl, { NavigationControl } from "maplibre-gl";
import * as turf from "@turf/turf";
import { useSelector, useDispatch } from "react-redux";
import { createModelLayer } from "../utils/modelLayerUtil";
import { createAirplaneLayer } from "../utils/airplaneLayerUtil";
import { createSatelliteLayer } from "../utils/satelliteLayerUtil";
import { createThreeBuildingsLayer } from "../utils/threeBuildingsLayerUtil";
import { buildingPoints } from "../constants/buildingConstants";
import { updateStatus } from "../redux/slices/status.slice";
import { updateChaseStatus } from "../redux/slices/chase.slice";

export default function Map() {
  const mapRef = useRef(null);
  const dispatch = useDispatch();
  const models = useSelector((state) => state.models.models);
  const chasedModelId = useSelector((state) => state.models.chasedModelId);

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
      style: "https://tiles.openfreemap.org/styles/bright",
      zoom: 16,
      center: [51.409623, 35.736233],
      pitch: 100,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;

    // Add event listeners for status updates
    function metersPerPixel(latitude, zoom) {
      const earthCircumference = 40075016.686; // meters
      const tileSize = 512; // style uses 512px tiles
      const latRad = (latitude * Math.PI) / 180;
      return (
        (earthCircumference * Math.cos(latRad)) / (tileSize * Math.pow(2, zoom))
      );
    }

    const updateStatusData = () => {
      const center = map?.getCenter();
      const zoom = map?.getZoom();
      const scale = metersPerPixel(center.lat, zoom);

      dispatch(
        updateStatus({
          lat: center.lat,
          lng: center.lng,
          zoom: zoom,
          scale: scale,
        })
      );
    };

    // Update status on mouse move (always user-driven)
    map.on("mousemove", (e) => {
      const lngLat = e.lngLat;
      const zoom = map.getZoom();
      const scale = metersPerPixel(lngLat.lat, zoom);
      dispatch(
        updateStatus({
          lat: lngLat.lat,
          lng: lngLat.lng,
          zoom: zoom,
          scale: scale,
        })
      );
    });

    // Update status on zoom change (only when user interacts)
    const onUserZoom = (e) => {
      if (!e || !e.originalEvent) return;
      updateStatusData();
    };
    map.on("zoom", onUserZoom);
    map.on("zoomend", onUserZoom);

    // Update status on move/pan (only when user interacts)
    const onUserMove = (e) => {
      if (!e || !e.originalEvent) return;
      updateStatusData();
    };
    map.on("move", onUserMove);
    map.on("moveend", onUserMove);

    // Initial status update
    updateStatusData();

    map.on("style.load", () => {
      map.setProjection({ type: "globe" });

      const nav = new NavigationControl({ visualizePitch: true });
      map.addControl(nav, "top-right");

      const shaderCenter = buildingPoints.length
        ? [buildingPoints[0].lng, buildingPoints[0].lat]
        : map.getCenter()?.toArray?.() || [51.409623, 35.736233];

      const buildings = buildingPoints.map((p) => ({
        lng: p.lng,
        lat: p.lat,
        height: 50 + Math.random() * 50,
        size: 18,
      }));

      const threeLayer = createThreeBuildingsLayer({
        id: "three-buildings-custom",
        centerLngLat: shaderCenter,
        buildings,
      });
      if (!map.getLayer("three-buildings-custom")) {
        map.addLayer(threeLayer);
      }

      // Helper to tightly synchronize camera to a target coordinate
      function chaseCameraTo(target, options = {}) {
        const curCenter = map.getCenter();
        const curBearing = map.getBearing();
        const curZoom = map.getZoom();
        const tgt = new maplibregl.LngLat(target[0], target[1]);
        const cc = map.project(curCenter);
        const tc = map.project(tgt);
        const dx = tc.x - cc.x;
        const dy = tc.y - cc.y;
        const distPx = Math.hypot(dx, dy);
        const targetZoom = options.zoom ?? curZoom;
        const targetBearing = options.bearing ?? curBearing;

        // Close: jump to avoid easing lag; Mid: short ease; Far: slightly longer ease
        if (distPx < 4) {
          map.jumpTo({ center: tgt, zoom: targetZoom, bearing: targetBearing });
        } else if (distPx < 64) {
          map.easeTo({
            center: tgt,
            zoom: targetZoom,
            bearing: targetBearing,
            duration: 120,
            easing: (t) => t,
          });
        } else {
          map.easeTo({
            center: tgt,
            zoom: targetZoom,
            bearing: targetBearing,
            duration: 220,
            easing: (t) => 1 - (1 - t) * (1 - t),
          });
        }
      }

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
                    now - lastFollowTsRef.current > 50
                  ) {
                    lastFollowTsRef.current = now;
                    chaseCameraTo(coords, { zoom: 16 });
                    dispatch(
                      updateChaseStatus({ lat: coords[1], lng: coords[0] })
                    );
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
              onMove: (coords, bearingDeg, phase) => {
                const now = Date.now();
                if (
                  chasedRef.current === config.id &&
                  now - lastFollowTsRef.current > 50
                ) {
                  lastFollowTsRef.current = now;
                  chaseCameraTo(coords, { zoom: 20, bearing: bearingDeg });
                  dispatch(
                    updateChaseStatus({ lat: coords[1], lng: coords[0] })
                  );
                  if (phase === "start") {
                    dispatch(
                      updateChaseStatus({
                        message: "وسیله نقلیه حرکت خود را شروع کرده",
                      })
                    );
                  } else if (phase === "stop") {
                    dispatch(
                      updateChaseStatus({ message: "وسیله در مسیر توقف داشته" })
                    );
                  } else if (phase === "end") {
                    dispatch(
                      updateChaseStatus({
                        message: "وسیله به پایان مسیر رسیده است",
                      })
                    );
                  } else if (phase === "moving") {
                    // Clear stop message when resuming movement
                    dispatch(updateChaseStatus({ message: null }));
                  }
                }
              },
            };
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

    return () => map.remove();
  }, [dispatch]);

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
