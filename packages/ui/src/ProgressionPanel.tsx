import React from "react";
import type { GameState, ReputationTierId } from "@the-oracle/core";
import { selectCurrentAge } from "@the-oracle/core";

const REPUTATION_TIER_LABELS: Record<ReputationTierId, string> = {
  obscure: "Obscure",
  recognized: "Recognized",
  revered: "Revered",
  panhellenic: "Panhellenic",
};

const REPUTATION_TIER_ORDER: ReputationTierId[] = [
  "obscure",
  "recognized",
  "revered",
  "panhellenic",
];

const BUILDING_MILESTONES = [10, 20, 30];

function getCampaignPhase(year: number): { label: string; id: string } {
  if (year <= 3) return { label: "Early", id: "early" };
  if (year <= 8) return { label: "Mid", id: "mid" };
  return { label: "Late", id: "late" };
}

export function ProgressionPanel({ state }: { state: GameState }) {
  const currentAge = selectCurrentAge(state);
  const campaign = state.campaign;
  const reputation = campaign.reputation;
  const year = state.clock.year;
  const phase = getCampaignPhase(year);

  const currentTierIdx = REPUTATION_TIER_ORDER.indexOf(reputation.currentTier);
  const nextTier = reputation.nextTier;
  const nextThreshold = nextTier ? reputation.thresholds[nextTier] : undefined;
  const currentThreshold = reputation.thresholds[reputation.currentTier] ?? 0;

  const repProgress =
    nextThreshold !== undefined && nextThreshold > currentThreshold
      ? ((reputation.score - currentThreshold) / (nextThreshold - currentThreshold)) * 100
      : currentTierIdx === REPUTATION_TIER_ORDER.length - 1
        ? 100
        : 0;

  const milestones = campaign.milestones;
  const buildingCount = state.buildings.filter(
    (b) => !((b.constructionWork ?? 0) > 0 && (b.constructionProgress ?? 0) < (b.constructionWork ?? 0)),
  ).length;

  const completedFactionTrust = milestones?.factionTrustMilestones ?? [];
  const completedAgeMilestones = milestones?.ageMilestones ?? [];

  return (
    <>
      {/* Campaign Phase */}
      <div className="sidebar-block">
        <div className="section-title">Campaign Progress</div>
        <div className="priest-row">
          <div className="priest-row-header">
            <span className="priest-row-name">Phase</span>
            <span className={`oracle-inline-chip progression-phase-badge progression-phase-${phase.id}`}>
              {phase.label}
            </span>
          </div>
          <div className="priest-politics-meters">
            <div className="priest-politics-meter">
              <span className="priest-politics-meter-label">Year</span>
              <strong>{year}</strong>
            </div>
            <div className="priest-politics-meter">
              <span className="priest-politics-meter-label">Age</span>
              <strong>{currentAge.name}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Reputation */}
      <div className="sidebar-block">
        <div className="section-title">Reputation</div>
        <div className="priest-row">
          <div className="priest-row-header">
            <span className="priest-row-name">
              {REPUTATION_TIER_LABELS[reputation.currentTier]}
            </span>
            <span className="text-xs text-dim">
              Score: {Math.round(reputation.score)}
            </span>
          </div>
          <div className="condition-bar-track">
            <div
              className="condition-bar-fill"
              style={{ width: `${Math.max(0, Math.min(100, repProgress))}%` }}
            />
          </div>
          {nextTier ? (
            <div className="text-xs text-dim" style={{ marginTop: 2 }}>
              Next: {REPUTATION_TIER_LABELS[nextTier]} (at {nextThreshold})
            </div>
          ) : (
            <div className="text-xs text-dim" style={{ marginTop: 2 }}>
              Maximum tier reached
            </div>
          )}
        </div>
      </div>

      {/* Milestones */}
      <div className="sidebar-block">
        <div className="section-title">Milestones</div>

        {/* Building milestones */}
        <div className="text-xs text-dim" style={{ marginBottom: 4 }}>Buildings</div>
        {BUILDING_MILESTONES.map((target) => {
          const reached = buildingCount >= target;
          return (
            <div key={target} className="milestone-row">
              <span className={reached ? "milestone-check" : "milestone-pending"}>
                {reached ? "\u2713" : "\u25CB"}
              </span>
              <span className="text-xs">
                {target} buildings constructed
              </span>
            </div>
          );
        })}

        {/* Faction trust milestones */}
        {completedFactionTrust.length > 0 ? (
          <>
            <div className="text-xs text-dim" style={{ marginTop: 8, marginBottom: 4 }}>
              Faction Trust
            </div>
            {completedFactionTrust.map((m) => (
              <div key={m} className="milestone-row">
                <span className="milestone-check">{"\u2713"}</span>
                <span className="text-xs">{m}</span>
              </div>
            ))}
          </>
        ) : null}

        {/* Age milestones */}
        {completedAgeMilestones.length > 0 ? (
          <>
            <div className="text-xs text-dim" style={{ marginTop: 8, marginBottom: 4 }}>
              Ages Witnessed
            </div>
            {completedAgeMilestones.map((m) => (
              <div key={m} className="milestone-row">
                <span className="milestone-check">{"\u2713"}</span>
                <span className="text-xs">{m}</span>
              </div>
            ))}
          </>
        ) : null}
      </div>

      {/* Special Events */}
      {(campaign.grandConsultationActive || campaign.sacredPilgrimage) ? (
        <div className="sidebar-block">
          <div className="section-title">Special Events</div>
          {campaign.grandConsultationActive ? (
            <div className="priest-row">
              <div className="priest-row-header">
                <span className="priest-row-name">Grand Consultation</span>
                <span className="oracle-inline-chip">Active</span>
              </div>
            </div>
          ) : null}
          {campaign.sacredPilgrimage ? (
            <div className="priest-row">
              <div className="priest-row-header">
                <span className="priest-row-name">Sacred Pilgrimage</span>
                <span className="oracle-inline-chip">In Progress</span>
              </div>
              <div className="text-xs text-dim">
                Returns day {campaign.sacredPilgrimage.returnDay}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Win Conditions */}
      <div className="sidebar-block">
        <div className="section-title">Victory</div>
        <div className="priest-row">
          <div className="priest-row-header">
            <span className="priest-row-name">{campaign.winCondition.label}</span>
            <span className={`oracle-inline-chip ${campaign.winCondition.completed ? "milestone-check" : ""}`}>
              {campaign.winCondition.completed ? "Complete" : "In Progress"}
            </span>
          </div>
          {campaign.winCondition.summary ? (
            <div className="campaign-copy text-xs">{campaign.winCondition.summary}</div>
          ) : null}

          {/* Sub-indicators */}
          <div style={{ marginTop: 6 }}>
            <div className="milestone-row">
              <span className={currentTierIdx >= 2 ? "milestone-check" : "milestone-pending"}>
                {currentTierIdx >= 2 ? "\u2713" : "\u25CB"}
              </span>
              <span className="text-xs">
                Reputation: {REPUTATION_TIER_LABELS[reputation.currentTier]}
              </span>
            </div>
            <div className="milestone-row">
              <span className={campaign.treasury.completed > 0 ? "milestone-check" : "milestone-pending"}>
                {campaign.treasury.completed > 0 ? "\u2713" : "\u25CB"}
              </span>
              <span className="text-xs">
                Treasury Dedications: {campaign.treasury.completed}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
