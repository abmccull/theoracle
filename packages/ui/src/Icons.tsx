import React from "react";

type IconProps = {
  name: string;
  size?: number;
  className?: string;
};

// Each icon is a 24x24 viewBox SVG path
// Greek black-figure pottery style: filled silhouettes, geometric shapes
const ICON_PATHS: Record<string, string> = {
  // Resources
  gold: "M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.18L18.36 7.5 12 10.82 5.64 7.5 12 4.18z",
  grain: "M12 2c-1 3-3 5-3 8s1.34 5 3 5 3-2 3-5-2-5-3-8zm-4 10c-1 2-2 4-2 6h2c0-1.5.5-3 1.5-4.5L9.5 12zm8 0l-.5 1.5c1 1.5 1.5 3 1.5 4.5h2c0-2-1-4-2-6z",
  incense: "M12 2v4m0 0c-2 2-3 4-3 6 0 3 1.5 5 3 8 1.5-3 3-5 3-8 0-2-1-4-3-6zm-1-1c-1.5 1-4 2-5 4s0 4 1 5m8-9c1.5 1 4 2 5 4s0 4-1 5",
  bread: "M4 14c0-2 1-4 3-5s5-1 7 0 3 3 3 5v2c0 1-1 2-2 2H6c-1 0-2-1-2-2v-2zm2-1c0-1.5 2-3 6-3s6 1.5 6 3",
  olive_oil: "M10 2h4v3h-4zm-1 3h6l1 4v10c0 1-1 2-2 2H8c-1 0-2-1-2-2V9l1-4zm2 6v6m-2-3h4",
  sacred_water: "M12 2c-4 6-7 9-7 13a7 7 0 0014 0c0-4-3-7-7-13zm-2 12c-1 0-2-1-2-3",
  knowledge: "M4 3h16v2H4zm2 4h12v12H6zm2 2v8h8V9zm1 1h6v2H9zm0 3h4v1H9z",
  laurel: "M12 22V8m-6 2c2-3 5-4 6-8 1 4 4 5 6 8M6 14c1 2 3 3 6 3s5-1 6-3",
  planks: "M3 6h18v3H3zm0 5h18v3H3zm0 5h18v3H3z",
  cut_stone: "M4 8l4-4h8l4 4v8l-4 4H8l-4-4V8zm4 0h8v8H8V8z",
  sacred_animals: "M18 6c-1-2-3-3-5-3-1 0-2 .5-3 1.5C9 3.5 8 3 7 3 5 3 3 4 2 6c-2 4 1 8 8 13h4c7-5 10-9 8-13z",
  olives: "M12 2C8 2 5 5 5 9c0 3 2 5 4 6v5h6v-5c2-1 4-3 4-6 0-4-3-7-7-7zm-2 7a2 2 0 114 0 2 2 0 01-4 0z",
  papyrus: "M6 2c-1 0-2 1-2 2v16c0 1 1 2 2 2h12c1 0 2-1 2-2V8l-6-6H6zm8 0v6h6M8 12h8m-8 3h6",
  scrolls: "M7 2C5 2 4 3 4 5v14c0 2 1 3 3 3h1V4h8v18h1c2 0 3-1 3-3V5c0-2-1-3-3-3H7zm2 6h6m-6 3h6m-6 3h4",

  // Building categories
  road: "M4 4h4v16H4zm12 0h4v16h-4zM8 4h8v4H8zm0 8h8v4H8z",
  sacred: "M12 2l-2 6H4l5 4-2 6 5-4 5 4-2-6 5-4h-6z",
  quarters: "M3 10l9-7 9 7v11H3V10zm4 11V12h10v9",
  storage: "M4 10h16v10H4zm2-4h12l2 4H4z",
  production: "M12 2v4l4 2v4l-4 2v4l-4-2v-4L4 8V4z",
  trade: "M2 12h4l3-4 3 8 3-8 3 4h4",
  hospitality: "M8 4h8v2H8zm-2 4h12v2H6zm-2 4h16v8H4z",

  // Overlay icons
  oracle: "M12 2C7 2 3 6 3 11c0 3 2 6 5 7v4h8v-4c3-1 5-4 5-7 0-5-4-9-9-9zm0 4a2 2 0 110 4 2 2 0 010-4z",
  world: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 016.32 3.1A12 12 0 0012 6a12 12 0 00-6.32 1.1A8 8 0 0112 4z",
  stores: "M4 6h16l-2 10H6L4 6zm0-2h16v2H4zm4 12h8v4H8z",
  priests: "M12 2a3 3 0 100 6 3 3 0 000-6zM8 10h8c2 0 3 1 3 3v9H5v-9c0-2 1-3 3-3z",
  espionage: "M12 4.5A11.8 11.8 0 002 12a11.8 11.8 0 0010 7.5A11.8 11.8 0 0022 12 11.8 11.8 0 0012 4.5zM12 17a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z",
  record: "M6 2h12v20H6zm2 4h8m-8 3h8m-8 3h5",
  legacy: "M12 2l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z",
  lineage: "M12 2v6m-5-3l5 3 5-3M7 11v6m10-6v6M4 20h16",

  // Seasons
  spring: "M12 8a4 4 0 100 8 4 4 0 000-8zm0-6v4m0 12v4m-8-10H0m24 0h-4m-2.34-5.66l-2.83 2.83m-5.66 5.66l-2.83 2.83",
  summer: "M12 2v2m0 16v2m-8-10H4m16 0h-2m-1.17-6.83l-1.42 1.42M7.76 16.24l-1.42 1.42m0-11.32l1.42 1.42m8.48 8.48l1.42 1.42M12 7a5 5 0 100 10 5 5 0 000-10z",
  autumn: "M17 8c-4 0-6 3-6 6 0-4-2-8-6-8 0 5 2 8 6 10-3 2-6 1-8 0 3 3 7 3 10 0 3 3 7 3 10 0-2 1-5 2-8 0 4-2 6-5 6-10-4 0-6 4-6 8 0-3-2-6-6-6z",
  winter: "M12 2v20M4.93 4.93l14.14 14.14M2 12h20M4.93 19.07L19.07 4.93m-3.54 1.46L12 9.07 8.47 5.54M18.46 8.47L15.93 12l2.53 3.54M15.53 18.46L12 14.93l-3.54 3.53M5.54 15.53L8.07 12 5.54 8.47",

  // UI
  pause: "M6 4h4v16H6zm8 0h4v16h-4z",
  play: "M5 3l14 9-14 9V3z",
  speed_1x: "M8 5v14l8-7z",
  speed_2x: "M5 5v14l7-7zm7 0v14l7-7z",
  speed_3x: "M3 5v14l5-7zm6 0v14l5-7zm6 0v14l5-7z",
  save: "M5 3h14l2 2v14l-2 2H5l-2-2V5l2-2zm4 0v6h6V3zm1 10a2 2 0 104 0 2 2 0 00-4 0z",
  close: "M18 6L6 18M6 6l12 12",
  help: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 15a1 1 0 110 2 1 1 0 010-2zm1-2h-2v-1c0-2 3-2 3-4a2 2 0 00-4 0H8a4 4 0 118 0c0 2-3 3-3 5z",
  arrow_up: "M12 4l-8 8h5v8h6v-8h5z",
  arrow_down: "M12 20l8-8h-5V4h-6v8H4z",
  arrow_right: "M4 11h12l-5-5 1.4-1.4L19.8 12l-7.4 7.4L11 18l5-5H4v-2z",
  select: "M4 4l7 18 3-7 7-3z",
  minimap: "M3 3h18v18H3zm2 2v14h14V5zm3 3h8v8H8z",
  alert: "M12 2L1 21h22L12 2zm0 14a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm-1-7h2v5h-2z",
  lock: "M12 2a5 5 0 00-5 5v3H6v10h12V10h-1V7a5 5 0 00-5-5zm-3 5a3 3 0 016 0v3H9V7zm3 7a1.5 1.5 0 110 3 1.5 1.5 0 010-3z",
  temple: "M12 2l-1 3h-1L3 8v1h18V8l-7-3h-1l-1-3zm-8 9v8h2v-8zm4 0v8h2v-8zm4 0v8h2v-8zm4 0v8h2v-8zM2 20h20v2H2z",
  carrier: "M3 12h2l2-4h10l2 4h2v4h-2v-1H5v1H3v-4zm4 0h10l-1.5-3h-7L7 12zm-1 5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm12 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z",
  strain: "M12 2L1 21h22L12 2zm-1 7h2v6h-2zm0 7h2v2h-2z",
  globe: "M12 2a10 10 0 100 20 10 10 0 000-20zM2.05 12H7a18 18 0 00.5 4H3.2a10 10 0 01-.15-4zm.15-4h4.3A18 18 0 007 12H2.05a10 10 0 01.15-4zM12 20c-1.5 0-3-3-3.5-8h7c-.5 5-2 8-3.5 8zm3.5-8h-7c.5-5 2-8 3.5-8s3 3 3.5 8zM20.8 8h-4.3a18 18 0 01.5 4h4.95a10 10 0 00-.15-4zm-4.3 8a18 18 0 01-.5-4h4.95a10 10 0 01.15 4h-4.6z",
  chevron_right: "M9 6l6 6-6 6",

  // Trend arrows (geometric, Greek-inspired)
  trend_up: "M12 4l7 7h-4v9h-6v-9H5l7-7z",
  trend_down: "M12 20l-7-7h4V4h6v9h4l-7 7z",
  trend_flat: "M12 6l6 6-6 6-6-6 6-6z",
};

export const Icon = React.memo(function Icon({ name, size = 16, className }: IconProps) {
  const path = ICON_PATHS[name];
  if (!path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
});

export const ICON_NAMES = Object.keys(ICON_PATHS);
