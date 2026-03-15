import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Monitor, Moon, Palette, Sparkles, Sun } from "lucide-react";

function useSpring(target, { stiffness = 0.22, damping = 0.8, precision = 0.08 } = {}) {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  const velocityRef = useRef(0);
  const frameRef = useRef(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);

    const tick = () => {
      const delta = target - valueRef.current;
      const velocity = (velocityRef.current + delta * stiffness) * damping;
      const next = valueRef.current + velocity;

      if (Math.abs(delta) < precision && Math.abs(velocity) < precision) {
        velocityRef.current = 0;
        valueRef.current = target;
        setValue(target);
        frameRef.current = null;
        return;
      }

      velocityRef.current = velocity;
      valueRef.current = next;
      setValue(next);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, damping, precision, stiffness]);

  return value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeMap(size, painter) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  const imageData = context.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const nx = x / (size - 1) - 0.5;
      const ny = y / (size - 1) - 0.5;
      const dist = Math.sqrt(nx * nx + ny * ny) / 0.70710678118;
      painter(data, nx, ny, dist, index);
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

function useLiquidMaps(enabled) {
  const [maps, setMaps] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setMaps(null);
      return;
    }

    const displacementMap = makeMap(128, (data, nx, ny, dist, index) => {
      const falloff = clamp(1 - dist, 0, 1);
      const bulge = Math.pow(falloff, 1.5);
      data[index] = clamp(128 + nx * bulge * 164, 0, 255);
      data[index + 1] = clamp(128 + ny * bulge * 164, 0, 255);
      data[index + 2] = clamp(148 + bulge * 82, 0, 255);
      data[index + 3] = 255;
    });

    const specularMap = makeMap(128, (data, nx, ny, dist, index) => {
      const falloff = clamp(1 - dist, 0, 1);
      const hx = -0.62;
      const hy = -0.75;
      const highlight = clamp((1 - Math.abs(nx - hx) * 1.35) * (1 - Math.abs(ny - hy) * 1.7), 0, 1);
      const sheen = Math.pow(highlight, 2.2) * 255 * falloff;
      const edge = Math.pow(falloff, 0.72) * 90;
      const value = clamp(edge + sheen, 0, 255);
      const alpha = clamp((edge * 0.55 + sheen) * 1.05, 0, 255);
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = alpha;
    });

    if (!displacementMap || !specularMap) {
      setMaps(null);
      return;
    }

    setMaps({ displacementMap, specularMap });
  }, [enabled]);

  return maps;
}

function supportsLiquidGlass() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isEdge = /Edg\//.test(ua);
  const isChrome = /Chrome\//.test(ua) || /Chromium\//.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  const isSafari = /Safari\//.test(ua) && !isChrome && !isEdge;
  const chromium = (isChrome || isEdge) && !isFirefox && !isSafari;
  const hasSvgFilters = typeof window.SVGFEColorMatrixElement !== "undefined";
  const hasBackdropFilter =
    typeof CSS !== "undefined" &&
    (CSS.supports("backdrop-filter: blur(1px)") || CSS.supports("-webkit-backdrop-filter: blur(1px)"));
  return chromium && hasSvgFilters && hasBackdropFilter;
}

