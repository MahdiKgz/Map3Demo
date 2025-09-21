import * as THREE from "three";

export function createThreeBuildingsLayer({
  id = "three-buildings-custom",
  centerLngLat,
  buildings,
}) {
  return {
    id,
    type: "custom",
    renderingMode: "3d",
    shaderCenter: centerLngLat,
    onAdd: function (map, gl) {
      this.map = map;
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;
      this.cameras = [];
      this.scenes = [];

      const vertexShader = `
        varying float vY;
        void main(){
          vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;
      const fragmentShader = `
        precision mediump float;
        varying float vY;
        uniform float uMaxY;
        void main(){
          float t = clamp(vY / max(uMaxY, 0.0001), 0.0, 1.0);
          vec3 bottom = vec3(0.173, 0.243, 0.314);
          vec3 top    = vec3(0.204, 0.596, 0.859);
          vec3 color = mix(bottom, top, t);
          gl_FragColor = vec4(color, 1.0);
        }
      `;

      const list = buildings || [];
      list.forEach((b) => {
        const scene = new THREE.Scene();
        const camera = new THREE.Camera();
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: { uMaxY: { value: b.height } },
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(b.size, b.height, b.size);
        mesh.position.set(0, b.height / 2, 0);
        scene.add(mesh);
        this.scenes.push({ scene, lngLat: [b.lng, b.lat] });
        this.cameras.push(camera);
      });
    },
    render: function (gl, args) {
      if (!this.scenes || !this.scenes.length) return;
      const mainMatrix = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix
      );
      this.scenes.forEach((entry, idx) => {
        const modelMatrix = this.map.transform.getMatrixForModel(
          entry.lngLat,
          0
        );
        const l = new THREE.Matrix4().fromArray(modelMatrix);
        const cam = this.cameras[idx];
        cam.projectionMatrix = mainMatrix.clone().multiply(l);
        this.renderer.resetState();
        this.renderer.render(entry.scene, cam);
      });
      this.map.triggerRepaint();
    },
  };
}

