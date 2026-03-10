import React from "react";
import type { GameState, BuildingInstance } from "@the-oracle/core";
import { selectPriestPoliticsOverview, selectPriestRosterInsights, selectPriestSecrets, selectSuccessionContest } from "@the-oracle/core";
import { buildingDefs } from "@the-oracle/content";
import { useGameDispatch } from "./GameDispatchContext";

function politicsBadgeLabel(status: ReturnType<typeof selectPriestPoliticsOverview>["status"]) {
  switch (status) {
    case "crisis": return "Open fracture";
    case "fractured": return "Fractured";
    case "restless": return "Restless";
    default: return "Calm";
  }
}

export function PriestsOverlayPanel({ state, selectedBuilding }: { state: GameState; selectedBuilding?: BuildingInstance }) {
  const priestPolitics = selectPriestPoliticsOverview(state);
  const priestRoster = selectPriestRosterInsights(state);
  const priestSecrets = selectPriestSecrets(state);
  const successionContest = selectSuccessionContest(state);
  const { onAssignPriest, onIssuePriestDecree, onDismissPriest, onEndorseBloc, onInvestigatePriest } = useGameDispatch();
  const firstPriest = state.priests[0];
  const needAssignment = selectedBuilding?.requiresPriest && selectedBuilding.assignedPriestIds.length === 0 && firstPriest;

  return (
    <>
      <div className={`priest-politics-card ${priestPolitics.status}`}>
        <div className="priest-politics-header">
          <div>
            <div className="section-title">Temple Council</div>
            <div className="priest-politics-dominant">Dominant bloc: {priestPolitics.dominantBlocLabel}</div>
          </div>
          <span className={`priest-politics-status ${priestPolitics.status}`}>
            {politicsBadgeLabel(priestPolitics.status)}
          </span>
        </div>
        <div className="priest-politics-meters">
          <div className="priest-politics-meter">
            <span className="priest-politics-meter-label">Pressure</span>
            <strong>{priestPolitics.overallPressure}</strong>
          </div>
          <div className="priest-politics-meter">
            <span className="priest-politics-meter-label">Unity</span>
            <strong>{priestPolitics.unity}</strong>
          </div>
        </div>
        <div className="priest-politics-copy">{priestPolitics.currentIssue}</div>
        {priestPolitics.rumor ? (
          <div className="priest-politics-rumor">Rumor: {priestPolitics.rumor}</div>
        ) : null}
        <div className="pythia-actions mt-2">
          <button className="oracle-button" onClick={() => onIssuePriestDecree("calm")} type="button">Issue Calm</button>
          <button className="oracle-button" onClick={() => onIssuePriestDecree("reform")} type="button">Issue Reform</button>
          <button className="oracle-button" onClick={() => onIssuePriestDecree("investigate")} type="button">Investigate</button>
        </div>
      </div>

      <div className="sidebar-block">
        <div className="section-title">Council Blocs</div>
        <div className="priest-bloc-list">
          {priestPolitics.blocs.map((bloc) => (
            <div key={bloc.id} className={`priest-bloc-row ${bloc.id === priestPolitics.dominantBlocId ? "dominant" : ""}`}>
              <div className="priest-bloc-header">
                <span>{bloc.label}</span>
                <span>Support {bloc.support} · Tension {bloc.tension}</span>
              </div>
              <div className="priest-bloc-note">{bloc.note}</div>
              {bloc.id !== priestPolitics.dominantBlocId ? (
                <button
                  className="oracle-button text-xs mt-1"
                  onClick={() => onEndorseBloc(bloc.id)}
                  type="button"
                >
                  Endorse
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {successionContest ? (
        <div className="sidebar-block">
          <div className="section-title">
            Succession Contest {successionContest.active ? "(Active)" : "(Resolved)"}
          </div>
          {successionContest.frontRunnerName ? (
            <div className="priest-politics-copy">
              Front runner: {successionContest.frontRunnerName} (day {successionContest.daysSinceStart} of contest)
            </div>
          ) : null}
          <div className="priest-bloc-list">
            {successionContest.candidates.map((c) => (
              <div key={c.priestId} className={`priest-bloc-row ${c.isFrontRunner ? "dominant" : ""}`}>
                <span>{c.name}</span>
                <span className="text-xs">Influence {c.influence} | Loyalty {c.loyalty}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {priestPolitics.featuredCharacters.length > 0 ? (
        <div className="sidebar-block">
          <div className="section-title">Shadow Voices</div>
          <div className="priest-shadow-list">
            {priestPolitics.featuredCharacters.map((character) => (
              <div key={character.id} className="priest-shadow-row">
                <div className="priest-shadow-name">{character.displayName}</div>
                <div className="priest-shadow-details">
                  {character.factionName ?? "Delphi"} · Influence {character.influence} · {character.tone}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {state.priests.length === 0 ? (
        <div className="text-sm text-dim">No priests ordained yet.</div>
      ) : null}
      {priestRoster.map((priest) => (
        <div key={priest.id} className="priest-row">
          <div className="priest-row-header">
            <span className="priest-row-name">{priest.name}</span>
            <span className="text-xs text-dim">{priest.role ?? "Priest"}</span>
          </div>
          <div className="priest-row-details">
            Skill {priest.skill ?? 0} | Morale {priest.morale ?? 100}
            {priest.assignmentLabel ? ` | At ${priest.assignmentLabel}` : " | Unassigned"}
          </div>
          <div className="priest-trait-row">
            <span className="priest-trait-chip">{priest.temperament}</span>
            <span className="priest-trait-chip">{priest.ambition}</span>
            <span className="priest-trait-chip">{priest.stance}</span>
          </div>
          <div className="priest-row-details">
            Influence {priest.influence} | Loyalty {priest.loyalty} | Dissent {priest.dissent}
          </div>
          {priest.anchorName || priest.favoredFactionName ? (
            <div className="priest-row-details">
              {priest.anchorName ? `Anchor ${priest.anchorName}` : "Anchor sealed"}
              {priest.favoredFactionName ? ` | Patron pull ${priest.favoredFactionName}` : ""}
            </div>
          ) : null}
          <div className="priest-row-note">{priest.note}</div>
          {(() => {
            const secrets = priestSecrets.find((s) => s.priestId === priest.id);
            return secrets && secrets.discoveredSecrets.length > 0 ? (
              <div className="mt-1">
                <div className="text-xs font-semibold text-dim">Discovered Secrets:</div>
                {secrets.discoveredSecrets.map((s) => (
                  <div key={s.id} className="text-xs text-red">
                    {s.kind.replace(/_/g, " ")} (severity {s.severity})
                  </div>
                ))}
                {secrets.hiddenCount > 0 ? (
                  <div className="text-xs text-dim">
                    {secrets.hiddenCount} hidden secret{secrets.hiddenCount > 1 ? "s" : ""} remain
                  </div>
                ) : null}
              </div>
            ) : null;
          })()}
          <div className="flex-row-gap-2 mt-1">
            <button
              className="oracle-button text-xs"
              onClick={() => onInvestigatePriest(priest.id)}
              type="button"
            >
              Investigate
            </button>
            <button
              className="oracle-button text-xs text-red"
              onClick={() => onDismissPriest(priest.id)}
              type="button"
            >
              Dismiss
            </button>
          </div>
          {needAssignment && !priest.assignmentId && selectedBuilding ? (
            <button
              className="oracle-button text-xs mt-1"
              onClick={() => onAssignPriest(priest.id, selectedBuilding.id)}
              type="button"
            >
              Assign to {buildingDefs[selectedBuilding.defId].name}
            </button>
          ) : null}
        </div>
      ))}
    </>
  );
}
