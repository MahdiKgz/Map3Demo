// TLE (Two-Line Element) for ISS example
export const TLE = {
  line1:
    "1 25544U 98067A   24257.12345678  .00001264  00000-0  29621-4 0  9991",
  line2:
    "2 25544  51.6442  21.8765 0007291  32.5541  84.1247 15.48987654321689",
};

import * as satellite from "satellite.js";
export const satrec = satellite.twoline2satrec(TLE.line1, TLE.line2);
