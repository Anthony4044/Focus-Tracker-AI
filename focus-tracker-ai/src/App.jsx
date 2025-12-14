// src/App.jsx
import React, { useState, useEffect, useRef } from "react";
import FaceMesh3D from "./components/FaceMesh3D.jsx";
import "./css/App.css";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import MovingBackground from "./components/MovingBackground.jsx";

/* ---------- Small helper: parse duration string ---------- */
function parseDurationToMinutes(value) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const match = /^(\d+):(\d{1,2})$/.exec(trimmed);
  if (match) {
    const hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    if (mins >= 0 && mins < 60) return hours * 60 + mins;
  }
  return 0;
}

/* ---------- Small page components ---------- */

function LoginPage({ onLogin }) {
  const [name, setName] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onLogin(trimmed);
  };

  return (
    <div className="app-root">
  <MovingBackground />
      <div className="session-card auth-card">
        <h1 className="session-title">Welcome to Focus Tracker AI</h1>
        <p className="session-description">
          Log in with a name or nickname to start tracking your study sessions.
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
    </div>
  );
}

function HomePage({ userName, onStartSessionClick, onProfileClick, onSurveyResultsClick }) {
  return (
    <div className="app-root">
  <MovingBackground />
      <div className="session-card">
        <h1 className="session-title">Hi {userName}, ready to focus?</h1>
        <p className="session-description">
          Choose what you want to do. You can start a new focus session, review past sessions, or see survey results.
        </p>

        <div className="home-actions">
          <button className="btn btn-primary" onClick={onStartSessionClick}>
            Start new session
          </button>
          <button className="btn btn-secondary" onClick={onProfileClick}>
            View profile &amp; history
          </button>
          <button className="btn btn-secondary" onClick={onSurveyResultsClick}>
            Survey results
          </button>
        </div>
      </div>
    </div>
  );
}

