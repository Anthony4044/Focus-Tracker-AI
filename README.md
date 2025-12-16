# Focus Tracker AI

A React + Vite app that uses TensorFlow.js FaceMesh and Three.js to render live 3D face landmarks from your webcam. It also integrates WebGazer to infer on-screen vs off-screen gaze.

## Requirements

- Node.js 18+ (recommend 20 LTS)
- npm 9+ (bundled with Node)
- A webcam and a modern browser (Chrome/Edge recommended) with hardware acceleration enabled
- Network access to CDNs (WebGazer and MediaPipe assets load from jsDelivr)

## Install

```
npm install
npm install xlsx file-saver
npm install react-tsparticles tsparticles tsparticles-slim
```

## Run (development)

```
npm run dev
```
- Open the printed local URL (typically http://localhost:5173).
- Grant the browser permission to use your camera.
- Localhost counts as a secure context for getUserMedia.

## Build + Preview (production)

```
npm run build
npm run preview
```

## Key Dependencies

Runtime:
- react, react-dom
- vite (dev server and build tool)
- three (3D rendering)
- @tensorflow/tfjs, @tensorflow/tfjs-backend-webgl (TensorFlow.js + WebGL backend)
- @tensorflow-models/face-landmarks-detection (FaceMesh model wrapper)
- @mediapipe/face_mesh (model assets; also fetched via CDN at runtime)
- webgazer (loaded at runtime from CDN; no npm install required)

Dev:
- @vitejs/plugin-react, eslint and related plugins/types

## Notes

- If the camera feed is black or permission is denied, check site permissions for the origin.
- If landmarks don’t appear or performance is low, make sure hardware acceleration is enabled (WebGL).
- If running in a restricted network, allow access to jsDelivr for WebGazer and MediaPipe assets, or replace CDN usage with locally hosted files.

## Demo Video

https://drive.google.com/file/d/12t-8YXQoQLWAn5t_DqjunbGmmqsFS_Dm/view?usp=sharing
