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
  headingOffsetDeg,
}) {
  // Airplane movement state variables
  let progress = 0; // Progress along route (0 to 1)
  let modelScene = null; // 3D model object
  let lastTs = 0; // Last timestamp for frame timing
  let lastRenderTs = 0; // Last render timestamp for FPS limiting
  let prevLon = route?.[0]?.[0] ?? 0; // Previous longitude for smoothing
  let prevLat = route?.[0]?.[1] ?? 0; // Previous latitude for smoothing
  let prevBearing = 0; // Previous bearing for rotation smoothing
  let modelHeadingOffsetDeg =
    typeof headingOffsetDeg === "number" ? headingOffsetDeg : 0;
  let headingResolved = typeof headingOffsetDeg === "number";

  // Linear interpolation between two values
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Ground shadow and scanning effect meshes
  let groundMesh, scanMesh;
  // Ground shadow material for airplane projection
  const groundMaterial = new THREE.MeshLambertMaterial({
    color: 0xf5f5f5,
    transparent: true,
    opacity: 0.1,
  });

  // Animated scanning effect material using custom shaders
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
        // Infer forward axis offset if not provided
        if (!headingResolved) {
          const bbox = new THREE.Box3().setFromObject(modelScene);
          const size = new THREE.Vector3();
          bbox.getSize(size);
          if (size.x > size.z * 1.1) {
            modelHeadingOffsetDeg = -90;
          } else {
            modelHeadingOffsetDeg = 0;
          }
          headingResolved = true;
        }
        // Initial one-time 90° right rotation
        modelHeadingOffsetDeg += 90;
        this.scene.add(modelScene);
      });

      const groundGeometry = new THREE.PlaneGeometry(400, 400);
      groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.y = Math.max(0.1, altitude * 0.0);
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
      // Get current speed (can be dynamic via getSpeed function or static)
      const currentSpeed =
        typeof getSpeed === "function" ? getSpeed() : speed || 0;
      const frameScale = dt / 16.67;

      // Update progress along route and wrap around for continuous flight
      progress += currentSpeed * frameScale;
      if (progress > 1) progress = 0;

      // Calculate current position between route waypoints
      const index = Math.floor(progress * (route.length - 1));
      const nextIndex = (index + 1) % route.length;
      const t = progress * (route.length - 1) - index;

      const targetLon = lerp(route[index][0], route[nextIndex][0], t);
      const targetLat = lerp(route[index][1], route[nextIndex][1], t);

      // Calculate look-ahead point for smooth heading calculation
      let aheadT = t + 0.02;
      let ai = index;
      let ani = nextIndex;
      if (aheadT > 1.0) {
        ai = nextIndex;
        ani = (ai + 1) % route.length;
        aheadT = aheadT - 1.0;
      }
      const aheadLon = lerp(route[ai][0], route[ani][0], aheadT);
      const aheadLat = lerp(route[ai][1], route[ani][1], aheadT);

      // Calculate bearing from current position to look-ahead point
      let chosenBearing = turf.bearing(
        turf.point([targetLon, targetLat]),
        turf.point([aheadLon, aheadLat])
      );

      // Smooth rotation changes based on speed to avoid sudden direction changes
      const baseRotTimeConstantMs = 90;
      const speedFactor = Math.min(Math.max(currentSpeed * 1000, 0.1), 2.0);
      const rotTimeConstantMs = baseRotTimeConstantMs / speedFactor;
      const alphaRot = 1 - Math.exp(-dt / rotTimeConstantMs);

      // Normalize bearing difference to -180 to 180 range
      const delta = ((chosenBearing - prevBearing + 540) % 360) - 180;
      prevBearing += delta * alphaRot;

      // Smooth position changes based on speed for fluid movement
      const basePosTimeConstantMs = 160;
      const posSpeedFactor = Math.min(Math.max(currentSpeed * 1000, 0.1), 2.0);
      const posTimeConstantMs = basePosTimeConstantMs / posSpeedFactor;
      const alphaPos = 1 - Math.exp(-dt / posTimeConstantMs);
      prevLon = lerp(prevLon, targetLon, alphaPos);
      prevLat = lerp(prevLat, targetLat, alphaPos);

      const smoothedCoords = [prevLon, prevLat];
      // Notify parent component of position changes
      if (onMove) onMove(smoothedCoords, prevBearing);

      // Calculate 3D transformation matrix for airplane positioning
      const modelMatrix = this.map.transform.getMatrixForModel(
        smoothedCoords,
        0
      );
      const m = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix
      );
      const l = new THREE.Matrix4().fromArray(modelMatrix);
      this.camera.projectionMatrix = m.multiply(l);

      // Apply rotation to 3D model based on calculated bearing
      if (modelScene)
        modelScene.rotation.set(
          0,
          THREE.MathUtils.degToRad(prevBearing + modelHeadingOffsetDeg),
          0
        );

      // Update ground shadow and scanning effect positions
      if (groundMesh) groundMesh.position.set(0, 0.1, 0);
      if (scanMesh) {
        scanMesh.position.set(0, 0.11, 0);
        scanMesh.material.uniforms.uTime.value += dt * 0.0003;
      }

      // Optimize rendering performance with frame rate limiting
      this.renderer.resetState();

      // Frame rate limiting - render at most 60 FPS
      const renderInterval = 1000 / 60; // 16.67ms for 60 FPS
      const timeSinceLastRender = now - lastRenderTs;

      // Only render if there's significant movement or enough time has passed
      const shouldRender =
        timeSinceLastRender >= renderInterval &&
        (Math.abs(targetLon - prevLon) > 0.000001 ||
          Math.abs(targetLat - prevLat) > 0.000001 ||
          Math.abs(chosenBearing - prevBearing) > 0.1);

      if (shouldRender) {
        lastRenderTs = now;
        this.renderer.render(this.scene, this.camera);
        this.map.triggerRepaint();
      }
    },
  };
}
