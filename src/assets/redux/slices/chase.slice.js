import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  activeModelId: null,
  lat: null,
  lng: null,
  message: null,
};

const chaseSlice = createSlice({
  name: "chase",
  initialState,
  reducers: {
    setChasedModelId: (state, action) => {
      state.activeModelId = action.payload;
      if (action.payload == null) {
        state.lat = null;
        state.lng = null;
        state.message = null;
      }
    },
    updateChaseStatus: (state, action) => {
      const { lat, lng, message } = action.payload || {};
      if (lat !== undefined) state.lat = lat;
      if (lng !== undefined) state.lng = lng;
      if (message !== undefined) state.message = message;
    },
    clearChaseStatus: (state) => {
      state.message = null;
    },
  },
});

export const { setChasedModelId, updateChaseStatus, clearChaseStatus } =
  chaseSlice.actions;
export default chaseSlice.reducer;
