import { configureStore } from "@reduxjs/toolkit";
import ModelsReducer from "./slices/models.slice";

export const store = configureStore({
  reducer: {
    models: ModelsReducer,
  },
});
