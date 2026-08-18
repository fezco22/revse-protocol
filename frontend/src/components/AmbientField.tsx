"use client";

import { useEffect, useRef } from "react";

/**
 * A quiet, full-viewport 3D backdrop for the app pages: a slow-drifting field
 * of faint mint + ink points that adds depth behind the ledger UI without
 * competing with it. Fixed, non-interactive, sits behind all content.
 *
 * Vanilla three.js behind a dynamic import (never runs during SSR). Honors
 * prefers-reduced-motion with a single static frame. Cleans up fully.
 */
export function AmbientField() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let raf = 0;
    let disposed = false;
    let cleanup: () => void = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed || !mount) return;

      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      const width = window.innerWidth;
      const height = window.innerHeight;

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0a0b0d, 0.03);

      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
      camera.position.set(0, 0, 16);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(width, height, false);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";

      // Build a point cloud in a wide, shallow box around the camera.
      const makeLayer = (
        count: number,
        color: number,
        size: number,
        opacity: number,
        spread: [number, number, number]
      ) => {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          pos[i * 3] = (Math.random() - 0.5) * spread[0];
          pos[i * 3 + 1] = (Math.random() - 0.5) * spread[1];
          pos[i * 3 + 2] = (Math.random() - 0.5) * spread[2];
        }
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
          color,
          size,
          sizeAttenuation: true,
          transparent: true,
          opacity,
          depthWrite: false,
        });
        const pts = new THREE.Points(geo, mat);
        scene.add(pts);
        return { geo, mat, pts };
      };

      // Dim ink dust for depth, plus a sparser mint layer for the accent.
      const ink = makeLayer(620, 0x5f5d63, 0.05, 0.5, [46, 30, 26]);
      const mint = makeLayer(150, 0x4de3a1, 0.07, 0.7, [46, 28, 24]);

      const render = (t: number) => {
        const time = t * 0.00006;
        ink.pts.rotation.y = time * 0.6;
        ink.pts.rotation.x = Math.sin(time * 0.3) * 0.05;
        mint.pts.rotation.y = -time * 0.8;
        mint.pts.rotation.x = Math.cos(time * 0.25) * 0.05;
        renderer.render(scene, camera);
      };

      const onResize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      window.addEventListener("resize", onResize);

      if (reduce) {
        render(2000);
      } else {
        const loop = (t: number) => {
          render(t);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      }

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        ink.geo.dispose();
        ink.mat.dispose();
        mint.geo.dispose();
        mint.mat.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
