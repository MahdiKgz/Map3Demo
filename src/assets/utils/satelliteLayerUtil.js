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
    return (toDeg(θ) + 360) % 360;
  }

  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);

  const nowInit = new Date();
  const pvInit = satellite.propagate(satrec, nowInit);
  const gmstInit = satellite.gstime(nowInit);
  const velocityEcf = pvInit.velocity
    ? satellite.eciToEcf(pvInit.velocity, gmstInit)
    : { x: 0, y: 0, z: 0 };
  const baseSpeed = Math.sqrt(
    velocityEcf.x ** 2 + velocityEcf.y ** 2 + velocityEcf.z ** 2
  );

  let speedFactor = 1;
  function setSpeedFactor(newFactor) {
    speedFactor = newFactor;
  }

  return {
    id: `3d-satellite-${id}`,
    type: "custom",
    renderingMode: "3d",

    onAdd(map, gl) {
      this.map = map;
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      this.scene.add(new THREE.AmbientLight(0x404040, 1.2));
      const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
      sunLight.position.set(400, 500, -200);
      this.scene.add(sunLight);

      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        modelScene = gltf.scene;
        modelScene.scale.setScalar(scale);
        this.scene.add(modelScene);
      });

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
      const simTime = new Date(now.getTime() * speedFactor);

      const gmst = satellite.gstime(simTime);
      const pv = satellite.propagate(satrec, simTime);
      if (!pv.position) return;

      const posGd = satellite.eciToGeodetic(pv.position, gmst);
      const lon = satellite.degreesLong(posGd.longitude);
      const lat = satellite.degreesLat(posGd.latitude);

      if (prevLon === null || prevLat === null) {
        prevLon = lon;
        prevLat = lat;
      } else {
        const alpha = 1 - Math.exp(-dt / 300);
        prevLon = lerp(prevLon, lon, alpha);
        prevLat = lerp(prevLat, lat, alpha);
      }

      const coords = [prevLon, prevLat];
      if (onMove) onMove(coords, prevBearingDeg);

      const aheadDate = new Date(simTime.getTime() + 1000);
      const gmstAhead = satellite.gstime(aheadDate);
      const pvAhead = satellite.propagate(satrec, aheadDate);
      let targetBearingDeg = prevBearingDeg;
      if (pvAhead.position) {
        const gdAhead = satellite.eciToGeodetic(pvAhead.position, gmstAhead);
        targetBearingDeg = computeBearingDeg(
          prevLon,
          prevLat,
          satellite.degreesLong(gdAhead.longitude),
          satellite.degreesLat(gdAhead.latitude)
        );
      }

      const alphaRot = 1 - Math.exp(-dt / 300);
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

      modelScene.position.set(0, altitudeOffset, 0);
      modelScene.rotation.set(0, THREE.MathUtils.degToRad(prevBearingDeg), 0);

      const tNow = performance.now();
      if (!lastTrackUpdate || tNow - lastTrackUpdate > 1000) {
        lastTrackUpdate = tNow;
        const coordsArr = [];
        const startMs = simTime.getTime();
        for (let t = 0; t <= trackDurationSec; t += trackStepSec) {
          const date = new Date(startMs + t * 1000);
          const gmstT = satellite.gstime(date);
          const pvT = satellite.propagate(satrec, date);
          if (!pvT.position) continue;
          const gd = satellite.eciToGeodetic(pvT.position, gmstT);
          coordsArr.push([
            satellite.degreesLong(gd.longitude),
            satellite.degreesLat(gd.latitude),
          ]);
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

    setSpeedFactor,
    getBaseSpeed: () => baseSpeed,
  };
}
