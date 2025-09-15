import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import * as turf from "@turf/turf";

export function createModelLayer({ id, url, route, speed, color }) {
  const line = turf.lineString(route);
  const lineDistance = turf.length(line, { units: "kilometers" });
  let progress = 0;
  let modelScene = null;

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
        modelScene.scale.set(0.005, 0.005, 0.005);
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
      progress += speed;
      if (progress > 1) progress = 0;
      const along = turf.along(line, lineDistance * progress, {
        units: "kilometers",
      });
      const coords = along.geometry.coordinates;
      const nextPoint = turf.along(line, lineDistance * (progress + 0.001), {
        units: "kilometers",
      });
      const bearing = turf.bearing(turf.point(coords), nextPoint);
      modelScene.rotation.set(0, THREE.MathUtils.degToRad(bearing), 0);
      const modelMatrix = this.map.transform.getMatrixForModel(coords, 0);
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
