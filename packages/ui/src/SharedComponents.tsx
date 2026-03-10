import React from "react";
import { Icon } from "./Icons";

export function CredibilityPips({ value }: { value: number }) {
  const filled = Math.round(Math.min(5, (value / 20) * 5));
  return (
    <span className="credibility-pips">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`pip ${i < filled ? "filled" : "empty"}`} />
      ))}
    </span>
  );
}

export function trendArrow(trend: number) {
  if (trend > 0.01) return <span className="trend-arrow up" title={`+${trend.toFixed(2)}/tick`}><Icon name="trend_up" size={10} /></span>;
  if (trend < -0.01) return <span className="trend-arrow down" title={`${trend.toFixed(2)}/tick`}><Icon name="trend_down" size={10} /></span>;
  return <span className="trend-arrow flat"><Icon name="trend_flat" size={10} /></span>;
}