function PreSessionForm({ onBack, onStart }) {
  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");
  const [durationInput, setDurationInput] = useState("60");
  const [wantsBackgroundAudio, setWantsBackgroundAudio] = useState(true);
  const [wantsAlerts, setWantsAlerts] = useState(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    const minutes = parseDurationToMinutes(durationInput);
    onStart({
      subject: subject.trim() || "Untitled session",
      goal: goal.trim() || "No specific goal",
      durationMinutes: minutes,
      wantsBackgroundAudio,
      wantsAlerts,
    });
  };

  return (
    <div className="app-root">
  <MovingBackground />
      <div className="session-card">
        <h1 className="session-title">Session setup</h1>
        <p className="session-description">
          Before we start, answer a few quick questions about this study session.
        </p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="subject">What are you studying today?</label>
            <input
              id="subject"
              className="text-input"
              type="text"
              placeholder="e.g. ELEC 275 midterm"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="goal">What is your goal for this session?</label>
            <textarea
              id="goal"
              className="text-input textarea"
              placeholder="e.g. Finish 3 problem sets"
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
                  className={"chip " + (wantsBackgroundAudio ? "chip-active" : "")}
                  onClick={() => setWantsBackgroundAudio(true)}
                >
                  Yes, play rain / white noise
                </button>
                <button
                  type="button"
                  className={"chip " + (!wantsBackgroundAudio ? "chip-active" : "")}
                  onClick={() => setWantsBackgroundAudio(false)}
                >
                  No background audio
                </button>
              </div>
            </div>

            <div className="form-field">
              <label>Alert beeps when distracted?</label>
              <div className="toggle-row">
                <button
                  type="button"
                  className={"chip " + (wantsAlerts ? "chip-active" : "")}
                  onClick={() => setWantsAlerts(true)}
                >
                  Enable alerts
                </button>
                <button
                  type="button"
                  className={"chip " + (!wantsAlerts ? "chip-active" : "")}
                  onClick={() => setWantsAlerts(false)}
                >
                  Disable alerts
                </button>
              </div>
              <p className="muted-text" style={{ margin: 0 }}>When off, the system will not play the alert beep.</p>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onBack}>
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

function GazeCalibrationPage({ config, onCancel, onComplete }) {
  const [loading, setLoading] = useState(true);
  const [lastGaze, setLastGaze] = useState(null);
  const [points, setPoints] = useState([]);
  const [step, setStep] = useState(0);
  const [showGazeMarker, setShowGazeMarker] = useState(true);

  const steps = [
    { label: "Top-left", x: "12%", y: "12%" },
    { label: "Top-right", x: "88%", y: "12%" },
    { label: "Bottom-right", x: "88%", y: "88%" },
    { label: "Bottom-left", x: "12%", y: "88%" },
  ];

  useEffect(() => {
    let cancelled = false;
    const loadScript = () =>
      new Promise((resolve, reject) => {
        if (typeof window !== "undefined" && window.webgazer)
          return resolve(window.webgazer);
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/webgazer/dist/webgazer.min.js";
        s.async = true;
        s.crossOrigin = "anonymous";
        s.onload = () => resolve(window.webgazer);
        s.onerror = reject;
        document.head.appendChild(s);
      });

    loadScript()
      .then((wg) => {
        if (cancelled || !wg) return;
        setLoading(false);
        try {
          wg.showPredictionPoints && wg.showPredictionPoints(true);
          wg.showVideoPreview && wg.showVideoPreview(false);
          wg.showFaceOverlay && wg.showFaceOverlay(false);
          wg.showFaceFeedbackBox && wg.showFaceFeedbackBox(false);
          wg.setRegression && wg.setRegression("ridge");
        } catch (_) {}
        wg.setGazeListener((data) => {
          if (!data || typeof data.x !== "number" || typeof data.y !== "number")
            return;
          setLastGaze({ x: data.x, y: data.y });
        }).begin();
      })
      .catch(() => setLoading(false));

    return () => {
      cancelled = true;
      try {
        const wg = window.webgazer;
        if (wg) {
          wg.clearGazeListener && wg.clearGazeListener();
          wg.removeMouseEventListeners && wg.removeMouseEventListeners();
          wg.showPredictionPoints && wg.showPredictionPoints(false);
        }
      } catch (_) {}
    };
  }, []);

  const capturePoint = () => {
    if (!lastGaze) return;
    const next = [...points, lastGaze];
    setPoints(next);
    if (next.length >= steps.length) {
      const xs = next.map((p) => p.x);
      const ys = next.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);
      // Use a generous margin so "outside" truly means well beyond the calibrated window
      const margin = Math.max(120, Math.round(0.2 * Math.min(width, height)));
      onComplete({
        minX,
        maxX,
        minY,
        maxY,
        margin,
      });
    } else {
      setStep(next.length);
    }
  };

  const reset = () => {
    setPoints([]);
    setStep(0);
  };

  const current = steps[step];

  return (
    <div className="calibration-screen">
      <div className="calibration-card">
        <h1 className="session-title">Gaze calibration</h1>
        <p className="session-description">
          Look at each highlighted corner dot and click &quot;Capture corner&quot; to calibrate your gaze limits.
          This runs before the session timer starts.
        </p>

        <div className="calibration-stage">
          {steps.map((s, i) => (
            <div
              key={i}
              className="calibration-dot"
              style={{
                left: s.x,
                top: s.y,
                background: i === step ? "#22d3ee" : "#334155",
                boxShadow: i === step ? "0 0 0 14px rgba(34, 211, 238, 0.25)" : "none",
              }}
            />
          ))}
          {lastGaze && showGazeMarker && (
            <div
              className="calibration-gaze-dot"
              style={{
                left: `${(lastGaze.x / (window.innerWidth || 1)) * 100}%`,
                top: `${(lastGaze.y / (window.innerHeight || 1)) * 100}%`,
              }}
            />
          )}
        </div>

        <div className="form-grid">
          <div className="form-field">
            <label className="range-label">
              <span>Current corner</span>
              <span className="range-value">{current?.label}</span>
            </label>
            <p className="muted-text" style={{ margin: 0 }}>
              Keep your gaze steady on the highlighted dot, then click capture. Captured: {points.length}/{steps.length}.
            </p>
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button className="btn btn-secondary" type="button" onClick={() => setShowGazeMarker((v) => !v)}>
                {showGazeMarker ? "Hide" : "Show"} gaze dot
              </button>
              <button className="btn btn-secondary" type="button" onClick={reset}>
                Reset
              </button>
              <button className="btn btn-primary" type="button" onClick={capturePoint} disabled={!lastGaze || loading}>
                {step >= steps.length - 1 ? "Finish calibration" : "Capture corner"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilePage({ userName, sessions, onBack }) {
  return (
    <div className="app-root">
  <MovingBackground />
      <div className="session-card">
        <h1 className="session-title">{userName}&apos;s sessions</h1>
        <p className="session-description">
          Past study sessions, goals, and planned durations.
        </p>

        {sessions.length === 0 ? (
          <p className="muted-text">No sessions recorded yet.</p>
        ) : (
          <ul className="profile-list">
            {sessions.map((s, idx) => (
              <li key={idx} className="profile-item">
                <div className="profile-main">
                  <div className="profile-title">{s.subject}</div>
                  <div className="profile-meta">
                    {s.actualMinutes != null
                      ? `Studied ~${s.actualMinutes} min`
                      : "Duration not recorded"}{" "}
                    · Planned {s.durationMinutes} min · {new Date(s.startedAt).toLocaleString()}
                  </div>
                  <div className="profile-meta">
                    Focus: {s.focusPercent != null ? `${s.focusPercent}%` : "Not recorded"} | Distractions:{" "}
                    {s.distractions != null ? s.distractions : "Not recorded"}
                  </div>
                  <div className="profile-meta">
                    Alert beep: {s.wantsAlerts === false ? "Disabled" : "Enabled"}
                  </div>
                </div>
                <div className="profile-goal">{s.goal}</div>
              </li>
            ))}
          </ul>
        )}

        <button className="btn btn-secondary" onClick={onBack}>
          Back to home
        </button>
      </div>
    </div>
  );
}

/* ---------- SESSION PAGE ---------- */

function SessionPage({ config, onEndSession, soundMuted, onToggleMute, userName, onMetricsUpdate, metrics, showGazeDot, onToggleGazeDot }) {
  const rainAudioRef = useRef(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!config?.startedAt) return;
    const startMs = new Date(config.startedAt).getTime();
    const update = () => setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [config]);

  const formatTime = (sec) => {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    const pad = (n) => (n < 10 ? "0" + n : n);
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  };

  useEffect(() => {
    if (!rainAudioRef.current) {
      const audio = new Audio("/rain.mp3");
      audio.loop = true;
      audio.volume = 0.35;
      rainAudioRef.current = audio;
    }
    const audio = rainAudioRef.current;
    if (soundMuted) audio.pause(); else audio.play().catch(() => {});
    return () => { if (rainAudioRef.current) rainAudioRef.current.pause(); };
  }, [soundMuted]);

  if (!config) return null;

  return (
    <div className="app-root">
  <MovingBackground />
      <div className="session-running">
        <div className="session-running-header">
          <div className="session-running-text">
            <strong>{userName}</strong> • Studying <strong>{config.subject}</strong> • Planned {config.durationMinutes} min
          </div>
          <div className="session-header-controls">
            <button className="btn btn-secondary small" type="button" onClick={onToggleMute}>
              {soundMuted ? "Unmute background" : "Mute background"}
            </button>
            <button className="btn btn-secondary small" type="button" onClick={onToggleGazeDot}>
              {showGazeDot ? "Hide gaze dot" : "Show gaze dot"}
            </button>
            <button className="btn btn-outline-danger small" type="button" onClick={onEndSession}>
              End Session
            </button>
          </div>
        </div>

        <div className="session-layout">
          <aside className="session-sidebar">
            <p><strong>Subject:</strong> {config.subject}</p>
            <p><strong>Goal:</strong> {config.goal}</p>
            <p><strong>Planned duration:</strong> {config.durationMinutes} min</p>
            <p><strong>Timer:</strong> {formatTime(elapsedSeconds)}</p>
            <p><strong>Focus (live):</strong> {metrics?.focusPercent != null ? `${metrics.focusPercent}%` : "Collecting..."}</p>
            <p><strong>Distractions:</strong> {metrics?.distractions != null ? metrics.distractions : "Collecting..."}</p>
            <p><strong>Alert beeps:</strong> {config.wantsAlerts ? "On" : "Off"}</p>
            <p><strong>Background audio:</strong> {config.wantsBackgroundAudio ? "Yes" : "No"} ({soundMuted ? "Muted" : "On"})</p>
          </aside>
          <main className="session-main"><FaceMesh3D onStatsChange={onMetricsUpdate} alertEnabled={config.wantsAlerts} gazeBounds={config.gazeBounds} showGazeDot={showGazeDot} /></main>
        </div>
      </div>
    </div>
  );
}

/* ---------- SURVEY PAGE ---------- */

function SurveyPage({ lastSession, onSubmit }) {
  const [answers, setAnswers] = useState({
    focusLevel: "3",
    distractionFeel: "3",
    distractionSource: "",
    meshEffect: "neutral",
    meshLookFrequency: "rarely",
    easeOfUse: "4",
    unnecessaryFeatures: "",
    comfortLevel: "3",
    meshStress: "no",
    meshAccuracy: "somewhat",
    meshPreference: "keep",
  });

  const update = (k, v) => setAnswers(a => ({ ...a, [k]: v }));
  const sliderFill = (v) => {
    const n = Math.min(5, Math.max(1, Number(v) || 1));
    return `${((n - 1) / 4) * 100}%`;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ session: lastSession, ...answers });
  };

  return (
    <div className="app-root">
  <MovingBackground />
      <div className="session-card">
        <h1 className="session-title">Session Survey</h1>
        <form className="form-grid" onSubmit={handleSubmit}>
          {/* Survey fields (same as before) */}
          <label className="range-label">
            <span>Focus level (1-5)</span>
            <span className="range-value">{answers.focusLevel}</span>
          </label>
          <input
            type="range"
            min="1"
            max="5"
            className="survey-range"
            value={answers.focusLevel}
            onChange={e => update("focusLevel", e.target.value)}
            style={{ "--slider-fill": sliderFill(answers.focusLevel) }}
          />
          <label className="range-label">
            <span>Distraction level (1-5)</span>
            <span className="range-value">{answers.distractionFeel}</span>
          </label>
          <input
            type="range"
            min="1"
            max="5"
            className="survey-range"
            value={answers.distractionFeel}
            onChange={e => update("distractionFeel", e.target.value)}
            style={{ "--slider-fill": sliderFill(answers.distractionFeel) }}
          />
          <label>Distraction source</label>
          <textarea value={answers.distractionSource} onChange={e => update("distractionSource", e.target.value)} />
          <label>Face mesh effect</label>
          <select value={answers.meshEffect} onChange={e => update("meshEffect", e.target.value)}>
            <option value="more">More focused</option>
            <option value="less">Less focused</option>
            <option value="neutral">No difference</option>
          </select>
          <label>Looked at mesh</label>
          <select value={answers.meshLookFrequency} onChange={e => update("meshLookFrequency", e.target.value)}>
            <option value="rarely">Rarely</option>
            <option value="sometimes">Sometimes</option>
            <option value="often">Often</option>
          </select>
          <label className="range-label">
            <span>Ease of use (1-5)</span>
            <span className="range-value">{answers.easeOfUse}</span>
          </label>
          <input
            type="range"
            min="1"
            max="5"
            className="survey-range"
            value={answers.easeOfUse}
            onChange={e => update("easeOfUse", e.target.value)}
            style={{ "--slider-fill": sliderFill(answers.easeOfUse) }}
          />
          <label>Unnecessary features</label>
          <textarea value={answers.unnecessaryFeatures} onChange={e => update("unnecessaryFeatures", e.target.value)} />
          <label className="range-label">
            <span>Comfort level (1-5)</span>
            <span className="range-value">{answers.comfortLevel}</span>
          </label>
          <input
            type="range"
            min="1"
            max="5"
            className="survey-range"
            value={answers.comfortLevel}
            onChange={e => update("comfortLevel", e.target.value)}
            style={{ "--slider-fill": sliderFill(answers.comfortLevel) }}
          />
          <label>Mesh caused stress?</label>
          <select value={answers.meshStress} onChange={e => update("meshStress", e.target.value)}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
          <label>Mesh accuracy</label>
          <select value={answers.meshAccuracy} onChange={e => update("meshAccuracy", e.target.value)}>
            <option value="very">Very accurate</option>
            <option value="somewhat">Somewhat accurate</option>
            <option value="not">Not accurate</option>
          </select>
          <label>Preferred mesh version</label>
          <select value={answers.meshPreference} onChange={e => update("meshPreference", e.target.value)}>
            <option value="keep">Keep as is</option>
            <option value="smaller">Smaller</option>
            <option value="optional">Make optional</option>
            <option value="hidden">Hide entirely</option>
          </select>
          <button className="btn btn-primary" type="submit">Submit survey</button>
        </form>
      </div>
    </div>
  );
}

