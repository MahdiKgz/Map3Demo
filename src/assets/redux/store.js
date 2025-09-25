import { configureStore } from "@reduxjs/toolkit";
import ModelsReducer from "./slices/models.slice";
import StatusReducer from "./slices/status.slice";

export const store = configureStore({
  reducer: {
    models: ModelsReducer,
    status: StatusReducer,
  },
});
