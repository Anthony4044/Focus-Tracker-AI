import { useCallback, useMemo } from "react";
import Particles from "react-tsparticles";
import { loadSlim } from "tsparticles-slim";

export default function MovingBackground() {
  const init = useCallback(async (engine) => {
    await loadSlim(engine);
  }, []);

  const options = useMemo(
    () => ({
      fullScreen: { enable: true, zIndex: 0 },
      fpsLimit: 60,
      detectRetina: true,

      background: {
        color: { value: "#05070f" },
        image:
          "radial-gradient(circle at 20% 20%, rgba(99,102,241,0.25), transparent 40%)," +
          "radial-gradient(circle at 80% 30%, rgba(14,165,233,0.22), transparent 45%)," +
          "radial-gradient(circle at 50% 85%, rgba(34,211,238,0.14), transparent 55%)",
        position: "50% 50%",
        repeat: "no-repeat",
        size: "cover",
      },

      interactivity: {
        events: {
          onHover: { enable: true, mode: "bubble" },
          onClick: { enable: true, mode: "repulse" },
          resize: true,
        },
        modes: {
          bubble: {
            distance: 140,
            duration: 1.6,
            opacity: 0.8,
            size: 10,
          },
          repulse: {
            distance: 200,
            duration: 0.7,
          },
        },
      },

      particles: {
        number: { value: 70, density: { enable: true, area: 900 } },

        color: { value: ["#8b5cf6", "#22d3ee", "#60a5fa"] },

        links: {
          enable: true,
          distance: 150,
          color: "#93c5fd",
          opacity: 0.10,
          width: 1,
        },

        opacity: {
          value: { min: 0.08, max: 0.35 },
          animation: {
            enable: true,
            speed: 0.6,
            sync: false,
            minimumValue: 0.05,
          },
        },

        size: {
          value: { min: 1, max: 4 },
          animation: { enable: true, speed: 1.2, minimumValue: 1, sync: false },
        },

        move: {
          enable: true,
          speed: 0.65,
          direction: "none",
          outModes: { default: "out" },
          random: false,
          straight: false,
          // makes motion feel "fluid" instead of linear
          trail: { enable: false },
          attract: { enable: false },
        },

        rotate: {
          value: { min: 0, max: 360 },
          direction: "random",
          animation: { enable: true, speed: 6 },
        },

        // this is the secret sauce for "cool movements"
        wobble: {
          enable: true,
          distance: 10,
          speed: { min: 0.5, max: 1.1 },
        },

        // mouse parallax feel
        orbit: {
          enable: false,
        },

        // gives depth
        zIndex: {
          value: { min: 0, max: 100 },
          opacityRate: 0.6,
          sizeRate: 1.0,
          velocityRate: 1.0,
        },

        shape: { type: "circle" },
      },

      // subtle parallax (feels premium)
      motion: {
        disable: false,
        reduce: { factor: 3, value: true },
      },
    }),
    []
  );

  return <Particles id="tsparticles" init={init} options={options} />;
}
