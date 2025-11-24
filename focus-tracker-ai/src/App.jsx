// src/App.jsx
import React, { useState, useEffect, useRef } from "react";
import FaceMesh3D from "./components/FaceMesh3D.jsx";
import "./css/App.css";
//import HomePage from "./HomePage.jsx";

/* ---------- Small helper: parse duration string ---------- */
/**
 * Accepts:
 *  - "90"      -> 90 minutes
 *  - "1:30"    -> 90 minutes (h:mm)
 *  - "2:05"    -> 125 minutes
 * Anything invalid -> 0
 */
function parseDurationToMinutes(value) {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  // Pure number -> minutes
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // h:mm format
  const match = /^(\d+):(\d{1,2})$/.exec(trimmed);
  if (match) {
    const hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    if (mins >= 0 && mins < 60) {
      return hours * 60 + mins;
    }
  }

  // Fallback: invalid
  return 0;
}

/* ---------- Small page components ---------- */

function LoginPage({ onLogin }) {
  const [name, setName] = useState("");
  const [clicked, setClicked] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setClicked(true);
    const trimmed = name.trim();
    if (!trimmed) return;
    onLogin(trimmed);
  };

  return (

    <>
    {clicked ? (
        <HomePage/>
      ) : (
    <div className="app-root">
      <div className="session-card auth-card">
        <h1 className="session-title">Welcome to Focus Tracker AI</h1>
        <p className="session-description">
          Log in with a name or nickname to start tracking your study sessions.
          (No real authentication yet, this is just for the demo.)
        </p>

        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              className="text-input"
              type="text"
              placeholder="e.g. Firas"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary">
            Log in
          </button>
        </form>
      </div>
    </div>)}
    </>
  );
}

function HomePage({ userName, onStartSessionClick, onProfileClick }) {
  return (
    <div className="app-root">
      <div className="session-card">
        <h1 className="session-title">Hi {userName}, ready to focus?</h1>
        <p className="session-description">
          Choose what you want to do. You can start a new focus session or
          review your past sessions.
        </p>

        <div className="home-actions">
          <button className="btn btn-primary" onClick={onStartSessionClick}>
            Start new session
          </button>
          <button className="btn btn-secondary" onClick={onProfileClick}>
            View profile &amp; history
          </button>
        </div>
      </div>
    </div>
  );
}

