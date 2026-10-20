import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { IngestProvider } from "./ingest";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <IngestProvider>
        <App />
      </IngestProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
