import React, { useState } from "react";
import type { GameState } from "@the-oracle/core";
import { selectAvailableResearch, selectAutoSuggestResearch } from "@the-oracle/core";
import { techDefById } from "@the-oracle/content";
import { useGameDispatch } from "./GameDispatchContext";

// onSelectResearch will be added to GameDispatchActions when wired up
type ResearchDispatch = { onSelectResearch: (techId: string) => void };

const CATEGORY_LABELS: Record<string, string> = {
  construction: "Construction",
  ritual: "Ritual",
  economy: "Economy",
  knowledge: "Knowledge",
};

export function ResearchPanel({ state }: { state: GameState }) {
  const dispatch = useGameDispatch() as ReturnType<typeof useGameDispatch> & ResearchDispatch;
  const available = selectAvailableResearch(state);
  const suggestion = selectAutoSuggestResearch(state);
  const [expandedCompleted, setExpandedCompleted] = useState(false);

  const currentTechId = state.research?.activeTechId;
  const currentProgress = state.research?.activeTechProgress ?? 0;
  const completedIds = state.research?.completedTechIds ?? [];

  const currentTech = currentTechId ? techDefById[currentTechId] : undefined;

  return (
    <>
      {/* Current Research */}
      <div className="sidebar-block">
        <div className="section-title">Current Research</div>
        {currentTech ? (
          <div className="priest-row tech-card">
            <div className="priest-row-header">
              <span className="priest-row-name">{currentTech.name}</span>
              <span className="oracle-inline-chip">
                {CATEGORY_LABELS[currentTech.category] ?? currentTech.category}
              </span>
            </div>
            <div className="campaign-copy text-xs">{currentTech.description}</div>
            <div style={{ marginTop: 4 }}>
              <div className="text-xs text-dim">
                Progress: {Math.round(currentProgress)} / {currentTech.knowledgeCost} knowledge
              </div>
              <div className="condition-bar-track">
                <div
                  className="condition-bar-fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, (currentProgress / currentTech.knowledgeCost) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>
        ) : suggestion ? (
          <div className="priest-row tech-card">
            <div className="campaign-copy text-xs text-dim">
              No research in progress.
            </div>
            <div style={{ marginTop: 4 }}>
              <div className="priest-row-header">
                <span className="priest-row-name">{suggestion.name}</span>
                <span className="text-xs text-dim">
                  {suggestion.knowledgeCost} knowledge
                </span>
              </div>
              <div className="campaign-copy text-xs">{suggestion.description}</div>
              <button
                className="oracle-button text-xs"
                style={{ marginTop: 4 }}
                onClick={() => dispatch.onSelectResearch(suggestion.id)}
                type="button"
              >
                Start Research
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-dim">All technologies researched.</div>
        )}
      </div>

      {/* Available Research */}
      {available.length > 0 && !currentTech ? null : null}
      <div className="sidebar-block">
        <div className="section-title">
          Available Technologies
          <span className="text-xs text-dim" style={{ marginLeft: 6 }}>
            ({available.length})
          </span>
        </div>
        {available.length === 0 ? (
          <div className="text-sm text-dim">No new technologies available.</div>
        ) : (
          available.map((tech) => (
            <div key={tech.id} className="priest-row tech-card tech-card-available">
              <div className="priest-row-header">
                <span className="priest-row-name">{tech.name}</span>
                <span className="oracle-inline-chip">
                  {CATEGORY_LABELS[tech.category] ?? tech.category}
                </span>
              </div>
              <div className="priest-row-details">
                <span className="text-xs text-dim">{tech.knowledgeCost} knowledge</span>
              </div>
              <div className="campaign-copy text-xs">{tech.description}</div>
              {!currentTech ? (
                <button
                  className="oracle-button text-xs"
                  style={{ marginTop: 4 }}
                  onClick={() => dispatch.onSelectResearch(tech.id)}
                  type="button"
                >
                  Research
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {/* Completed Research */}
      {completedIds.length > 0 ? (
        <div className="sidebar-block">
          <div className="section-title">
            Completed
            <span className="text-xs text-dim" style={{ marginLeft: 6 }}>
              ({completedIds.length})
            </span>
          </div>
          <button
            className="oracle-button text-xs"
            onClick={() => setExpandedCompleted((prev) => !prev)}
            type="button"
            style={{ marginBottom: 6 }}
          >
            {expandedCompleted ? "Collapse" : "Expand"}
          </button>
          {expandedCompleted
            ? completedIds.map((id) => {
                const def = techDefById[id];
                if (!def) return null;
                return (
                  <div key={id} className="priest-row tech-card tech-card-completed">
                    <div className="priest-row-header">
                      <span className="priest-row-name">{def.name}</span>
                      <span className="oracle-inline-chip">
                        {CATEGORY_LABELS[def.category] ?? def.category}
                      </span>
                    </div>
                    <div className="campaign-copy text-xs">{def.description}</div>
                  </div>
                );
              })
            : null}
        </div>
      ) : null}
    </>
  );
}
