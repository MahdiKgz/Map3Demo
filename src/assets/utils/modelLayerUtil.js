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
  headingOffsetDeg,
  accidents = [],
  onAccidentStart,
  onAccidentEnd,
}) {
  let currentRoute = route;
  let progress = 0;
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
  let smoothedProgress = 0;
  let targetProgress = 0;
  let velocity = 0;
  let acceleration = 0;
  let modelHeadingOffsetDeg =
    typeof headingOffsetDeg === "number" ? headingOffsetDeg : 0;
  let headingResolved = typeof headingOffsetDeg === "number";
  let currentAccident = null;
  let accidentStartTime = 0;
  let isInAccident = false;
  let accidentPosition = null;
  let accidentTriggered = false;

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
    let d = Math.max(0, Math.min(distanceMeters, totalDistanceMeters));
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
    const b = currentRoute[Math.min(i + 1, currentRoute.length - 1)];
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
        this.scene.add(modelScene);
      });
      this.map = map;
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;
      computeRouteDistances(currentRoute);
    },
    render(gl, args) {
      if (!modelScene) return;
      if (typeof getRoute === "function") {
        const latestRoute = getRoute();
        if (latestRoute && routesDiffer(latestRoute, currentRoute)) {
          currentRoute = latestRoute;
          progress = Math.min(Math.max(progress, 0), 1);
          smoothedProgress = progress;
          targetProgress = progress;
          prevLon = currentRoute[0][0];
          prevLat = currentRoute[0][1];
          computeRouteDistances(currentRoute);
          startedSent = false;
        }
      }
      const now = Date.now();
      const dt = lastTs ? now - lastTs : 16.67;
      lastTs = now;
      if (isInAccident && currentAccident) {
        const accidentElapsed = now - accidentStartTime;
        if (accidentElapsed >= currentAccident.duration) {
          isInAccident = false;
          currentAccident = null;
          if (onAccidentEnd) onAccidentEnd(id);
        } else {
          const smoothedCoords = accidentPosition
            ? [accidentPosition.lon, accidentPosition.lat]
            : [prevLon, prevLat];
          if (onMove) onMove(smoothedCoords, prevBearing, "accident");
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
          this.renderer.resetState();
          const renderInterval = 1000 / 60;
          const timeSinceLastRender = now - lastRenderTs;
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
      targetProgress += currentSpeed * frameScale;
      let wrapped = false;
      if (targetProgress > 1) {
        targetProgress = targetProgress % 1;
        smoothedProgress = targetProgress;
        velocity = 0;
        acceleration = 0;
        wrapped = true;
        accidentTriggered = false;
      }

      const progressDiff = targetProgress - smoothedProgress;
      const maxAcceleration = 0.008;
      const maxVelocity = currentSpeed * 1.5;
      if (Math.abs(progressDiff) > 0.0005) {
        const smoothFactor = 0.05;
        acceleration =
          Math.sign(progressDiff) *
          Math.min(maxAcceleration, Math.abs(progressDiff) * smoothFactor);
        velocity = Math.max(
          -maxVelocity,
          Math.min(maxVelocity, velocity + acceleration * frameScale)
        );
        smoothedProgress += velocity * frameScale;
      } else {
        velocity *= 0.95;
        smoothedProgress = targetProgress;
      }
      progress = smoothedProgress;
      const distanceAlong =
        totalDistanceMeters * Math.min(Math.max(progress, 0), 1);
      const pos = positionAtDistance(distanceAlong);
      const targetLon = pos.lon;
      const targetLat = pos.lat;
      const aheadDist = Math.max(1.0, totalDistanceMeters * 0.002);
      let aheadDistance = distanceAlong + aheadDist;
      if (aheadDistance > totalDistanceMeters && totalDistanceMeters > 0) {
        aheadDistance = aheadDistance % totalDistanceMeters;
      }
      const aheadPos = positionAtDistance(aheadDistance);
      let chosenBearing = turf.bearing(
        turf.point([targetLon, targetLat]),
        turf.point([aheadPos.lon, aheadPos.lat])
      );
      const baseRotTimeConstantMs = 200;
      const speedFactor = Math.min(Math.max(currentSpeed * 1000, 0.1), 2.0);
      const rotTimeConstantMs = baseRotTimeConstantMs / speedFactor;
      const alphaRot = 1 - Math.exp(-dt / rotTimeConstantMs);
      let delta = chosenBearing - prevBearing;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const dampingFactor = Math.max(0.8, 1 - Math.abs(velocity) * 0.05);
      prevBearing += delta * alphaRot * dampingFactor;
      const positionSmoothingFactor = 0.06;
      const smoothedLon =
        prevLon + (targetLon - prevLon) * positionSmoothingFactor;
      const smoothedLat =
        prevLat + (targetLat - prevLat) * positionSmoothingFactor;
      prevLon = smoothedLon;
      prevLat = smoothedLat;
      const smoothedCoords = [smoothedLon, smoothedLat];
      if (!isInAccident && !accidentTriggered && accidents.length > 0) {
        for (const accident of accidents) {
          const distance = turf.distance(
            turf.point([targetLon, targetLat]),
            turf.point(accident.coordinates),
            { units: "meters" }
          );
          if (distance <= 10) {
            isInAccident = true;
            accidentTriggered = true;
            currentAccident = accident;
            accidentStartTime = now;
            accidentPosition = { lon: targetLon, lat: targetLat };
            if (onAccidentStart)
              onAccidentStart(id, accident, accidentStartTime);
            break;
          }
        }
      }
      let phase = null;
      if (distanceAlong <= 1.0 && !startedSent) {
        phase = "start";
        startedSent = true;
      }
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
      if (!phase && wrapped) {
        phase = "end";
        startedSent = false;
      }
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
      this.renderer.resetState();
      const renderInterval = 1000 / 60;
      const timeSinceLastRender = now - lastRenderTs;
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
