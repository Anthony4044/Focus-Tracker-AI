import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as THREE from "three";

export default function FaceMesh3D() {
  const containerRef = useRef(null);
  const videoRef = useRef(null);

  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const pointsRef = useRef(null);
  const linesRef = useRef(null);

  const modelRef = useRef(null);
  const apiRef = useRef("none");
  const rafRef = useRef(0);

  const [status, setStatus] = useState("Initializing...");
  const [facesCount, setFacesCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [offScreen, setOffScreen] = useState(false);
  const [gazeXY, setGazeXY] = useState(null);

  const webgazerRef = useRef(null);
  const [showGazeDot, setShowGazeDot] = useState(false);

  const [calibrating, setCalibrating] = useState(false);
  const CALIB_POINTS = [
    [0.1, 0.1],
    [0.5, 0.1],
    [0.9, 0.1],
    [0.1, 0.5],
    [0.5, 0.5],
    [0.9, 0.5],
    [0.1, 0.9],
    [0.5, 0.9],
    [0.9, 0.9],
  ];
  const CALIBRATION_PER_POINT = 5;
  const [calibrationCounts, setCalibrationCounts] = useState(
    () => new Array(9).fill(0)
  );

  // ---------- focus AI state ----------
  const [isFocused, setIsFocused] = useState(true);
  const [focusPercent, setFocusPercent] = useState(100);
  const [distractions, setDistractions] = useState(0);

  const focusStatsRef = useRef({
    lastUpdate:
      typeof performance !== "undefined" ? performance.now() : Date.now(),
    focusedMs: 0,
    totalMs: 0,
    lastFocusedFlag: true,
    unfocusedSince: null,
  });

  const [headTurned, setHeadTurned] = useState(false); // yaw (left/right)
  const [eyesOffScreen, setEyesOffScreen] = useState(false); // pitch (up/down)

  // ---------- audio for continuous beep ----------
  const audioCtxRef = useRef(null);
  const beepIntervalRef = useRef(null);

  const playBeep = () => {
    try {
      const AudioCtx =
        window.AudioContext || window.webkitAudioContext || null;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;

      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = 880; // beep pitch
      gain.gain.value = 0.05; // volume

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      osc.start(now);
      osc.stop(now + 0.15); // 150ms beep
    } catch (e) {
      console.warn("Beep failed:", e);
    }
  };

  // start / stop continuous beeps based on focus/face
  useEffect(() => {
    // "Alert" state: either not focused OR no face visible
    const shouldAlert = !isFocused || facesCount === 0;

    if (shouldAlert) {
      if (!beepIntervalRef.current) {
        // beep every 1.2s while unfocused
        beepIntervalRef.current = setInterval(() => {
          playBeep();
        }, 1200);
      }
    } else {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    }

    return () => {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    };
  }, [isFocused, facesCount]);

  // clean up audio context on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  // ---------- vis params ----------
  const DRAW_LINES = true;
  const CONNECT_K = 2;
  const LINES_UPDATE_EVERY_N_FRAMES = 2;
  const DEPTH_SCALE = 50;

  // --- helper: approximate head yaw from landmarks ---
  const estimateHeadYaw = (pts) => {
    if (!pts || pts.length < 10) return 0.5;

    let minX = Infinity;
    let maxX = -Infinity;
    for (const [x] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    const width = Math.max(1, maxX - minX);

    const noseIdx = 1;
    const noseX = pts[noseIdx]?.[0] ?? (minX + maxX) / 2;

    return (noseX - minX) / width; // 0..1
  };

  // --- helper: approximate head pitch (up/down) from eye height ---
  const estimateEyeHeight = (pts) => {
    if (!pts || pts.length < 400) return 0.5;

    const LEFT_EYE_OUTER = 33;
    const RIGHT_EYE_OUTER = 263;

    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const height = Math.max(1, maxY - minY);

    const leftY = pts[LEFT_EYE_OUTER]?.[1] ?? (minY + maxY) / 2;
    const rightY = pts[RIGHT_EYE_OUTER]?.[1] ?? (minY + maxY) / 2;
    const eyesY = (leftY + rightY) / 2;

    return (eyesY - minY) / height; // 0..1
  };

  // ------------- main effect: camera + facemesh + three.js -------------
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        setStatus("Requesting camera...");
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
        await tf.setBackend("webgl");
        await tf.ready();
        setStatus(`TFJS backend: ${tf.getBackend()}`);

        setStatus("Loading face model...");
        if (typeof faceLandmarksDetection.createDetector === "function") {
          const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
          try {
            modelRef.current = await faceLandmarksDetection.createDetector(
              model,
              {
                runtime: "mediapipe",
                refineLandmarks: true,
                maxFaces: 1,
                solutionPath:
                  "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh",
                modelType: "full",
              }
            );
            apiRef.current = "detector_mediapipe";
          } catch (e) {
            console.warn("Falling back to TFJS runtime for FaceMesh", e);
            modelRef.current = await faceLandmarksDetection.createDetector(
              model,
              {
                runtime: "tfjs",
                refineLandmarks: true,
                maxFaces: 1,
              }
            );
            apiRef.current = "detector_tfjs";
          }
        } else {
          modelRef.current = await faceLandmarksDetection.load(
            faceLandmarksDetection.SupportedPackages.mediapipeFacemesh,
            { maxFaces: 1, shouldLoadIrisModel: false }
          );
          apiRef.current = "package";
        }

        if (!isMounted) return;
        setupThree();
        setStatus("Running...");

        loop();
        window.addEventListener("resize", handleResize);
        handleResize();
      } catch (err) {
        console.error(err);
        setStatus("Error: " + (err?.message || String(err)));
      }
    };

    const setupThree = () => {
      const container = containerRef.current;
      const width = container.clientWidth || 640;
      const height = Math.floor((width * 3) / 4);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.setClearAlpha(0);
      container.appendChild(renderer.domElement);
      renderer.domElement.style.position = "absolute";
      renderer.domElement.style.top = "0";
      renderer.domElement.style.left = "0";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.zIndex = "1";
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.OrthographicCamera(
        0,
        width,
        0,
        height,
        -1000,
        1000
      );
      camera.position.z = 10;
      cameraRef.current = camera;

      const light = new THREE.AmbientLight(0xffffff, 1.0);
      scene.add(light);
    };

    const handleResize = () => {
      const container = containerRef.current;
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const width = container.clientWidth || 640;
      const height = Math.floor((width * 3) / 4);
      rendererRef.current.setSize(width, height);
      const cam = cameraRef.current;
      cam.left = 0;
      cam.right = width;
      cam.top = 0;
      cam.bottom = height;
      cam.updateProjectionMatrix();
    };

    const estimateFaces = async () => {
      if (!modelRef.current) return [];
      if (
        apiRef.current === "detector_mediapipe" ||
        apiRef.current === "detector_tfjs"
      ) {
        return await modelRef.current.estimateFaces(videoRef.current, {
          flipHorizontal: true,
        });
      }
      return await modelRef.current.estimateFaces({
        input: videoRef.current,
        returnTensors: false,
        flipHorizontal: true,
        predictIrises: false,
      });
    };

    const toDisplayPoints = (points) => {
      const container = containerRef.current;
      const video = videoRef.current;
      if (!container || !video || !points?.length) return points;
      const rect = container.getBoundingClientRect();
      const cw = rect.width || container.clientWidth || 640;
      const ch = rect.height || Math.floor((cw * 3) / 4);
      const vw = video.videoWidth || cw;
      const vh = video.videoHeight || ch;
      const s = Math.max(cw / vw, ch / vh);
      const dx = (cw - vw * s) / 2;
      const dy = (ch - vh * s) / 2;
      return points.map(([x, y, z]) => [x * s + dx, y * s + dy, z || 0]);
    };

    const extract2DPoints = (face) => {
      if (face?.keypoints && face.keypoints.length) {
        return face.keypoints.map((k) => [k.x, k.y, k.z ?? 0]);
      }
      if (face?.scaledMesh && face.scaledMesh.length) {
        return face.scaledMesh.map((p) => [p[0], p[1], p[2] ?? 0]);
      }
      if (face?.mesh && face.mesh.length) {
        const w = rendererRef.current?.domElement.width || 640;
        const h = rendererRef.current?.domElement.height || 480;
        return face.mesh.map((p) => [p[0] * w, p[1] * h, p[2] ?? 0]);
      }
      return [];
    };

    const updateGeometry = (points) => {
      const scene = sceneRef.current;
      if (!scene) return;
      if (!pointsRef.current) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(points.length * 3);
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(positions, 3)
        );
        const material = new THREE.PointsMaterial({
          color: 0x00e0ff,
          size: 1.6,
          sizeAttenuation: false,
        });
        const cloud = new THREE.Points(geometry, material);
        scene.add(cloud);
        pointsRef.current = cloud;
      }

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
        arr[ix] = x;
        arr[ix + 1] = y;
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
      const faces = await estimateFaces();
      setFacesCount(faces?.length || 0);

      if (faces && faces.length) {
        const raw = extract2DPoints(faces[0]);
        const pts = toDisplayPoints(raw);
        if (pts.length) {
          const yawNorm = estimateHeadYaw(pts); // 0..1
          const eyeHeight = estimateEyeHeight(pts); // 0..1

          const turned = yawNorm < 0.45 || yawNorm > 0.55;
          setHeadTurned(turned);

          const eyesDown = eyeHeight < 0.30;
          const eyesUp = eyeHeight > 0.60;
          setEyesOffScreen(eyesDown || eyesUp);

          updateGeometry(pts);

          if (
            DRAW_LINES &&
            lineFrameCounter++ % LINES_UPDATE_EVERY_N_FRAMES === 0
          ) {
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
              const mat = new THREE.LineBasicMaterial({
                color: 0x14e1ff,
                opacity: 0.85,
                transparent: true,
              });
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

  // ------------- webgazer overlays -------------
  useEffect(() => {
    try {
      const wg = webgazerRef.current || window.webgazer;
      wg?.showPredictionPoints?.(showGazeDot);
    } catch (_) {}
  }, [showGazeDot]);

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

  // ------------- webgazer: offScreen detection -------------
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
        webgazerRef.current = wg;
        try {
          wg.showVideoPreview && wg.showVideoPreview(false);
          wg.showPredictionPoints && wg.showPredictionPoints(false);
          wg.showFaceOverlay && wg.showFaceOverlay(false);
          wg.showFaceFeedbackBox && wg.showFaceFeedbackBox(false);
          wg.setRegression && wg.setRegression("ridge");
          if (wg.setTracker) {
            try {
              wg.setTracker("TFFacemesh");
            } catch (_) {}
          }
        } catch (_) {}

        const OFFSCREEN_DELAY_MS = 250;
        let lastOnScreenAt = performance.now();

        wg.setGazeListener((data) => {
          if (cancelled) return;
          const margin = 5;
          const W =
            window.innerWidth || document.documentElement.clientWidth || 0;
          const H =
            window.innerHeight || document.documentElement.clientHeight || 0;
          const valid =
            data && typeof data.x === "number" && typeof data.y === "number";
          if (valid) {
            const x = data.x;
            const y = data.y;
            setGazeXY({ x: Math.round(x), y: Math.round(y) });
            const inside =
              x >= -margin &&
              x <= W + margin &&
              y >= -margin &&
              y <= H + margin;
            if (inside) {
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
          wg.clearGazeListener && wg.clearGazeListener();
          wg.removeMouseEventListeners && wg.removeMouseEventListeners();
          wg.end && wg.end();
        }
      } catch (_) {}
    };
  }, []);

  // ------------- FOCUS AI EFFECT -------------
  useEffect(() => {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const stats = focusStatsRef.current;

    const dt = now - stats.lastUpdate;
    stats.lastUpdate = now;

    stats.totalMs += dt;
    if (stats.lastFocusedFlag) stats.focusedMs += dt;

    // focused if: 1 face + gaze on-screen + head not turned + eyes not clearly up/down
    const rawFocused =
      facesCount === 1 && !offScreen && !headTurned && !eyesOffScreen;
    const UNFOCUS_THRESHOLD_MS = 2000;

    if (!rawFocused) {
      if (stats.unfocusedSince == null) {
        stats.unfocusedSince = now;
      } else if (now - stats.unfocusedSince > UNFOCUS_THRESHOLD_MS) {
        if (stats.lastFocusedFlag === true) {
          setDistractions((d) => d + 1);
        }
        stats.lastFocusedFlag = false;
      }
    } else {
      stats.unfocusedSince = null;
      stats.lastFocusedFlag = true;
    }

    setIsFocused(stats.lastFocusedFlag);
    if (stats.totalMs > 0) {
      setFocusPercent(Math.round((stats.focusedMs / stats.totalMs) * 100));
    }
  }, [offScreen, facesCount, headTurned, eyesOffScreen]);

  // ----------- derived UI state: what to show as "not focused" ----------
  const displayNotFocused = !isFocused || facesCount === 0;

  // ------------- RENDER -------------
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 800,
        aspectRatio: "4 / 3",
        // red background if our display state says "not focused" OR no face
        background: displayNotFocused ? "rgba(255, 0, 0, 0.3)" : "#000",
        overflow: "hidden",
      }}
    >
      {/* banner */}
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
          background: facesCount === 0 ? "#e53935" : "#2e7d32",
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

      {/* controls */}
      <div
        style={{
          position: "absolute",
          top: 36,
          right: 8,
          display: "flex",
          gap: 8,
          zIndex: 3,
        }}
      >
        <button
          onClick={() => setShowGazeDot((v) => !v)}
          style={{ padding: "4px 8px", fontSize: 12 }}
        >
          {showGazeDot ? "Hide" : "Show"} Gaze Dot
        </button>
        {!calibrating ? (
          <button
            onClick={startCalibration}
            style={{ padding: "4px 8px", fontSize: 12 }}
          >
            Calibrate
          </button>
        ) : (
          <button
            onClick={stopCalibration}
            style={{ padding: "4px 8px", fontSize: 12 }}
          >
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

      {/* gaze status */}
      {/*<div
        style={{
          position: "absolute",
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
      </div>*/}
      

      {/* webcam */}
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

      {/* status + FOCUS INFO */}
<div
  style={{
    position: "absolute",
    top: 36,
    left: 8,
    padding: "6px 10px",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    borderRadius: 4,
    fontSize: 12,
    zIndex: 2,
    display: "flex",
    flexDirection: "column",
    gap: 3,
    lineHeight: 1.3,
    maxWidth: 260,
  }}
>
  <div>{status} • Faces: {facesCount} • FPS: {fps}</div>
  <div>Focus: {isFocused ? "Focused ✅" : "Not focused ❌"}</div>
  <div>Session focus: {focusPercent}%</div>
  <div>Distractions: {distractions}</div>
  <div>
    Head turned: {headTurned ? "yes" : "no"} • Eyes off-screen:{" "}
    {eyesOffScreen ? "yes" : "no"}
  </div>
  <div>Alerting: {displayNotFocused ? "YES (beeping)" : "no"}</div>
</div>


      {/* calibration overlay */}
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
              top: 36,
              left: 8,
              padding: "4px 8px",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            Calibration: click each dot {CALIBRATION_PER_POINT} times while
            looking at it.
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
                    next[idx] = Math.min(
                      CALIBRATION_PER_POINT,
                      (next[idx] || 0) + 1
                    );
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
                  border: done
                    ? "2px solid #4caf50"
                    : "2px solid #14e1ff",
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
    </div>
  );
}

