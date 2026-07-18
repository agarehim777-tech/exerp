import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Login from "./auth/Login.jsx";
import Consent from "./auth/Consent.jsx";
import "./styles.css";

const path = window.location.pathname;
let Root = App;
if (path === "/login") Root = Login;
else if (path === "/.lovable/oauth/consent") Root = Consent;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