function LiquidFilterDefs({ filterId, displacementMap }) {
  return (
    <svg aria-hidden style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}>
      <defs>
        <filter id={filterId} x="-30%" y="-160%" width="160%" height="320%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.35" result="source-blur" />
          <feImage href={displacementMap} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="disp-map" />
          <feDisplacementMap in="source-blur" in2="disp-map" scale="22" xChannelSelector="R" yChannelSelector="G" result="displaced" />
          <feGaussianBlur in="displaced" stdDeviation="0.18" result="smoothed" />
          <feColorMatrix in="smoothed" type="saturate" values="1.2" result="saturated" />
          <feComposite in="saturated" in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export default function ProfileAppearanceLiquidGlassPrototype() {
  const [theme, setTheme] = useState("system");
  const [liquidEnabled, setLiquidEnabled] = useState(false);
  const filterId = useId().replace(/:/g, "-");
  const containerRef = useRef(null);
  const buttonRefs = useRef({ light: null, dark: null, system: null });
  const [targetMetrics, setTargetMetrics] = useState({ left: 0, width: 0 });
  const maps = useLiquidMaps(liquidEnabled);

  useEffect(() => {
    setLiquidEnabled(supportsLiquidGlass());
  }, []);

  const measure = React.useCallback(() => {
    const container = containerRef.current;
    const activeButton = buttonRefs.current[theme];
    if (!container || !activeButton) return;
    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    setTargetMetrics({
      left: buttonRect.left - containerRect.left,
      width: buttonRect.width,
    });
  }, [theme]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(measure);
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", measure);
      };
    }

    const observer = new ResizeObserver(() => measure());
    if (containerRef.current) observer.observe(containerRef.current);
    OPTIONS.forEach((option) => {
      const button = buttonRefs.current[option.value];
      if (button) observer.observe(button);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measure]);

  const springLeft = useSpring(targetMetrics.left);
  const springWidth = useSpring(targetMetrics.width, { stiffness: 0.24 });
  const previewDark = theme === "dark";
  const previewLabel = theme === "system" ? "System appearance" : `${theme.charAt(0).toUpperCase()}${theme.slice(1)} mode`;
  const highlightStyle = useMemo(() => {
    if (!maps?.specularMap) return undefined;
    return {
      backgroundImage: `url(${maps.specularMap})`,
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    };
  }, [maps?.specularMap]);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", padding: "48px 24px", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" }}>
      <div style={{ margin: "0 auto", width: "100%", maxWidth: 1080 }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: "rgba(17,24,39,0.48)" }}>
            Temporary prototype
          </p>
          <h1 style={{ margin: "10px 0 0", display: "flex", alignItems: "center", gap: 12, fontSize: 34, lineHeight: 1.1 }}>
            <Palette size={28} />
            Profile Appearance
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 720, color: "rgba(17,24,39,0.64)", lineHeight: 1.6 }}>
            Isolated liquid-glass selector prototype rebuilt from the Vue research mechanics. No app tokens or route state are used here.
          </p>
        </div>

        <div style={{ border: "1px solid rgba(15,23,42,0.08)", borderRadius: 28, background: "rgba(255,255,255,0.76)", padding: 24, boxShadow: "0 20px 50px -32px rgba(15,23,42,0.28)" }}>
          <div style={{ position: "relative", overflow: "hidden", borderRadius: 26, border: previewDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(15,23,42,0.08)", background: previewDark ? "#09090b" : "#fbfbfd", color: previewDark ? "#fff" : "#111827", padding: 20 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: previewDark
                  ? "radial-gradient(circle at 18% 12%, rgba(255,255,255,0.08), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))"
                  : "radial-gradient(circle at 18% 12%, rgba(255,255,255,0.92), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.45), rgba(255,255,255,0))",
              }}
            />
            <div style={{ position: "relative", display: "grid", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: previewDark ? "rgba(255,255,255,0.55)" : "rgba(17,24,39,0.45)" }}>
                    Preview
                  </p>
                  <h2 style={{ margin: "10px 0 0", display: "flex", alignItems: "center", gap: 10, fontSize: 20 }}>
                    <Monitor size={18} />
                    {previewLabel}
                  </h2>
                </div>
                <div style={{ borderRadius: 999, border: previewDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.1)", background: previewDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.72)", padding: "8px 12px", fontSize: 13, color: previewDark ? "rgba(255,255,255,0.78)" : "rgba(17,24,39,0.68)" }}>
                  {theme}
                </div>
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1.15fr 0.85fr" }}>
                <div style={{ overflow: "hidden", borderRadius: 22, border: previewDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(15,23,42,0.08)", background: previewDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.78)", padding: 16 }}>
                  <div style={{ height: 32, marginBottom: 16, borderRadius: 999, border: previewDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(15,23,42,0.08)", background: previewDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.92)" }} />
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 64, borderRadius: 18, border: previewDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(15,23,42,0.08)", background: previewDark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.025)" }} />
                    <div style={{ width: 96, height: 64, borderRadius: 18, border: previewDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(15,23,42,0.08)", background: previewDark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.025)" }} />
                  </div>
                  <div style={{ height: 40, borderRadius: 16, border: previewDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(15,23,42,0.08)", background: previewDark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.025)" }} />
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ borderRadius: 22, border: previewDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(15,23,42,0.08)", background: previewDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.78)", padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
                      {previewDark ? <Moon size={16} /> : <Sun size={16} />}
                      Reading contrast
                    </div>
                    <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: previewDark ? "rgba(255,255,255,0.62)" : "rgba(17,24,39,0.58)" }}>
                      This is only a visual lab for the selector mechanics, not a final product surface.
                    </p>
                  </div>
                  <div style={{ borderRadius: 22, border: previewDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(15,23,42,0.08)", background: previewDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.78)", padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
                      <Sparkles size={16} />
                      Liquid mechanics
                    </div>
                    <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: previewDark ? "rgba(255,255,255,0.62)" : "rgba(17,24,39,0.58)" }}>
                      SVG displacement, specular highlights, and spring movement are isolated here before any app integration.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            {liquidEnabled && maps?.displacementMap ? <LiquidFilterDefs filterId={filterId} displacementMap={maps.displacementMap} /> : null}
            <div
              ref={containerRef}
              style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 28,
                border: "1px solid rgba(15,23,42,0.08)",
                background: "rgba(255,255,255,0.58)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                padding: 6,
                boxShadow: "0 20px 48px -28px rgba(15,23,42,0.28)",
              }}
            >
              <div
                aria-hidden
                style={{
                  pointerEvents: "none",
                  position: "absolute",
                  top: 6,
                  left: 6,
                  height: "calc(100% - 12px)",
                  width: springWidth,
                  transform: `translate3d(${springLeft}px, 0, 0)`,
                  borderRadius: 22,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    height: "100%",
                    overflow: "hidden",
                    borderRadius: 22,
                    border: "1px solid rgba(255,255,255,0.78)",
                    background: "rgba(255,255,255,0.74)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    boxShadow: "0 14px 36px -20px rgba(15,23,42,0.42)",
                    filter: liquidEnabled && maps?.displacementMap ? `url(#${filterId})` : undefined,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "radial-gradient(circle at 16% 12%, rgba(255,255,255,0.96), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0.14))",
                    }}
                  />
                  {highlightStyle ? <div style={{ position: "absolute", inset: 0, opacity: 0.55, mixBlendMode: "screen", ...highlightStyle }} /> : null}
                </div>
              </div>

              <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
                {OPTIONS.map((option) => {
                  const IconComponent = option.icon;
                  const active = option.value === theme;
                  return (
                    <button
                      key={option.value}
                      ref={(node) => {
                        buttonRefs.current[option.value] = node;
                      }}
                      type="button"
                      onClick={() => setTheme(option.value)}
                      style={{
                        minHeight: 48,
                        border: 0,
                        background: "transparent",
                        borderRadius: 22,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        padding: "12px 16px",
                        color: active ? "#111827" : "rgba(17,24,39,0.72)",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <IconComponent size={16} />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.6, color: "rgba(17,24,39,0.62)" }}>
              Fresh isolated prototype. This file does not depend on your app theme tokens, page layout primitives, or route state.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
