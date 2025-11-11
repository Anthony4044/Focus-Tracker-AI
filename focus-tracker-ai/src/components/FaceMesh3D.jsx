// FaceMesh3D component
// - Captures webcam, runs TFJS FaceMesh, and renders 3D landmarks via Three.js
// - Uses WebGazer to infer whether the gaze is on-screen or off-screen
// - Shows overlays for status, FPS, and a face-count banner at the top
import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as THREE from "three";

export default function FaceMesh3D() {
  // DOM refs: outer container (for sizing/overlays) and <video> (webcam).
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  // Three.js renderer/scene/camera reused across frames to avoid GC churn.
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  // Geometry handles for landmarks:
  // - pointsRef: a Points cloud of all landmark vertices
  // - linesRef: optional K-nearest neighbor connections (simple wireframe)
  const pointsRef = useRef(null);
  const linesRef = useRef(null);
  // Face model + API mode (detector vs legacy package)
  const modelRef = useRef(null);
  const apiRef = useRef("none");
  // requestAnimationFrame id, used to cancel on unmount
  const rafRef = useRef(0);
  // UI state and runtime metrics
  const [status, setStatus] = useState("Initializing...");
  const [facesCount, setFacesCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [offScreen, setOffScreen] = useState(false); // true when gaze is off-screen for a short time
  const [gazeXY, setGazeXY] = useState(null);        // latest gaze pixel (rounded), if available
  // WebGazer instance + debug/calibration state
  const webgazerRef = useRef(null);
  const [showGazeDot, setShowGazeDot] = useState(false);
  // Simple 9-point calibration overlay (user clicks each dot while looking at it)
  const [calibrating, setCalibrating] = useState(false);
  const CALIB_POINTS = [
    [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
    [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
    [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
  ];
  const CALIBRATION_PER_POINT = 5;
  const [calibrationCounts, setCalibrationCounts] = useState(() => new Array(9).fill(0));

  // Visualization and performance tuning
  // DRAW_LINES: toggles K-nearest neighbor connections between landmarks (wireframe).
  // CONNECT_K: number of neighbors per point (higher = denser mesh and more CPU).
  // LINES_UPDATE_EVERY_N_FRAMES: recompute lines every N frames to save CPU.
  // DEPTH_SCALE: multiplies the model’s Z so depth is visible with an ortho camera.
  const DRAW_LINES = true; // connect nearest neighbors
  const CONNECT_K = 2; // neighbors per point
  const LINES_UPDATE_EVERY_N_FRAMES = 2; // throttle line recompute
  const DEPTH_SCALE = 50; // z scaling for visual depth

  useEffect(() => {
    // Bootstrapping pipeline on mount:
    // 1) Request camera and start <video>
    // 2) Initialize TFJS (WebGL backend)
    // 3) Load FaceMesh model (prefer MediaPipe detector, fallback to TFJS or legacy package)
    // 4) Setup Three.js renderer/scene/camera
    // 5) Start detection/render loop and handle window resizes
    let isMounted = true;

    const init = async () => {
      try {
        setStatus("Requesting camera...");
        // Ask the browser for the front-facing camera at 640x480.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        if (!isMounted) return;
        const vid = videoRef.current;
        vid.srcObject = stream;
        await new Promise((res) => (vid.onloadedmetadata = res));
        await vid.play();

        setStatus("Preparing TensorFlow.js...");
        // Use the WebGL backend for GPU acceleration (required for speed).
        await tf.setBackend("webgl");
        await tf.ready();
        setStatus(`TFJS backend: ${tf.getBackend()}`);

        setStatus("Loading face model...");
        // Prefer the new Detector API when available.
        if (typeof faceLandmarksDetection.createDetector === "function") {
          const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
          try {
            // Prefer MediaPipe runtime for better accuracy and speed.
            modelRef.current = await faceLandmarksDetection.createDetector(model, {
              runtime: "mediapipe",
              refineLandmarks: true,
              maxFaces: 1,
              solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh",
              modelType: "full",
            });
            apiRef.current = "detector_mediapipe";
          } catch (e) {
            console.warn("Falling back to TFJS runtime for FaceMesh", e);
            modelRef.current = await faceLandmarksDetection.createDetector(model, {
              runtime: "tfjs",
              refineLandmarks: true,
              maxFaces: 1,
            });
            apiRef.current = "detector_tfjs";
          }
        } else {
          // Legacy package API path (older @tensorflow-models/face-landmarks-detection API)
          modelRef.current = await faceLandmarksDetection.load(
            faceLandmarksDetection.SupportedPackages.mediapipeFacemesh,
            {
              maxFaces: 1,
              shouldLoadIrisModel: false,
            }
          );
          apiRef.current = "package";
        }

        if (!isMounted) return;
        setupThree();

        setStatus("Running...");
        // Kick off the RAF loop
        loop();
        window.addEventListener("resize", handleResize);
        handleResize();
      } catch (err) {
        console.error(err);
        setStatus("Error: " + (err?.message || String(err)));
      }
    };

    const setupThree = () => {
      // Create the WebGL renderer and size it to our container.
      const container = containerRef.current;
      const width = container.clientWidth || 640;
      const height = Math.floor((width * 3) / 4);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true, // allow the webcam video underneath to show through
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
      // Respect high-DPI screens but cap at 2x for perf.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.setClearAlpha(0); // transparent background so the video is visible
      container.appendChild(renderer.domElement);
      // Position the canvas above the video element
      renderer.domElement.style.position = "absolute";
      renderer.domElement.style.top = "0";
      renderer.domElement.style.left = "0";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.zIndex = "1";
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      // Orthographic camera mapped to pixel coordinates (origin top-left)
      // Note: THREE.OrthographicCamera(left, right, top, bottom, near, far)
      // We set top=0 and bottom=height to align y increasing downward (CSS-like coordinates).
      const camera = new THREE.OrthographicCamera(0, width, 0, height, -1000, 1000);
      camera.position.z = 10;
      cameraRef.current = camera;

      // A basic ambient light so the points/lines are visible.
      const light = new THREE.AmbientLight(0xffffff, 1.0);
      scene.add(light);
    };

    const handleResize = () => {
      // Keep renderer size and camera frustum in sync with the container.
      const container = containerRef.current;
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const width = container.clientWidth || 640;
      const height = Math.floor((width * 3) / 4);
      rendererRef.current.setSize(width, height);
      const cam = cameraRef.current;
      cam.left = 0;
      cam.right = width;
      cam.top = 0;     // y-down
      cam.bottom = height;
      cam.updateProjectionMatrix();
    };

    const estimateFaces = async () => {
      // Estimate faces from the current video frame.
      // New Detector API accepts the HTMLVideoElement directly; legacy API takes an object.
      if (!modelRef.current) return [];
      if (apiRef.current === "detector_mediapipe" || apiRef.current === "detector_tfjs") {
        return await modelRef.current.estimateFaces(videoRef.current, {
          flipHorizontal: true, // mirror to match user’s perspective
        });
      }
      return await modelRef.current.estimateFaces({
        input: videoRef.current,
        returnTensors: false,
        flipHorizontal: true,
        predictIrises: false,
      });
    };

    // Map model pixel coordinates to canvas CSS pixels, accounting for 'cover' scaling
    const toDisplayPoints = (points) => {
      const container = containerRef.current;
      const video = videoRef.current;
      if (!container || !video || !points?.length) return points;
      const rect = container.getBoundingClientRect();
      const cw = rect.width || container.clientWidth || 640;
      const ch = rect.height || Math.floor((cw * 3) / 4);
      const vw = video.videoWidth || cw;
      const vh = video.videoHeight || ch;
      // object-fit: cover -> scale by the larger factor and center crop
      // s = max(cw/vw, ch/vh). Then shift by the crop offset (dx, dy).
      const s = Math.max(cw / vw, ch / vh);
      const dx = (cw - vw * s) / 2;
      const dy = (ch - vh * s) / 2;
      return points.map(([x, y, z]) => [x * s + dx, y * s + dy, z || 0]);
    };

    const extract2DPoints = (face) => {
      // Extract [x,y,z] landmarks in pixel space regardless of API mode.
      // Prefer pixel-space keypoints (new detector API)
      if (face?.keypoints && face.keypoints.length) {
        return face.keypoints.map((k) => [k.x, k.y, k.z ?? 0]);
      }
      // Old API: scaledMesh in pixel space
      if (face?.scaledMesh && face.scaledMesh.length) {
        return face.scaledMesh.map((p) => [p[0], p[1], p[2] ?? 0]);
      }
      // Old API: mesh may be normalized [0..1]
      if (face?.mesh && face.mesh.length) {
        const w = rendererRef.current?.domElement.width || 640;
        const h = rendererRef.current?.domElement.height || 480;
        return face.mesh.map((p) => [p[0] * w, p[1] * h, p[2] ?? 0]);
      }
      return [];
    };

    const updateGeometry = (points) => {
      // Create or update the Three.js Points geometry for the current landmarks.
      const scene = sceneRef.current;
      if (!scene) return;
      if (!pointsRef.current) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(points.length * 3);
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
          color: 0x00e0ff,
          // Pixel-sized points for consistent visibility
          size: 1.6,
          sizeAttenuation: false,
        });
        const cloud = new THREE.Points(geometry, material);
        scene.add(cloud);
        pointsRef.current = cloud;
      }

      // Reallocate buffer if landmark count changes
      let positionAttr = pointsRef.current.geometry.getAttribute("position");
      if (!positionAttr || positionAttr.array.length !== points.length * 3) {
        const newPositions = new Float32Array(points.length * 3);
        pointsRef.current.geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(newPositions, 3)
        );
        positionAttr = pointsRef.current.geometry.getAttribute("position");
      }
      const arr = positionAttr.array;
      for (let i = 0; i < points.length; i++) {
        const [x, y, z] = points[i];
        const ix = i * 3;
        // Use pixel coordinates; detector already flips horizontally, and video is mirrored.
        arr[ix] = x;
        arr[ix + 1] = y; // y increases downward in our ortho camera
        // Negate z so that larger z (further from camera) moves "into" the screen in our view.
        arr[ix + 2] = -(z || 0) * DEPTH_SCALE;
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
      pointsRef.current.geometry.computeBoundingSphere();
    };

    let lastTime = performance.now();
    let frames = 0;
    let lastFpsUpdate = performance.now();
    let lineFrameCounter = 0;
    const loop = async () => {
      // Per-frame: run detection, update geometry/lines, render, and update FPS.
      const faces = await estimateFaces();
      setFacesCount(faces?.length || 0);
      if (faces && faces.length) {
        const raw = extract2DPoints(faces[0]);
        const pts = toDisplayPoints(raw);
        if (pts.length) {
          updateGeometry(pts);
          if (DRAW_LINES && (lineFrameCounter++ % LINES_UPDATE_EVERY_N_FRAMES === 0)) {
            // Recompute simple K-nearest neighbor connections (approximate wireframe)
            const n = pts.length;
            const edges = new Set();
            for (let i = 0; i < n; i++) {
              let best = [];
              const [xi, yi, zi] = pts[i];
              for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const [xj, yj, zj] = pts[j];
                const dx = xi - xj;
                const dy = yi - yj;
                const dz = (zi || 0) - (zj || 0);
                const d2 = dx * dx + dy * dy + dz * dz;
                if (best.length < CONNECT_K) {
                  best.push([d2, j]);
                  best.sort((a, b) => a[0] - b[0]);
                } else if (d2 < best[CONNECT_K - 1][0]) {
                  best[CONNECT_K - 1] = [d2, j];
                  best.sort((a, b) => a[0] - b[0]);
                }
              }
              for (const [, j] of best) {
                const a = i < j ? i : j;
                const b = i < j ? j : i;
                edges.add(a + "," + b);
              }
            }
            const m = edges.size;
            if (!linesRef.current) {
              const geom = new THREE.BufferGeometry();
              const mat = new THREE.LineBasicMaterial({ color: 0x14e1ff, opacity: 0.85, transparent: true });
              const lines = new THREE.LineSegments(geom, mat);
              sceneRef.current.add(lines);
              linesRef.current = lines;
            }
            const positions = new Float32Array(m * 2 * 3);
            let idx = 0;
            for (const e of edges) {
              const [aStr, bStr] = e.split(",");
              const a = parseInt(aStr, 10);
              const b = parseInt(bStr, 10);
              const [ax, ay, az] = pts[a];
              const [bx, by, bz] = pts[b];
              positions[idx++] = ax;
              positions[idx++] = ay;
              positions[idx++] = -(az || 0) * DEPTH_SCALE;
              positions[idx++] = bx;
              positions[idx++] = by;
              positions[idx++] = -(bz || 0) * DEPTH_SCALE;
            }
            linesRef.current.geometry.setAttribute(
              "position",
              new THREE.BufferAttribute(positions, 3)
            );
            linesRef.current.geometry.computeBoundingSphere();
          }
        }
      }
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      // FPS tracking: sample roughly twice per second to avoid noise
      frames += 1;
      const now = performance.now();
      if (now - lastFpsUpdate > 500) {
        const delta = now - lastTime;
        setFps(Math.round((frames * 1000) / delta));
        frames = 0;
        lastTime = now;
        lastFpsUpdate = now;
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    init();

    return () => {
      // On unmount: stop RAF, detach listeners, release camera, and dispose GL resources.
      isMounted = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
      if (videoRef.current?.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks?.() || [];
        tracks.forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (rendererRef.current.domElement?.parentNode) {
          rendererRef.current.domElement.parentNode.removeChild(
            rendererRef.current.domElement
          );
        }
      }
      if (pointsRef.current) {
        pointsRef.current.geometry.dispose();
        pointsRef.current.material.dispose();
        pointsRef.current = null;
      }
      if (linesRef.current) {
        linesRef.current.geometry.dispose();
        linesRef.current.material.dispose();
        linesRef.current = null;
      }
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  // Reflect debug toggle to WebGazer's prediction dot overlay
  useEffect(() => {
    try {
      const wg = webgazerRef.current || window.webgazer;
      wg?.showPredictionPoints?.(showGazeDot);
    } catch (_) {}
  }, [showGazeDot]);

  // Helpers to run a simple 9-point click calibration
  // Clears prior data, enables WebGazer's mouse-based sampling, and shows prediction points.
  const startCalibration = () => {
    setCalibrating(true);
    setCalibrationCounts(new Array(9).fill(0));
    try {
      const wg = webgazerRef.current || window.webgazer;
      wg?.clearData?.();
      wg?.addMouseEventListeners?.();
      wg?.showPredictionPoints?.(true);
    } catch (_) {}
  };
  const stopCalibration = () => {
    setCalibrating(false);
    try {
      const wg = webgazerRef.current || window.webgazer;
      wg?.removeMouseEventListeners?.();
      wg?.showPredictionPoints?.(showGazeDot);
    } catch (_) {}
  };

  // WebGazer integration
  // Goal: decide if user's gaze is on the current screen (viewport) vs off-screen.
  // Notes:
  // - Face presence (facesCount) is separate from gaze. Gaze uses WebGazer's x,y in viewport pixels.
  // - We consider gaze "on-screen" when x,y fall within the window bounds (with a small margin).
  // - We smooth using time: offScreen becomes true only if we haven't seen an on-screen gaze
  //   for OFFSCREEN_DELAY_MS (helps avoid flicker).
  useEffect(() => {
    let cancelled = false;
    const loadScript = () =>
      new Promise((resolve, reject) => {
        // Load WebGazer from CDN once; reuse if present on window.
        if (typeof window !== "undefined" && window.webgazer) return resolve(window.webgazer);
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
        webgazerRef.current = wg;
        try {
          // Turn off WebGazer's own overlays; we manage UI ourselves.
          if (wg.showVideoPreview) wg.showVideoPreview(false);
          if (wg.showPredictionPoints) wg.showPredictionPoints(false);
          if (wg.showFaceOverlay) wg.showFaceOverlay(false);
          if (wg.showFaceFeedbackBox) wg.showFaceFeedbackBox(false);
          // Use ridge regression and TF FaceMesh-based tracker for better stability.
          if (wg.setRegression) wg.setRegression("ridge");
          if (wg.setTracker) { try { wg.setTracker("TFFacemesh"); } catch (_) {} }
        } catch (_) {}

        const OFFSCREEN_DELAY_MS = 250; // require ~250ms away before flagging off-screen
        let lastOnScreenAt = performance.now();

        wg.setGazeListener((data) => {
          if (cancelled) return;
          // Allow a small margin around the viewport to avoid flicker at edges.
          const margin = 40;
          const W = window.innerWidth || document.documentElement.clientWidth || 0;
          const H = window.innerHeight || document.documentElement.clientHeight || 0;
          // Treat only valid predictions as signal; missing predictions do not reset the timer.
          const valid = data && typeof data.x === "number" && typeof data.y === "number";
          if (valid) {
            const x = data.x;
            const y = data.y;
            setGazeXY({ x: Math.round(x), y: Math.round(y) });
            const inside = x >= -margin && x <= W + margin && y >= -margin && y <= H + margin;
            if (inside) {
              // Update the last time we confirmed on-screen gaze.
              lastOnScreenAt = performance.now();
            }
          } else {
            setGazeXY(null);
          }
          const now = performance.now();
          setOffScreen(now - lastOnScreenAt > OFFSCREEN_DELAY_MS);
        }).begin();
      })
      .catch((err) => {
        console.warn("WebGazer load failed", err);
      });

    return () => {
      cancelled = true;
      try {
        const wg = webgazerRef.current || window.webgazer;
        if (wg) {
          if (wg.clearGazeListener) wg.clearGazeListener();
          if (wg.removeMouseEventListeners) wg.removeMouseEventListeners();
          if (wg.end) wg.end();
        }
      } catch (_) {}
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 800,
        aspectRatio: "4 / 3",
        // Background hint: light red if gaze is off-screen AND no face detected.
        // Otherwise white. This is subtle and independent of the top banner below.
        background: offScreen && facesCount === 0 ? "rgba(255, 0, 0, 0.3)" : "#000",
        overflow: "hidden",
      }}
    >
      {/* Face-count banner: red (0), green (>1), neutral (1) */}
      <div
        aria-live="polite"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 26,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 600,
          fontSize: 12,
          color: "#fff",
          zIndex: 5,
          // Color logic: red (no faces), green (>1 face), neutral gray (exactly 1 face)
          background:
            facesCount === 0 ? "#e53935"  : "#2e7d32",
          opacity: 0.92,
          pointerEvents: "none",
        }}
      >
        {facesCount === 0
          ? "No face detected"
          : facesCount > 1
          ? `${facesCount} faces detected`
          : "1 face detected"}
      </div>
      {/* Small controls: toggle gaze dot, run calibration */}
      <div
        style={{
          position: "absolute",
          // Offset to sit below the banner
          top: 36,
          right: 8,
          display: "flex",
          gap: 8,
          zIndex: 3,
        }}
      >
        <button onClick={() => setShowGazeDot((v) => !v)} style={{ padding: "4px 8px", fontSize: 12 }}>
          {showGazeDot ? "Hide" : "Show"} Gaze Dot
        </button>
        {!calibrating ? (
          <button onClick={startCalibration} style={{ padding: "4px 8px", fontSize: 12 }}>
            Calibrate
          </button>
        ) : (
          <button onClick={stopCalibration} style={{ padding: "4px 8px", fontSize: 12 }}>
            End Calib
          </button>
        )}
        <button
          onClick={() => {
            try {
              const wg = webgazerRef.current || window.webgazer;
              wg?.clearData?.();
            } catch (_) {}
          }}
          style={{ padding: "4px 8px", fontSize: 12 }}
        >
          Reset Gaze
        </button>
      </div>

      {/* Gaze status overlay */}
      <div
        style={{
          position: "absolute",
          // Below banner and controls
          top: 68,
          left: 8,
          padding: "2px 6px",
          background: "rgba(0,0,0,0.5)",
          color: "#fff",
          borderRadius: 4,
          fontSize: 12,
          zIndex: 2,
        }}
      >
        Gaze: {offScreen ? "off-screen" : "on-screen"}
      </div>
      {/* Calibration overlay: 9 clickable targets to help WebGazer learn */}
      {calibrating && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: 4,
          }}
        >
          <div
            style={{
              position: "absolute",
              // Offset to sit below the banner
              top: 36,
              left: 8,
              padding: "4px 8px",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            Calibration: click each dot {CALIBRATION_PER_POINT} times while looking at it.
          </div>
          {CALIB_POINTS.map(([px, py], idx) => {
            const count = calibrationCounts[idx] || 0;
            const done = count >= CALIBRATION_PER_POINT;
            return (
              <button
                key={idx}
                onClick={() => {
                  setCalibrationCounts((prev) => {
                    const next = prev.slice();
                    next[idx] = Math.min(CALIBRATION_PER_POINT, (next[idx] || 0) + 1);
                    // Finish automatically when all points reached the quota
                    if (next.every((c) => c >= CALIBRATION_PER_POINT)) {
                      stopCalibration();
                    }
                    return next;
                  });
                }}
                style={{
                  position: "absolute",
                  left: `${px * 100}%`,
                  top: `${py * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  border: done ? "2px solid #4caf50" : "2px solid #14e1ff",
                  background: done ? "#4caf50" : "#14e1ff",
                  opacity: 0.9,
                  cursor: "pointer",
                }}
                title={`Clicks: ${count}/${CALIBRATION_PER_POINT}`}
              />
            );
          })}
        </div>
      )}
      {/* Webcam as background for reference */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)",
          opacity: 0.5,
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          // Move down to avoid overlapping the face-count banner
          top: 36,
          left: 8,
          padding: "4px 8px",
          background: "rgba(0,0,0,0.5)",
          color: "#fff",
          borderRadius: 4,
          fontSize: 12,
          zIndex: 2,
        }}
      >
        {status} • Faces: {facesCount} • FPS: {fps}
      </div>
    </div>
  );
}
