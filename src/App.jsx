import React from "react";
import Sidebar from "./assets/components/Sidebar";
import Header from "./assets/components/Header";
import Map from "./assets/components/Map";
import Status from "./assets/components/PointerStatus/Status";

function App() {
  return (
    <>
      <Header />
      <Sidebar />
      <Map />
      <Status />
    </>
  );
}

export default App;
