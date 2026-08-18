"use client";

import { useEffect, useRef } from "react";
import type * as THREE from "three";

/**
 * An abstract, on-brand 3D "rate surface": a wireframe grid whose vertices
 * travel in layered sine waves - a quiet visual metaphor for the VAMM's
 * interest-rate curve. Thin mint lines on carbon, one authored motion.
 *
 * Vanilla three.js (no react-three-fiber) kept behind a dynamic import so it
 * never runs during SSR. Honors prefers-reduced-motion by rendering a single
 * static frame. Cleans up geometry, material, renderer, and the RAF on unmount.
 */
export function RateSurface() {
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

      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
      camera.position.set(0, 3.1, 6.4);
      camera.lookAt(0, -0.35, 0);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setSize(width, height, false);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";

      // Wide grid tilted into the distance so waves recede to a horizon.
      const SEG = 48;
      const geo = new THREE.PlaneGeometry(14, 9, SEG, SEG);
      geo.rotateX(-Math.PI / 2.15);

      const base = (geo.attributes.position.array as Float32Array).slice();

      const lineMat = new THREE.MeshBasicMaterial({
        color: 0x4de3a1,
        wireframe: true,
        transparent: true,
        opacity: 0.26,
      });
      const mesh = new THREE.Mesh(geo, lineMat);
      scene.add(mesh);

      // A faint second layer, offset and dimmer, adds depth without noise.
      const geo2 = geo.clone();
      const mat2 = new THREE.MeshBasicMaterial({
        color: 0x2a9d6d,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
      });
      const mesh2 = new THREE.Mesh(geo2, mat2);
      mesh2.position.y = -0.14;
      scene.add(mesh2);

      const base2 = (geo2.attributes.position.array as Float32Array).slice();

      const wave = (
        target: THREE.BufferGeometry,
        src: Float32Array,
        t: number
      ) => {
        const pos = target.attributes.position.array as Float32Array;
        for (let i = 0; i < pos.length; i += 3) {
          const x = src[i];
          const z = src[i + 2];
          const y =
            Math.sin(x * 0.55 + t) * 0.42 +
            Math.sin(z * 0.7 - t * 0.8) * 0.34 +
            Math.sin((x + z) * 0.32 + t * 0.5) * 0.22;
          pos[i + 1] = src[i + 1] + y;
        }
        target.attributes.position.needsUpdate = true;
      };

      const render = (t: number) => {
        const time = t * 0.00042;
        wave(geo, base, time);
        wave(geo2, base2, time + 0.6);
        mesh.rotation.z = Math.sin(time * 0.15) * 0.04;
        mesh2.rotation.z = mesh.rotation.z;
        renderer.render(scene, camera);
      };

      const onResize = () => {
        if (!mount) return;
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(mount);

      if (reduce) {
        render(1400);
      } else {
        const loop = (t: number) => {
          render(t);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      }

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        geo.dispose();
        geo2.dispose();
        lineMat.dispose();
        mat2.dispose();
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
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