function PreSessionForm({ onBack, onStart }) {
  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");
  const [durationInput, setDurationInput] = useState("60"); // string input
  const [wantsBackgroundAudio, setWantsBackgroundAudio] = useState(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    const minutes = parseDurationToMinutes(durationInput);
    onStart({
      subject: subject.trim() || "Untitled session",
      goal: goal.trim() || "No specific goal",
      durationMinutes: minutes,
      wantsBackgroundAudio,
    });
  };

  return (
    <div className="app-root">
      <div className="session-card">
        <h1 className="session-title">Session setup</h1>
        <p className="session-description">
          Before we start, answer a few quick questions about this study
          session.
        </p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="subject">What are you studying today?</label>
            <input
              id="subject"
              className="text-input"
              type="text"
              placeholder="e.g. ELEC 275 midterm, PDA theory..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="goal">What is your goal for this session?</label>
            <textarea
              id="goal"
              className="text-input textarea"
              placeholder="e.g. Finish 3 problem sets, summarize 2 chapters..."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="duration">
                How long do you plan to study?<br />
                <span className="muted-text">(Minutes or h:mm)</span>
              </label>
              <input
                id="duration"
                className="text-input"
                type="text"
                value={durationInput}
                onChange={(e) => setDurationInput(e.target.value)}
                placeholder="e.g. 90 or 1:30"
              />
            </div>

            <div className="form-field">
              <label>Background audio during session?</label>
              <div className="toggle-row">
                <button
                  type="button"
                  className={
                    "chip " + (wantsBackgroundAudio ? "chip-active" : "")
                  }
                  onClick={() => setWantsBackgroundAudio(true)}
                >
                  Yes, play rain / white noise
                </button>
                <button
                  type="button"
                  className={
                    "chip " + (!wantsBackgroundAudio ? "chip-active" : "")
                  }
                  onClick={() => setWantsBackgroundAudio(false)}
                >
                  No background audio
                </button>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onBack}
            >
              Back
            </button>
            <button type="submit" className="btn btn-primary">
              Start focus session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfilePage({ userName, sessions, onBack }) {
  return (
    <div className="app-root">
      <div className="session-card">
        <h1 className="session-title">{userName}&apos;s sessions</h1>
        <p className="session-description">
          Here you&apos;ll see your past study sessions, goals, and planned
          durations. Right now, sessions are stored only in memory.
        </p>

        {sessions.length === 0 ? (
          <p className="muted-text">No sessions recorded yet.</p>
        ) : (
          <ul className="profile-list">
            {sessions.map((s, idx) => {
              const actualMin =
                typeof s.actualMinutes === "number" ? s.actualMinutes : null;
              return (
                <li key={idx} className="profile-item">
                  <div className="profile-main">
                    <div className="profile-title">{s.subject}</div>
                    <div className="profile-meta">
                      {actualMin != null
                        ? `Studied ~${actualMin} min`
                        : "Duration not recorded"}
                      {" · "}
                      Planned {s.durationMinutes} min
                      {" · "}
                      {new Date(s.startedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="profile-goal">{s.goal}</div>
                </li>
              );
            })}
          </ul>
        )}

        <button className="btn btn-secondary" onClick={onBack}>
          Back to home
        </button>
      </div>
    </div>
  );
}

/* ---------- SESSION PAGE (FaceMesh3D wrapper) ---------- */

function SessionPage({
  config,
  onEndSession,
  soundMuted,
  onToggleMute,
  userName,
}) {
  const rainAudioRef = useRef(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Timer: track elapsed time since startedAt
  useEffect(() => {
    if (!config?.startedAt) return;

    const startMs = new Date(config.startedAt).getTime();

    const update = () => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((now - startMs) / 1000));
      setElapsedSeconds(diffSec);
    };

    update(); // initial
    const id = setInterval(update, 1000);

    return () => clearInterval(id);
  }, [config]);

  // Helper to format seconds -> H:MM:SS or MM:SS
  const formatTime = (totalSec) => {
    const sec = Math.max(0, totalSec | 0);
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;

    const pad = (n) => (n < 10 ? "0" + n : "" + n);
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${minutes}:${pad(seconds)}`;
  };

  // Create / start / stop rain audio
  useEffect(() => {
    // Always lazy-create the audio object
    if (!rainAudioRef.current) {
      const audio = new Audio("/rain.mp3");
      audio.loop = true;
      audio.volume = 0.35;
      rainAudioRef.current = audio;
    }

    const audio = rainAudioRef.current;

    if (soundMuted) {
      audio.pause();
    } else {
      audio.play().catch(() => { });
    }

    return () => {
      if (rainAudioRef.current && soundMuted) {
        rainAudioRef.current.pause();
      }
    };
  }, [soundMuted]);


  // Full cleanup when SessionPage unmounts
  useEffect(() => {
    return () => {
      if (rainAudioRef.current) {
        rainAudioRef.current.pause();
        rainAudioRef.current = null;
      }
    };
  }, []);

  if (!config) return null;

  return (
    <div className="app-root">
      <div className="session-running">
        <div className="session-running-header">
          <div className="session-running-text">
            <strong>{userName}</strong> • Studying{" "}
            <strong>{config.subject}</strong> • Planned{" "}
            {config.durationMinutes} min
          </div>

          <div className="session-header-controls">
            {/* This toggle mutes/unmutes rain */}
            <button
              className="btn btn-secondary small"
              type="button"
              onClick={onToggleMute}
            >
              {soundMuted ? "Unmute background" : "Mute background"}
            </button>

            <button
              className="btn btn-outline-danger small"
              type="button"
              onClick={onEndSession}
            >
              End Session
            </button>
          </div>
        </div>

        <div className="session-layout">
          <aside className="session-sidebar">
            <h2>Session details</h2>
            <p>
              <strong>Subject:</strong> {config.subject}
            </p>
            <p>
              <strong>Goal:</strong>
              <br />
              <span className="goal-text">{config.goal}</span>
            </p>
            <p>
              <strong>Planned duration:</strong> {config.durationMinutes} min
            </p>

            <p>
              <strong>Timer:</strong> {formatTime(elapsedSeconds)}
            </p>

            <p>
              <strong>Background audio preference:</strong>{" "}
              {config.wantsBackgroundAudio ? "Yes (rain)" : "No"}
            </p>
            <p>
              <strong>Background sound state:</strong>{" "}
              {soundMuted ? "Muted" : "On"}
            </p>
          </aside>

          <main className="session-main">
            <FaceMesh3D />
          </main>
        </div>
      </div>
    </div>
  );
}

/* ---------- ROOT APP ---------- */

export default function App() {
  const [view, setView] = useState("login"); // 'login' | 'home' | 'pre' | 'session' | 'profile'
  const [userName, setUserName] = useState("");
  const [currentConfig, setCurrentConfig] = useState(null);
  const [pastSessions, setPastSessions] = useState([]);
  const [backgroundMuted, setBackgroundMuted] = useState(false);

  const handleLogin = (name) => {
    setUserName(name);
    setView("home");
  };

  const handlePreSessionStart = (config) => {
    const sessionConfig = {
      ...config,
      startedAt: new Date().toISOString(),
    };
    setCurrentConfig(sessionConfig);

    // If user said no background audio → start muted
    setBackgroundMuted(!config.wantsBackgroundAudio);

    setView("session");
  };


  const handleEndSession = () => {
    if (currentConfig) {
      const startMs = new Date(currentConfig.startedAt).getTime();
      const endMs = Date.now();
      const actualMinutes = Math.max(
        0,
        Math.round((endMs - startMs) / 60000)
      );

      const completedSession = {
        ...currentConfig,
        endedAt: new Date(endMs).toISOString(),
        actualMinutes,
      };

      setPastSessions((prev) => [...prev, completedSession]);
      setCurrentConfig(null);
    }
    setView("home");
  };

  if (view === "login") {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (view === "home") {
    return (
      <HomePage
        userName={userName}
        onStartSessionClick={() => setView("pre")}
        onProfileClick={() => setView("profile")}
      />
    );
  }

  if (view === "pre") {
    return (
      <PreSessionForm
        onBack={() => setView("home")}
        onStart={handlePreSessionStart}
      />
    );
  }

  if (view === "profile") {
    return (
      <ProfilePage
        userName={userName}
        sessions={pastSessions}
        onBack={() => setView("home")}
      />
    );
  }

  if (view === "session") {
    return (
      <SessionPage
        config={currentConfig}
        userName={userName}
        soundMuted={backgroundMuted}
        onToggleMute={() => setBackgroundMuted((v) => !v)}
        onEndSession={handleEndSession}
      />
    );
  }

  // fallback (shouldn't happen)
  return null;
}
