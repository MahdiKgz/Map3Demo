import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import * as turf from "@turf/turf";

export function createModelLayer({
  id,
  url,
  route,
  speed,
  onMove,
  getSpeed,
  getRoute,
  modelScale = [0.005, 0.005, 0.005],
  modelRotationOffset = 0,
  autoFlip = true,
}) {
  let currentRoute = route;
  let line = turf.lineString(currentRoute);
  let lineDistance = turf.length(line, { units: "kilometers" });
  let progress = 0;
  let modelScene = null;
  let lastTs = 0;
  let prevLon = route?.[0]?.[0] ?? 0;
  let prevLat = route?.[0]?.[1] ?? 0;
  let prevBearing = 0;
  // Overall intended route direction (start -> end)
  let overallBearing = (() => {
    if (Array.isArray(currentRoute) && currentRoute.length >= 2) {
      return turf.bearing(
        turf.point(currentRoute[0]),
        turf.point(currentRoute[currentRoute.length - 1])
      );
    }
    return 0;
  })();

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function normalizeAngleDeg(deg) {
    let a = ((deg % 360) + 360) % 360; // 0..359
    if (a > 180) a -= 360; // -180..180
    return a;
  }

  function angleDiff(a, b) {
    return Math.abs(normalizeAngleDeg(a - b));
  }

  function routesDiffer(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return true;
    const a0 = a[0] || [];
    const b0 = b[0] || [];
    const al = a[a.length - 1] || [];
    const bl = b[b.length - 1] || [];
    return (
      a0[0] !== b0[0] || a0[1] !== b0[1] || al[0] !== bl[0] || al[1] !== bl[1]
    );
  }

  return {
    id: `3d-model-${id}`,
    type: "custom",
    renderingMode: "3d",
    onAdd(map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      const ambientLight = new THREE.AmbientLight(0x404040, 2);
      this.scene.add(ambientLight);
      const sunLight = new THREE.DirectionalLight(0xffffff, 2);
      sunLight.position.set(100, 200, 300);
      this.scene.add(sunLight);
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        modelScene = gltf.scene;
        modelScene.scale.set(...modelScale);
        this.scene.add(modelScene);
      });
      this.map = map;
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;
    },
    render(gl, args) {
      if (!modelScene) return;

      if (typeof getRoute === "function") {
        const latestRoute = getRoute();
        if (latestRoute && routesDiffer(latestRoute, currentRoute)) {
          currentRoute = latestRoute;
          line = turf.lineString(currentRoute);
          lineDistance = turf.length(line, { units: "kilometers" });
          overallBearing = turf.bearing(
            turf.point(currentRoute[0]),
            turf.point(currentRoute[currentRoute.length - 1])
          );
          progress = Math.min(Math.max(progress, 0), 1);
          // reset smoothing anchors to new start (avoid huge jumps)
          prevLon = currentRoute[0][0];
          prevLat = currentRoute[0][1];
        }
      }

      const now = performance.now();
      const dt = lastTs ? now - lastTs : 16.67;
      lastTs = now;
      const currentSpeed =
        typeof getSpeed === "function" ? getSpeed() : speed || 0.0002;
      const frameScale = dt / 16.67;
      progress += currentSpeed * frameScale;
      if (progress > 1) progress = 0;

      const along = turf.along(line, lineDistance * progress, {
        units: "kilometers",
      });
      const coords = along?.geometry?.coordinates;
      if (!coords) return;

      // Time-based exponential smoothing factors (ms time constants)
      const posTimeConstantMs = 120;
      const rotTimeConstantMs = 90;
      const alphaPos = 1 - Math.exp(-dt / Math.max(1, posTimeConstantMs));
      const alphaRot = 1 - Math.exp(-dt / Math.max(1, rotTimeConstantMs));

      const targetLon = coords[0];
      const targetLat = coords[1];

      // Choose forward direction that best aligns with overall route direction
      const eps = Math.max(0.0005, 0.001 * (1 / Math.max(lineDistance, 1e-6)));
      const fwdP = (progress + eps) % 1;
      const backP = (progress - eps + 1) % 1;
      const nextFwd = turf.along(line, lineDistance * fwdP, {
        units: "kilometers",
      });
      const nextBack = turf.along(line, lineDistance * backP, {
        units: "kilometers",
      });

      // ensure we pass points into bearing
      const currentPoint = turf.point(coords);
      const nextFwdPoint = turf.point(nextFwd.geometry.coordinates);
      const nextBackPoint = turf.point(nextBack.geometry.coordinates);

      const bFwd = turf.bearing(currentPoint, nextFwdPoint);
      const bBack = turf.bearing(currentPoint, nextBackPoint);

      let chosenBearing =
        angleDiff(bFwd, overallBearing) <= angleDiff(bBack, overallBearing)
          ? bFwd
          : bBack;

      // Apply model rotation offset and auto-flip if needed
      chosenBearing = normalizeAngleDeg(chosenBearing + modelRotationOffset);
      if (autoFlip) {
        const diffToOverall = angleDiff(chosenBearing, overallBearing);
        if (diffToOverall > 90) {
          chosenBearing = normalizeAngleDeg(chosenBearing + 180);
        }
      }

      // Smooth rotation along shortest path
      const delta = normalizeAngleDeg(chosenBearing - prevBearing);
      prevBearing = prevBearing + delta * alphaRot;

      // Smooth position
      prevLon = lerp(prevLon, targetLon, alphaPos);
      prevLat = lerp(prevLat, targetLat, alphaPos);
      const smoothedCoords = [prevLon, prevLat];

      if (onMove) onMove(smoothedCoords, prevBearing);

      // Set only yaw (rotation around Y)
      modelScene.rotation.set(0, THREE.MathUtils.degToRad(prevBearing), 0);

      const modelMatrix = this.map.transform.getMatrixForModel(
        smoothedCoords,
        0
      );
      const m = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix
      );
      const l = new THREE.Matrix4().fromArray(modelMatrix);
      this.camera.projectionMatrix = m.multiply(l);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    },
  };
}
