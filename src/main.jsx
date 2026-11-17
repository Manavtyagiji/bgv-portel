import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Login from "./pages/Login";
import AddressVerifyCandidate from "./pages/AddressVerifyCandidate";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

/* ── Synchronous auth check ──────────────────────────────────────────────────
   Runs BEFORE <App /> renders, so there is zero flash of protected content.
   Rules (must satisfy ALL):
     1. sessionStorage.currentUser exists and parses as an object with .email
     2. A JWT-shaped token (starts with "eyJ") exists in one of the token keys
   No network call — this is a cheap sessionStorage read that takes <1ms.
   Session lives in sessionStorage (not localStorage) so closing the tab logs
   the user out automatically — the browser clears sessionStorage itself when
   a tab closes, unlike a refresh (F5), which keeps it. A new tab, or the
   browser reopened later, starts with no session and needs a fresh login.
────────────────────────────────────────────────────────────────────────────── */
function isAuthenticated() {
  try {
    const saved = sessionStorage.getItem("currentUser");
    if (!saved) return false;
    const user = JSON.parse(saved);
    if (!user || typeof user !== "object" || !user.email) return false;
    const tok = (
      user.token ||
      sessionStorage.getItem("token") ||
      sessionStorage.getItem("authToken") ||
      sessionStorage.getItem("jwt") ||
      ""
    ).trim();
    return tok.startsWith("eyJ"); // all JWTs are base64-encoded JSON starting with "eyJ"
  } catch {
    return false;
  }
}

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return children;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public — no auth. The Digital Address Verification candidate form,
          reached via a link an admin sends; the candidate has no portal
          account at all, so this must sit outside ProtectedRoute. */}
      <Route path="/address-verify-form" element={<AddressVerifyCandidate />} />
      <Route path="/" element={<ProtectedRoute><App /></ProtectedRoute>} />
      {/* Catch-all: any unknown path goes to login if not authenticated */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </BrowserRouter>
);