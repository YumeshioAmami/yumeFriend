import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PetWindow from "./PetWindow";
import "./styles.css";

const pet = new URLSearchParams(window.location.search).get("pet") === "1";
document.documentElement.dataset.pet = pet ? "1" : "0";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {pet ? <PetWindow /> : <App />}
  </StrictMode>,
);
