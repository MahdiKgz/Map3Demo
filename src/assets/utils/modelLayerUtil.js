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
}) {
  let currentRoute = route;
  let progress = 0;
  let modelScene = null;
  let lastTs = 0;
  let prevLon = route?.[0]?.[0] ?? 0;
  let prevLat = route?.[0]?.[1] ?? 0;
  let prevBearing = 0;

  function lerp(a, b, t) {
    return a + (b - a) * t;
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
        // NOTE : here is the example of GLB/glTF modification
        // modelScene.traverse((child) => {
        //   console.log(child.name);
        //   if (child.isMesh && child.name.includes("TailLight")) {
        //     child.material.transparent = true;
        //     child.material.opacity = 0.3;
        //     child.material.color.set(0x99ccff);
        //     child.material.roughness = 0.1;
        //     child.material.metalness = 0.5;
        //   }
        // });
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
          progress = Math.min(Math.max(progress, 0), 1);
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

      const routeLen = currentRoute.length;
      const index = Math.floor(progress * (routeLen - 1));
      const nextIndex = (index + 1) % routeLen;
      const t = progress * (routeLen - 1) - index;

      const targetLon = lerp(
        currentRoute[index][0],
        currentRoute[nextIndex][0],
        t
      );
      const targetLat = lerp(
        currentRoute[index][1],
        currentRoute[nextIndex][1],
        t
      );

      const currentPoint = turf.point([prevLon, prevLat]);
      const nextPoint = turf.point([targetLon, targetLat]);
      let chosenBearing = turf.bearing(currentPoint, nextPoint);

      const rotTimeConstantMs = 90;
      const alphaRot = 1 - Math.exp(-dt / rotTimeConstantMs);
      const delta = ((chosenBearing - prevBearing + 540) % 360) - 180;
      prevBearing += delta * alphaRot;

      const posTimeConstantMs = 120;
      const alphaPos = 1 - Math.exp(-dt / posTimeConstantMs);
      prevLon = lerp(prevLon, targetLon, alphaPos);
      prevLat = lerp(prevLat, targetLat, alphaPos);
      const smoothedCoords = [prevLon, prevLat];

      if (onMove) onMove(smoothedCoords, prevBearing);
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
