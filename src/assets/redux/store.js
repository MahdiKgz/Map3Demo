import { configureStore } from "@reduxjs/toolkit";
import ModelsReducer from "./slices/models.slice";
import StatusReducer from "./slices/status.slice";
import ChaseReducer from "./slices/chase.slice";

export const store = configureStore({
  reducer: {
    models: ModelsReducer,
    status: StatusReducer,
    chase: ChaseReducer,
  },
});
