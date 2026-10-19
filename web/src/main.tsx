import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@datarelay-labs/foundation/styles.css";
import "@datarelay-labs/foundation-f31/styles.css";
import "@datarelay-labs/control-clone/styles.css";
import "./styles.css";
import { App } from "./app";
createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
