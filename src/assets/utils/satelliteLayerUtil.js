import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import * as satellite from "satellite.js";

export function createSatelliteLayer({
  id,
  url,
  tle,
  scale = 1.0,
  altitudeOffset = 0,
  color = "#00ffaa",
  trackDurationSec = 600,
  trackStepSec = 20,
  onMove,
}) {
  let modelScene = null;
  let lastTrackUpdate = 0;

  // Precompute satrec
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);

  return {
    id: `3d-satellite-${id}`,
    type: "custom",
    renderingMode: "3d",
    onAdd(map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      const ambientLight = new THREE.AmbientLight(0x404040, 1.2);
      this.scene.add(ambientLight);
      // Directional light at ~2 o'clock
      const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
      sunLight.position.set(400, 500, -200);
      this.scene.add(sunLight);

      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        modelScene = gltf.scene;
        modelScene.scale.setScalar(scale);
        this.scene.add(modelScene);
      });

      this.map = map;
      // Track line source/layer
      const sourceId = `sat-track-${id}`;
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "LineString", coordinates: [] },
          },
        });
        map.addLayer({
          id: `sat-track-line-${id}`,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": color, "line-width": 2 },
        });
      }

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;
    },
    render(gl, args) {
      if (!modelScene) return;

      const now = new Date();
      const gmst = satellite.gstime(now);
      const positionAndVelocity = satellite.propagate(satrec, now);
      const positionEci = positionAndVelocity.position;
      if (!positionEci) return;

      const positionGd = satellite.eciToGeodetic(positionEci, gmst);
      const longitude = satellite.degreesLong(positionGd.longitude);
      const latitude = satellite.degreesLat(positionGd.latitude);

      // Ground projection for map and local altitude
      const coords = [longitude, latitude];
      if (onMove) onMove(coords);

      const modelMatrix = this.map.transform.getMatrixForModel(coords, 0);
      const m = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix
      );
      const l = new THREE.Matrix4().fromArray(modelMatrix);
      this.camera.projectionMatrix = m.multiply(l);

      // Place satellite above ground by altitudeOffset meters
      modelScene.position.set(0, altitudeOffset, 0);

      // Update track line at ~1 Hz
      const tNow = performance.now();
      if (!lastTrackUpdate || tNow - lastTrackUpdate > 1000) {
        lastTrackUpdate = tNow;
        const coordsArr = [];
        const startMs = now.getTime();
        for (let t = 0; t <= trackDurationSec; t += trackStepSec) {
          const date = new Date(startMs + t * 1000);
          const gmstT = satellite.gstime(date);
          const pv = satellite.propagate(satrec, date);
          if (!pv.position) continue;
          const gd = satellite.eciToGeodetic(pv.position, gmstT);
          const lon = satellite.degreesLong(gd.longitude);
          const lat = satellite.degreesLat(gd.latitude);
          coordsArr.push([lon, lat]);
        }
        const src = this.map.getSource(`sat-track-${id}`);
        if (src) {
          src.setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: coordsArr },
          });
        }
      }

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    },
  };
}
