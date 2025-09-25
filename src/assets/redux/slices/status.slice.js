import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  lat: null,
  lng: null,
  zoom: null,
  scale: null,
};

const statusSlice = createSlice({
  name: "status",
  initialState,
  reducers: {
    updateStatus: (state, action) => {
      const { lat, lng, zoom, scale } = action.payload;
      if (lat !== undefined) state.lat = lat;
      if (lng !== undefined) state.lng = lng;
      if (zoom !== undefined) state.zoom = zoom;
      if (scale !== undefined) state.scale = scale;
    },
  },
});

export const { updateStatus } = statusSlice.actions;
export default statusSlice.reducer;
