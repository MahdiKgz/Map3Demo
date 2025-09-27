import React from "react";
import Sidebar from "./assets/components/Sidebar";
import Header from "./assets/components/Header";
import Map from "./assets/components/Map";
import Status from "./assets/components/PointerStatus/Status";
import ChaseStatus from "./assets/components/PointerStatus/ChaseStatus";
import Alert from "./assets/components/BreakAlert/Alert";

function App() {
  return (
    <>
      <Header />
      <Sidebar />
      <Map />
      <Status />
      <ChaseStatus />
      <Alert />
    </>
  );
}

export default App;
