// frontend/src/App.jsx
// Hash-based router (no server rewrite rules needed for a static SPA host):
// "#admin" → password-gated admin dashboard, anything else → public dashboard.

import { useState, useEffect } from "react";
import PublicApp from "./PublicApp.jsx";
import AdminApp from "./AdminApp.jsx";

export default function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return hash === "#admin" ? <AdminApp /> : <PublicApp />;
}
