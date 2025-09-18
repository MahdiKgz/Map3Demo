import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import * as turf from "@turf/turf";

export function createAirplaneLayer({
  id,
  url,
  route,
  speed,
  altitude = 150,
  scale = 1.0,
  getSpeed,
  onMove,
}) {
  const line = turf.lineString(route);
  const lineDistance = turf.length(line, { units: "kilometers" });
  // Overall intended route direction (start -> end)
  const overallBearing = (() => {
    if (Array.isArray(route) && route.length >= 2) {
      return turf.bearing(
        turf.point(route[0]),
        turf.point(route[route.length - 1])
      );
    }
    return 0;
  })();

  let progress = 0;
  let modelScene = null;
  let lastTs = 0;
  let prevLon = route?.[0]?.[0] ?? 0;
  let prevLat = route?.[0]?.[1] ?? 0;
  let prevBearing = 0;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function normalizeAngleDeg(deg) {
    let a = deg % 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  }

  // Ground effects: shadow mapping and scanning ring
  let groundMesh, scanMesh;
  const groundMaterial = new THREE.MeshLambertMaterial({
    color: 0xf5f5f5,
    transparent: true,
    opacity: 0.1,
  });

  const scanMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uMaxRadius: { value: 400.0 },
      uThickness: { value: 20.0 },
      uColor: { value: new THREE.Color(0x55ff88) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uMaxRadius;
      uniform float uThickness;
      uniform vec3 uColor;
      void main(){
        float r = length(vUv);
        float t = mod(uTime, 1.0);
        float ring = smoothstep(t, t - (uThickness / uMaxRadius), r) - smoothstep(t + (uThickness / uMaxRadius), t, r);
        float fade = 1.0 - t;
        vec3 col = uColor * fade;
        gl_FragColor = vec4(col, ring * 0.5);
      }
    `,
  });

  return {
    id: `3d-airplane-${id}`,
    type: "custom",
    renderingMode: "3d",
    onAdd(map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
      this.scene.add(ambientLight);

      // Directional light with shadow mapping (2 o'clock sun direction)
      const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
      sunLight.position.set(400, 500, -200);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 2048;
      sunLight.shadow.mapSize.height = 2048;
      sunLight.shadow.camera.near = 0.5;
      sunLight.shadow.camera.far = 1000;
      sunLight.shadow.camera.left = -200;
      sunLight.shadow.camera.right = 200;
      sunLight.shadow.camera.top = 200;
      sunLight.shadow.camera.bottom = -200;
      this.scene.add(sunLight);

      // Airplane model
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        modelScene = gltf.scene;
        // Apply user-defined scale
        modelScene.scale.setScalar(scale);
        // Enable shadow casting
        modelScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.scene.add(modelScene);
      });

      // Ground plane to receive shadows
      const groundGeometry = new THREE.PlaneGeometry(400, 400);
      groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.y = 0.1;
      groundMesh.receiveShadow = true;
      this.scene.add(groundMesh);

      const planeGeoScan = new THREE.PlaneGeometry(1000, 1000, 1, 1);
      scanMesh = new THREE.Mesh(planeGeoScan, scanMaterial);
      scanMesh.rotation.x = -Math.PI / 2;
      this.scene.add(scanMesh);

      this.map = map;
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    },
    render(gl, args) {
      if (!route || route.length === 0) return;
      const now = performance.now();
      const dt = lastTs ? now - lastTs : 16.67;
      lastTs = now;
      const currentSpeed =
        typeof getSpeed === "function" ? getSpeed() : speed || 0.00025;
      const frameScale = dt / 16.67;
      progress += currentSpeed * frameScale;
      if (progress > 1) progress = 0;

      const along = turf.along(line, lineDistance * progress, {
        units: "kilometers",
      });
      const coords = along?.geometry?.coordinates;
      if (!coords) return;

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
      const bFwd = turf.bearing(turf.point(coords), nextFwd);
      const bBack = turf.bearing(turf.point(coords), nextBack);
      const chosenBearing =
        Math.abs(((bFwd - overallBearing + 540) % 360) - 180) <=
        Math.abs(((bBack - overallBearing + 540) % 360) - 180)
          ? bFwd
          : bBack;

      // Time-based smoothing for heading and position
      const posTimeConstantMs = 120;
      const rotTimeConstantMs = 90;
      const alphaPos = 1 - Math.exp(-dt / Math.max(1, posTimeConstantMs));
      const alphaRot = 1 - Math.exp(-dt / Math.max(1, rotTimeConstantMs));

      const targetLon = coords[0];
      const targetLat = coords[1];

      const delta = normalizeAngleDeg(chosenBearing - prevBearing);
      prevBearing = prevBearing + delta * alphaRot;

      prevLon = lerp(prevLon, targetLon, alphaPos);
      prevLat = lerp(prevLat, targetLat, alphaPos);
      const smoothedCoords = [prevLon, prevLat];

      // Notify position for chase mode
      if (onMove) onMove(smoothedCoords);

      // Projection anchored at ground; local Y is meters
      const modelMatrix = this.map.transform.getMatrixForModel(
        smoothedCoords,
        0
      );
      const m = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix
      );
      const l = new THREE.Matrix4().fromArray(modelMatrix);
      this.camera.projectionMatrix = m.multiply(l);

      // Place airplane and ground effects in local space
      if (modelScene) {
        modelScene.position.set(0, altitude, 0);
        modelScene.rotation.set(0, THREE.MathUtils.degToRad(prevBearing), 0);
      }
      if (groundMesh) {
        groundMesh.position.set(0, 0.1, 0);
      }
      if (scanMesh) {
        scanMesh.position.set(0, 0.11, 0);
        scanMesh.material.uniforms.uTime.value += dt * 0.0003;
      }

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    },
  };
}
