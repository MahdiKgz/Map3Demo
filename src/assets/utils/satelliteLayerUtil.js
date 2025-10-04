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
  // Satellite movement state variables
  let modelScene = null; // 3D model object
  let lastTrackUpdate = 0; // Last track line update timestamp
  let lastTs = 0; // Last timestamp for frame timing
  let prevLon = null; // Previous longitude for smoothing
  let prevLat = null; // Previous latitude for smoothing
  let prevBearingDeg = 0; // Previous bearing for rotation smoothing

  // Linear interpolation between two values
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Calculate bearing between two geographic points using spherical geometry
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

  // Parse TLE (Two-Line Element) data for satellite orbital calculations
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

      // Calculate satellite position using orbital mechanics
      const now = new Date();
      const gmst = satellite.gstime(now); // Greenwich Mean Sidereal Time
      const positionAndVelocity = satellite.propagate(satrec, now);
      const positionEci = positionAndVelocity.position;
      if (!positionEci) return;

      // Convert from ECI (Earth-Centered Inertial) to geodetic coordinates
      const positionGd = satellite.eciToGeodetic(positionEci, gmst);
      const longitude = satellite.degreesLong(positionGd.longitude);
      const latitude = satellite.degreesLat(positionGd.latitude);

      // Apply position smoothing to reduce jitter in satellite movement
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
      // Notify parent component of position changes
      if (onMove) onMove(coords, prevBearingDeg);

      // Calculate look-ahead position for smooth heading calculation
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

      // Smooth rotation changes to avoid sudden direction changes
      const baseRotTimeConstantMs = 300;
      const alphaRot = 1 - Math.exp(-dt / baseRotTimeConstantMs);
      let delta = targetBearingDeg - prevBearingDeg;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      prevBearingDeg += delta * alphaRot;

      // Calculate 3D transformation matrix for satellite positioning
      const modelMatrix = this.map.transform.getMatrixForModel(coords, 0);
      const m = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix
      );
      const l = new THREE.Matrix4().fromArray(modelMatrix);
      this.camera.projectionMatrix = m.multiply(l);

      // Position satellite model with altitude offset and apply rotation
      modelScene.position.set(0, altitudeOffset, 0);
      modelScene.rotation.set(0, THREE.MathUtils.degToRad(prevBearingDeg), 0);

      // Update orbital track line visualization at 1Hz frequency
      const tNow = performance.now();
      if (!lastTrackUpdate || tNow - lastTrackUpdate > 1000) {
        lastTrackUpdate = tNow;
        const coordsArr = [];
        const startMs = now.getTime();
        // Generate track points for the specified duration
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
        // Update the track line on the map
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
