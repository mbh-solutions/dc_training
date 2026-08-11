import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.ready.then((registration) => {
    const update = () => {
      if (document.visibilityState === "visible") void registration.update();
    };

    update();
    document.addEventListener("visibilitychange", update);
  });
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
