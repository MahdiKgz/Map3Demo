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
  modelScale = [0.01, 0.01, 0.01],
  headingOffsetDeg, // optional manual heading offset for model forward axis
  accidents = [], // accident configuration
  onAccidentStart, // callback when accident starts
  onAccidentEnd, // callback when accident ends
}) {
  let currentRoute = route;
  let progress = 0;
  // Distance table for accurate movement along street-like polylines
  let cumulativeDistances = [];
  let totalDistanceMeters = 0;
  let modelScene = null;
  let lastTs = 0;
  let lastRenderTs = 0;
  let prevLon = route?.[0]?.[0] ?? 0;
  let prevLat = route?.[0]?.[1] ?? 0;
  let prevBearing = 0;
  let startedSent = false;
  let stopSent = false;
  let modelHeadingOffsetDeg =
    typeof headingOffsetDeg === "number" ? headingOffsetDeg : 0;
  let headingResolved = typeof headingOffsetDeg === "number";

  // Accident management
  let currentAccident = null;
  let accidentStartTime = 0;
  let isInAccident = false;
  let accidentPosition = null; // Store the exact accident position
  let accidentTriggered = false; // Prevent multiple triggers per route pass

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

  function computeRouteDistances(r) {
    cumulativeDistances = [0];
    totalDistanceMeters = 0;
    if (!Array.isArray(r) || r.length < 2) return;
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1];
      const b = r[i];
      const segKm = turf.distance(a, b, { units: "kilometers" });
      const segMeters = segKm * 1000;
      totalDistanceMeters += segMeters;
      cumulativeDistances.push(totalDistanceMeters);
    }
  }

  function positionAtDistance(distanceMeters) {
    if (
      !Array.isArray(currentRoute) ||
      currentRoute.length < 2 ||
      totalDistanceMeters === 0
    ) {
      return { lon: prevLon, lat: prevLat, index: 0, t: 0 };
    }
    // Clamp distance
    let d = Math.max(0, Math.min(distanceMeters, totalDistanceMeters));

    // Use binary search for better performance on long routes
    let left = 0;
    let right = cumulativeDistances.length - 1;
    let i = 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (cumulativeDistances[mid] <= d) {
        i = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    const segStart = cumulativeDistances[i];
    const segEnd = cumulativeDistances[i + 1] ?? totalDistanceMeters;
    const segLen = Math.max(segEnd - segStart, 1e-6);
    const t = (d - segStart) / segLen;
    const a = currentRoute[i];
    const b = currentRoute[(i + 1) % currentRoute.length];
    const lon = lerp(a[0], b[0], t);
    const lat = lerp(a[1], b[1], t);
    return { lon, lat, index: i, t };
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
        // Heuristic: infer forward axis and set heading offset if not provided
        if (!headingResolved) {
          const bbox = new THREE.Box3().setFromObject(modelScene);
          const size = new THREE.Vector3();
          bbox.getSize(size);
          // Common vehicle GLTFs face +X; if X extent > Z extent, assume +X forward → -90° offset to align with +Z bearing
          if (size.x > size.z * 1.1) {
            modelHeadingOffsetDeg = -90;
          } else {
            modelHeadingOffsetDeg = 0;
          }
          headingResolved = true;
        }
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
      // Precompute distances for accurate along-route motion
      computeRouteDistances(currentRoute);
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
          computeRouteDistances(currentRoute);
          startedSent = false;
        }
      }

      const now = Date.now();
      const dt = lastTs ? now - lastTs : 16.67;
      lastTs = now;

      // Check if we're in an accident
      if (isInAccident && currentAccident) {
        const accidentElapsed = now - accidentStartTime;
        if (accidentElapsed >= currentAccident.duration) {
          // Accident ended, resume movement
          isInAccident = false;
          currentAccident = null;
          if (onAccidentEnd) onAccidentEnd(id);
        } else {
          // Still in accident, don't move but keep rendering
          // Use the accident position instead of route position
          const smoothedCoords = accidentPosition
            ? [accidentPosition.lon, accidentPosition.lat]
            : [prevLon, prevLat];

          // Update chase status with current position during accident
          if (onMove) onMove(smoothedCoords, prevBearing, "accident");

          // Keep the model visible at the accident location
          modelScene.rotation.set(
            0,
            THREE.MathUtils.degToRad(prevBearing + modelHeadingOffsetDeg),
            0
          );

          const modelMatrix = this.map.transform.getMatrixForModel(
            smoothedCoords,
            0
          );
          const m = new THREE.Matrix4().fromArray(
            args.defaultProjectionData.mainMatrix
          );
          const l = new THREE.Matrix4().fromArray(modelMatrix);
          this.camera.projectionMatrix = m.multiply(l);

          // Optimize rendering performance with frame rate limiting
          this.renderer.resetState();

          // Frame rate limiting - render at most 60 FPS
          const renderInterval = 1000 / 60; // 16.67ms for 60 FPS
          const timeSinceLastRender = now - lastRenderTs;

          // Only render if enough time has passed
          const shouldRender = timeSinceLastRender >= renderInterval;

          if (shouldRender) {
            lastRenderTs = now;
            this.renderer.render(this.scene, this.camera);
            this.map.triggerRepaint();
          }

          return;
        }
      }

      const currentSpeed =
        typeof getSpeed === "function" ? getSpeed() : speed || 0;
      const frameScale = dt / 16.67;
      // advance progress and detect wraparound
      progress += currentSpeed * frameScale;
      let wrapped = false;
      if (progress > 1) {
        progress = 0;
        wrapped = true;
        // Reset accident trigger flag when route wraps (new lap)
        accidentTriggered = false;
      }

      // Map progress (0..1) to physical distance along route
      const distanceAlong =
        totalDistanceMeters * Math.min(Math.max(progress, 0), 1);
      const pos = positionAtDistance(distanceAlong);
      const targetLon = pos.lon;
      const targetLat = pos.lat;

      // Compute forward bearing by comparing two points along the route
      const aheadDist = Math.max(1.0, totalDistanceMeters * 0.002);
      const aheadPos = positionAtDistance(distanceAlong + aheadDist);
      let chosenBearing = turf.bearing(
        turf.point([targetLon, targetLat]),
        turf.point([aheadPos.lon, aheadPos.lat])
      );

      // Adaptive rotation smoothing based on speed
      const baseRotTimeConstantMs = 90;
      const speedFactor = Math.min(Math.max(currentSpeed * 1000, 0.1), 2.0); // Scale factor based on speed
      const rotTimeConstantMs = baseRotTimeConstantMs / speedFactor;
      const alphaRot = 1 - Math.exp(-dt / rotTimeConstantMs);
      const delta = ((chosenBearing - prevBearing + 540) % 360) - 180;
      prevBearing += delta * alphaRot;

      const smoothedCoords = [targetLon, targetLat];

      // Check for accident at current position
      if (!isInAccident && !accidentTriggered && accidents.length > 0) {
        for (const accident of accidents) {
          const distance = turf.distance(
            turf.point([targetLon, targetLat]),
            turf.point(accident.coordinates),
            { units: "meters" }
          );

          // If within 10 meters of accident point, trigger accident
          if (distance <= 10) {
            isInAccident = true;
            accidentTriggered = true; // Prevent multiple triggers
            currentAccident = accident;
            accidentStartTime = now;
            // Store the exact position where accident occurred
            accidentPosition = { lon: targetLon, lat: targetLat };
            if (onAccidentStart)
              onAccidentStart(id, accident, accidentStartTime);
            break;
          }
        }
      }

      // Determine phase for status message per requirements
      let phase = null;
      // 1) First point of route (near start of distance)
      if (distanceAlong <= 1.0 && !startedSent) {
        phase = "start";
        startedSent = true;
      }
      // 2) Speed equals zero (emit once until moving again)
      if (!phase) {
        if (currentSpeed <= 0) {
          if (!stopSent) {
            phase = "stop";
            stopSent = true;
          }
        } else {
          stopSent = false;
        }
      }
      // 3) End of route (wrap to start)
      if (!phase && wrapped) {
        phase = "end";
        // Reset start flag to allow start message next lap
        startedSent = false;
      }
      // 4) Otherwise, moving state (for UX to clear stop message)
      if (!phase && currentSpeed > 0) {
        phase = "moving";
      }

      if (onMove) onMove(smoothedCoords, prevBearing, phase);
      modelScene.rotation.set(
        0,
        THREE.MathUtils.degToRad(prevBearing + modelHeadingOffsetDeg),
        0
      );

      const modelMatrix = this.map.transform.getMatrixForModel(
        smoothedCoords,
        0
      );
      const m = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix
      );
      const l = new THREE.Matrix4().fromArray(modelMatrix);
      this.camera.projectionMatrix = m.multiply(l);

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
