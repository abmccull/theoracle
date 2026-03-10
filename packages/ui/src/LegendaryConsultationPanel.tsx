import type { GameState } from "@the-oracle/core";
import {
  selectAvailableLegendaryConsultations,
  selectLegendaryProgress
} from "@the-oracle/core";
import React from "react";

import { useGameDispatch } from "./GameDispatchContext";

export function LegendaryConsultationPanel({ state }: { state: GameState }) {
  const {
    onBeginLegendaryConsultation,
    onAdvanceLegendaryStage
  } = useGameDispatch();

  const available = selectAvailableLegendaryConsultations(state);
  const { inProgress, completed } = selectLegendaryProgress(state);

  if (available.length === 0 && inProgress.length === 0 && completed.length === 0) {
    return (
      <div className="sidebar-block">
        <div className="section-title">Legendary Consultations</div>
        <div className="text-sm text-dim text-italic">
          No legendary figures have sought the oracle yet. They will come as the oracle's renown grows.
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar-block">
      <div className="section-title">Legendary Consultations</div>

      {/* In-progress consultations */}
      {inProgress.map(({ def, progress }) => {
        const currentStage = def.stages[progress.currentStage];
        return (
          <div key={def.id} className="envoy-card legendary-card mb-2" data-figure={def.figure.toLowerCase().replace(/\s+/g, "-")}>
            <div className="flex-between">
              <strong className="text-gold">{def.figure}</strong>
              <div className="legendary-progress-dots">
                {def.stages.map((_, i) => (
                  <span key={i} className={`legendary-dot ${i < progress.currentStage ? "complete" : i === progress.currentStage ? "current" : "locked"}`} />
                ))}
              </div>
            </div>
            <div className="text-xs text-dim mb-1">
              {def.name}
            </div>
            {currentStage ? (
              <>
                <p className="text-sm legendary-stage-prompt">
                  {currentStage.prompt}
                </p>
                <div className="advisor-banner info text-xs mb-2">
                  {currentStage.hint}
                </div>
                {currentStage.depthRequirement ? (
                  <div className="legendary-gate text-xs">
                    Requires {currentStage.depthRequirement} depth prophecy
                  </div>
                ) : null}
              </>
            ) : null}
            <button
              className="oracle-button gold mt-2"
              onClick={() => onAdvanceLegendaryStage(def.id)}
              type="button"
            >
              Complete Stage
            </button>
          </div>
        );
      })}

      {/* Available (not started) consultations */}
      {available
        .filter(({ progress }) => !progress)
        .map(({ def }) => (
          <div key={def.id} className="envoy-card mb-2">
            <div className="flex-between">
              <strong>{def.figure}</strong>
              <span className="text-xs text-dim">
                {def.stages.length} {def.stages.length === 1 ? "stage" : "stages"}
              </span>
            </div>
            <div className="text-xs text-dim">
              {def.name}
            </div>
            <p className="text-sm legendary-desc">
              {def.description}
            </p>
            <div className="text-xs text-dim mb-1">
              Reward: +{def.reward.goldBonus} gold, +{def.reward.reputationBonus} reputation, +{def.reward.credibilityBonus} credibility
              {def.reward.specialEffect ? ` (${def.reward.specialEffect.replace(/_/g, " ")})` : ""}
            </div>
            <button
              className="oracle-button"
              onClick={() => onBeginLegendaryConsultation(def.id)}
              type="button"
            >
              Begin Consultation
            </button>
          </div>
        ))}

      {/* Completed consultations */}
      {completed.length > 0 ? (
        <>
          <div className="section-title mt-2">Completed</div>
          {completed.map(({ def, progress }) => (
            <div key={def.id} className="history-row opacity-80">
              <strong>{def.figure}</strong>
              <span className="text-xs text-dim">
                {def.name} — Day {progress.completedDay ?? progress.startDay}
              </span>
              <span className="text-xs">
                +{def.reward.goldBonus}g, +{def.reward.reputationBonus} rep, +{def.reward.credibilityBonus} cred
              </span>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
