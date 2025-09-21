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

      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        modelScene = gltf.scene;
        modelScene.scale.setScalar(scale);
        modelScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.scene.add(modelScene);
      });

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

      // محاسبه اندیس و مقدار پیشرفت بین نقاط
      const index = Math.floor(progress * (route.length - 1));
      const nextIndex = (index + 1) % route.length;
      const t = progress * (route.length - 1) - index;

      const targetLon = lerp(route[index][0], route[nextIndex][0], t);
      const targetLat = lerp(route[index][1], route[nextIndex][1], t);

      // جهت درست بین دو نقطه
      const currentPoint = turf.point([prevLon, prevLat]);
      const nextPoint = turf.point([targetLon, targetLat]);
      let chosenBearing = turf.bearing(currentPoint, nextPoint);

      // تشخیص شرق-غرب یا شمال-جنوب
      const absBearing = Math.abs(chosenBearing);
      if (absBearing <= 45 || absBearing >= 135) {
        // شمال به جنوب
        chosenBearing += 90;
      }

      // smoothing چرخش
      const rotTimeConstantMs = 90;
      const alphaRot = 1 - Math.exp(-dt / rotTimeConstantMs);
      const delta = ((chosenBearing - prevBearing + 540) % 360) - 180;
      prevBearing += delta * alphaRot;

      // smoothing موقعیت
      const posTimeConstantMs = 120;
      const alphaPos = 1 - Math.exp(-dt / posTimeConstantMs);
      prevLon = lerp(prevLon, targetLon, alphaPos);
      prevLat = lerp(prevLat, targetLat, alphaPos);

      const smoothedCoords = [prevLon, prevLat];
      if (onMove) onMove(smoothedCoords);

      const modelMatrix = this.map.transform.getMatrixForModel(
        smoothedCoords,
        0
      );
      const m = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix
      );
      const l = new THREE.Matrix4().fromArray(modelMatrix);
      this.camera.projectionMatrix = m.multiply(l);

      if (modelScene)
        modelScene.rotation.set(0, THREE.MathUtils.degToRad(prevBearing), 0);
      if (groundMesh) groundMesh.position.set(0, 0.1, 0);
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
