// src/App.jsx
import React, { useState } from "react";
import FaceMesh3D from "./components/FaceMesh3D.jsx";
import "./App.css";

export default function App() {
  const [sessionStarted, setSessionStarted] = useState(false);

  return (
    <div className="app-root">
      {!sessionStarted ? (
        // Landing / pre-session UI
        <div className="session-card">
          <h1 className="session-title">Focus Tracking Session</h1>

          <p className="session-description">
            When you start a session, your webcam will be used to detect your
            face, head orientation, and gaze to estimate your focus level in
            real time.
          </p>

          <ul className="session-list">
            <li>Make sure your face is clearly visible to the camera.</li>
            <li>Stay roughly centered in front of the screen.</li>
            <li>You’ll hear an alert when you’re not focused or off-screen.</li>
          </ul>

          <button
            className="btn btn-primary"
            onClick={() => setSessionStarted(true)}
          >
            Start Session <span aria-hidden="true">▶</span>
          </button>
        </div>
      ) : (
        // Once started, show FaceMesh3D
        <div className="session-running">
          <div className="session-running-header">
            <span className="session-running-text">
              Session running – focus tracker active
            </span>
            <button
              className="btn btn-outline-danger"
              onClick={() => setSessionStarted(false)}
            >
              End Session
            </button>
          </div>

          <FaceMesh3D />
        </div>
      )}
    </div>
  );
}
