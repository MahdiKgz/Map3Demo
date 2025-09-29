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
  let lastTs = 0;
  let prevLon = null;
  let prevLat = null;
  let prevBearingDeg = 0;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Compute initial bearing from point A to B (lon/lat in degrees)
  function computeBearingDeg(lon1, lat1, lon2, lat2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const λ1 = toRad(lon1);
    const λ2 = toRad(lon2);
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1) +
      Math.sin(φ1) * Math.sin(φ2);
    const θ = Math.atan2(y, x);
    const brng = (toDeg(θ) + 360) % 360;
    return brng;
  }

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

      const nowPerf = performance.now();
      const dt = lastTs ? nowPerf - lastTs : 16.67;
      lastTs = nowPerf;

      const now = new Date();
      const gmst = satellite.gstime(now);
      const positionAndVelocity = satellite.propagate(satrec, now);
      const positionEci = positionAndVelocity.position;
      if (!positionEci) return;

      const positionGd = satellite.eciToGeodetic(positionEci, gmst);
      const longitude = satellite.degreesLong(positionGd.longitude);
      const latitude = satellite.degreesLat(positionGd.latitude);

      // Ground projection with smoothing for map and local altitude
      if (prevLon === null || prevLat === null) {
        prevLon = longitude;
        prevLat = latitude;
      } else {
        const posTimeConstantMs = 300;
        const alphaPos = 1 - Math.exp(-dt / posTimeConstantMs);
        prevLon = lerp(prevLon, longitude, alphaPos);
        prevLat = lerp(prevLat, latitude, alphaPos);
      }
      const coords = [prevLon, prevLat];
      if (onMove) onMove(coords, prevBearingDeg);

      // Forward-looking point to estimate heading (1s ahead)
      const aheadDate = new Date(now.getTime() + 1000);
      const gmstAhead = satellite.gstime(aheadDate);
      const pvAhead = satellite.propagate(satrec, aheadDate);
      let targetBearingDeg = prevBearingDeg;
      if (pvAhead.position) {
        const gdAhead = satellite.eciToGeodetic(pvAhead.position, gmstAhead);
        const lonAhead = satellite.degreesLong(gdAhead.longitude);
        const latAhead = satellite.degreesLat(gdAhead.latitude);
        targetBearingDeg = computeBearingDeg(
          prevLon,
          prevLat,
          lonAhead,
          latAhead
        );
      }

      // Smooth rotation similar to ground/air models
      const baseRotTimeConstantMs = 300;
      const alphaRot = 1 - Math.exp(-dt / baseRotTimeConstantMs);
      let delta = targetBearingDeg - prevBearingDeg;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      prevBearingDeg += delta * alphaRot;

      const modelMatrix = this.map.transform.getMatrixForModel(coords, 0);
      const m = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix
      );
      const l = new THREE.Matrix4().fromArray(modelMatrix);
      this.camera.projectionMatrix = m.multiply(l);

      // Place satellite above ground by altitudeOffset meters and set yaw
      modelScene.position.set(0, altitudeOffset, 0);
      modelScene.rotation.set(0, THREE.MathUtils.degToRad(prevBearingDeg), 0);

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