/* ---------- SURVEY RESULTS PAGE ---------- */

function SurveyResultsPage({ results, onBack }) {
  const exportToExcel = () => {
    if (results.length === 0) return;
    const data = results.map(r => ({
      "Subject": r.session.subject,
      "Session Time (min, SYSTEM)": r.session?.actualMinutes ?? "",
      "Focus % (SYSTEM)": r.session?.focusPercent ?? "",
      "Distractions (SYSTEM)": r.session?.distractions ?? "",
      "Alert Beep Enabled (SYSTEM)": r.session?.wantsAlerts === false ? "No" : "Yes",
      "Focus Level": r.focusLevel,
      "Distraction Level": r.distractionFeel,
      "Distraction Source": r.distractionSource,
      "Mesh Effect": r.meshEffect,
      "Looked at Mesh": r.meshLookFrequency,
      "Ease of Use": r.easeOfUse,
      "Unnecessary Features": r.unnecessaryFeatures,
      "Comfort Level": r.comfortLevel,
      "Mesh Stress": r.meshStress,
      "Mesh Accuracy": r.meshAccuracy,
      "Mesh Preference": r.meshPreference,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "SurveyResults");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, "survey_results.xlsx");
  };

   return (
    <div className="app-root">
  <MovingBackground />
      <div className="session-card">
        <h1 className="session-title">Survey Results</h1>
        <button className="btn btn-primary" onClick={exportToExcel} style={{marginBottom:"1rem"}}>Export to Excel</button>

        {results.length === 0 ? (
          <p>No survey responses yet.</p>
        ) : (
          <div className="survey-results-list">
            {results.map((r, i) => (
              <div key={i} className="survey-result-card">
                <h2>Session: {r.session.subject}</h2>

                <h3>Survey Responses</h3>
                <p><strong>Focus level:</strong> {r.focusLevel}</p>
                <p><strong>Distraction level:</strong> {r.distractionFeel}</p>
                {r.distractionSource && <p><strong>Distraction source:</strong> {r.distractionSource}</p>}
                <p><strong>Face mesh effect:</strong> {r.meshEffect}</p>
                <p><strong>Looked at mesh:</strong> {r.meshLookFrequency}</p>
                <p><strong>Ease of use:</strong> {r.easeOfUse}</p>
                {r.unnecessaryFeatures && <p><strong>Unnecessary features:</strong> {r.unnecessaryFeatures}</p>}
                <p><strong>Comfort level:</strong> {r.comfortLevel}</p>
                <p><strong>Mesh caused stress:</strong> {r.meshStress}</p>
                <p><strong>Mesh accuracy:</strong> {r.meshAccuracy}</p>
                <p><strong>Preferred mesh version:</strong> {r.meshPreference}</p>
                <hr/>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-secondary" onClick={onBack} style={{marginTop:"1rem"}}>Back</button>
      </div>
    </div>
  );
}

/* ---------- ROOT APP ---------- */

export default function App() {
  const [view, setView] = useState("login");
  const [userName, setUserName] = useState("");
  const [currentConfig, setCurrentConfig] = useState(null);
  const [pastSessions, setPastSessions] = useState([]);
  const [backgroundMuted, setBackgroundMuted] = useState(false);
  const [lastCompleted, setLastCompleted] = useState(null);
  const [surveyResults, setSurveyResults] = useState([]);
  const [sessionMetrics, setSessionMetrics] = useState({ focusPercent: null, distractions: null });
  const [pendingConfig, setPendingConfig] = useState(null);
  const [showGazeDot, setShowGazeDot] = useState(false);

  const handleLogin = (name) => { setUserName(name); setView("home"); };

  const handlePreSessionStart = (config) => {
    setSessionMetrics({ focusPercent: null, distractions: null });
    setPendingConfig(config);
    setBackgroundMuted(!config.wantsBackgroundAudio);
    setShowGazeDot(false);
    setView("calibrate");
  };

  const handleCalibrationComplete = (bounds) => {
    if (!pendingConfig) {
      setView("home");
      return;
    }
    const sessionConfig = { ...pendingConfig, startedAt: new Date().toISOString(), gazeBounds: bounds };
    setCurrentConfig(sessionConfig);
    setPendingConfig(null);
    setShowGazeDot(false);
    setView("session");
  };

  const handleEndSession = () => {
    if (!currentConfig) return;
    const startMs = new Date(currentConfig.startedAt).getTime();
    const endMs = Date.now();
    const actualMinutes = Math.round((endMs - startMs) / 60000);
    const completedSession = {
      ...currentConfig,
      endedAt: new Date(endMs).toISOString(),
      actualMinutes,
      focusPercent: sessionMetrics.focusPercent ?? 0,
      distractions: sessionMetrics.distractions ?? 0,
    };
    setPastSessions(prev => [...prev, completedSession]);
    setLastCompleted(completedSession);
    setCurrentConfig(null);
    setView("survey");
  };

  const handleSurveySubmit = (response) => {
    setSurveyResults(prev => [...prev, response]);
    setView("home");
  };

  /* ---------- VIEW ROUTING ---------- */
  switch (view) {
    case "login": return <LoginPage onLogin={handleLogin} />;
    case "home": return <HomePage
      userName={userName}
      onStartSessionClick={() => setView("pre")}
      onProfileClick={() => setView("profile")}
      onSurveyResultsClick={() => setView("surveyResults")}
    />;
    case "calibrate": return <GazeCalibrationPage
      config={pendingConfig}
      onCancel={() => { setPendingConfig(null); setView("home"); }}
      onComplete={handleCalibrationComplete}
    />;
    case "pre": return <PreSessionForm onBack={() => setView("home")} onStart={handlePreSessionStart} />;
    case "session": return <SessionPage
      config={currentConfig}
      userName={userName}
      soundMuted={backgroundMuted}
      onToggleMute={() => setBackgroundMuted(v => !v)}
      onMetricsUpdate={setSessionMetrics}
      metrics={sessionMetrics}
      showGazeDot={showGazeDot}
      onToggleGazeDot={() => setShowGazeDot(v => !v)}
      onEndSession={handleEndSession}
    />;
    case "profile": return <ProfilePage userName={userName} sessions={pastSessions} onBack={() => setView("home")} />;
    case "survey": return <SurveyPage lastSession={lastCompleted} onSubmit={handleSurveySubmit} />;
    case "surveyResults": return <SurveyResultsPage results={surveyResults} onBack={() => setView("home")} />;
    default: return null;
  }
}
