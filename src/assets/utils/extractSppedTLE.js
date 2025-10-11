import * as satellite from "satellite.js";

export function getSpeedFromTLE(line1, line2) {
  try {
    const satrec = satellite.twoline2satrec(line1, line2);
    const now = new Date();
    const positionAndVelocity = satellite.propagate(satrec, now);
    const gmst = satellite.gstime(now);
    const velocityEcf = satellite.eciToEcf(positionAndVelocity.velocity, gmst);

    const magnitude = Math.sqrt(
      velocityEcf.x ** 2 + velocityEcf.y ** 2 + velocityEcf.z ** 2
    );

    return magnitude * 1000;
  } catch (err) {
    console.warn("error while calculating speed ... , ", err);
    return 0;
  }
}
