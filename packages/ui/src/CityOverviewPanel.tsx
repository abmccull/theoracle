import React from "react";
import type { GameState, CityTier } from "@the-oracle/core";
import { selectCityProsperity, selectVisitorStatus } from "@the-oracle/core";

const TIER_LABELS: Record<CityTier, string> = {
  village: "Village",
  town: "Town",
  city: "City",
  panhellenic_center: "Panhellenic Center",
};

const TIER_THRESHOLDS: Record<CityTier, number> = {
  village: 0,
  town: 25,
  city: 50,
  panhellenic_center: 75,
};

const TIER_ORDER: CityTier[] = ["village", "town", "city", "panhellenic_center"];

function getNextTier(current: CityTier): CityTier | undefined {
  const idx = TIER_ORDER.indexOf(current);
  return idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : undefined;
}

export function CityOverviewPanel({ state }: { state: GameState }) {
  const prosperity = selectCityProsperity(state);
  const visitors = selectVisitorStatus(state);
  const nextTier = getNextTier(prosperity.cityTier);
  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : 100;
  const currentThreshold = TIER_THRESHOLDS[prosperity.cityTier];
  const tierProgress =
    nextTier
      ? ((prosperity.prosperityScore - currentThreshold) / (nextThreshold - currentThreshold)) * 100
      : 100;

  return (
    <>
      {/* City Status Header */}
      <div className="sidebar-block">
        <div className="section-title">City of Delphi</div>
        <div className="priest-row">
          <div className="priest-row-header">
            <span className="priest-row-name">Status</span>
            <span className={`oracle-inline-chip city-tier-${prosperity.cityTier}`}>
              {TIER_LABELS[prosperity.cityTier]}
            </span>
          </div>
          <div className="priest-row-details">
            <span className="text-xs text-dim">Prosperity</span>
          </div>
          <div className="condition-bar-track prosperity-bar">
            <div
              className="condition-bar-fill prosperity-fill"
              style={{ width: `${Math.max(0, Math.min(100, prosperity.prosperityScore))}%` }}
            />
          </div>
          <div className="text-xs text-dim" style={{ marginTop: 2 }}>
            {Math.round(prosperity.prosperityScore)} / 100
          </div>
        </div>
      </div>

      {/* Visitor Economy */}
      <div className="sidebar-block">
        <div className="section-title">Visitor Economy</div>
        <div className="priest-politics-meters">
          <div className="priest-politics-meter">
            <span className="priest-politics-meter-label">Visitors</span>
            <strong>{Math.round(visitors.count)} / {visitors.capacity}</strong>
          </div>
          <div className="priest-politics-meter">
            <span className="priest-politics-meter-label">Satisfaction</span>
            <strong>{Math.round(visitors.satisfaction)}%</strong>
          </div>
        </div>
        <div style={{ marginTop: 6 }}>
          <div className="text-xs text-dim">Pilgrim Attraction</div>
          <div className="condition-bar-track">
            <div
              className="condition-bar-fill"
              style={{ width: `${Math.max(0, Math.min(100, prosperity.pilgrimAttraction))}%` }}
            />
          </div>
          <div className="text-xs text-dim" style={{ marginTop: 2 }}>
            {Math.round(prosperity.pilgrimAttraction)} / 100
          </div>
        </div>
      </div>

      {/* Revenue */}
      <div className="sidebar-block">
        <div className="section-title">Revenue</div>
        <div className="priest-politics-meters revenue-grid">
          <div className="priest-politics-meter">
            <span className="priest-politics-meter-label">Trade</span>
            <strong>{prosperity.tradeRevenue.toFixed(1)} gold/mo</strong>
          </div>
          <div className="priest-politics-meter">
            <span className="priest-politics-meter-label">Donations</span>
            <strong>{prosperity.donationRevenue.toFixed(1)} gold/mo</strong>
          </div>
        </div>
      </div>

      {/* Growth */}
      <div className="sidebar-block">
        <div className="section-title">Growth</div>
        <div className="priest-politics-meters">
          <div className="priest-politics-meter">
            <span className="priest-politics-meter-label">Growth Rate</span>
            <strong>
              {prosperity.growthRate > 0
                ? `+${(prosperity.growthRate * 100).toFixed(1)}%`
                : "Stagnant"}
            </strong>
          </div>
        </div>
        {nextTier ? (
          <div style={{ marginTop: 6 }}>
            <div className="text-xs text-dim">
              Next Tier: {TIER_LABELS[nextTier]} (at {nextThreshold} prosperity)
            </div>
            <div className="condition-bar-track">
              <div
                className="condition-bar-fill"
                style={{ width: `${Math.max(0, Math.min(100, tierProgress))}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="text-xs text-dim" style={{ marginTop: 6 }}>
            Maximum tier reached
          </div>
        )}
      </div>
    </>
  );
}
