import {
  renderGameToText,
  randomSeedText,
  selectSelectedBuilding,
  selectSelectedWalker,
  type BurdenId,
  type EspionageAgentCover,
  type EspionageOperationKind,
  type FactionId,
  type LegendaryConsultationId,
  type OriginId,
  type PlacementTool,
  type ResourceId
} from "@the-oracle/core";
import {
  AdvisorHintBanner,
  ConsultationOverlay,
  ErrorBoundary,
  EscapeMenu,
  HelpOverlay,
  GameDispatchContext,
  type GameDispatchActions,
  OracleHud,
  RunSetupPanel,
  UndoProvider
} from "@the-oracle/ui";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { SeedReplayInspector } from "./dev/SeedReplayInspector";
import { getRunDebugContext, getRuntime, isRunSetupInitiallyOpen, startNewRun, syncRunQueryFromState } from "./runtime";

const TICK_INTERVAL_MS = 100;
const PERSISTENCE_NOTICE_MS = 4000;

/**
 * Derives the environmental mood state from game state.
 * Used to apply CSS classes for subtle UI atmosphere shifts.
 */
function deriveTempleState(state: { campaign: { reputation: { score: number; currentTier: string } }; resources: Record<string, { amount: number }> }): "thriving" | "declining" | "crisis" | "neutral" {
  const repScore = state.campaign.reputation.score;
  const tier = state.campaign.reputation.currentTier;
  const gold = state.resources.gold?.amount ?? 0;

  // Crisis: very low reputation or gold critically depleted
  if (repScore < 15 || gold < 3) return "crisis";
  // Declining: reputation below midpoint or gold getting low
  if (repScore < 35 || gold < 8) return "declining";
  // Thriving: high reputation and healthy resources
  if (repScore >= 65 && tier !== "obscure") return "thriving";

  return "neutral";
}

type PersistenceNotice = {
  kind: "error" | "success";
  text: string;
};

function useOracleState() {
  const runtime = getRuntime();
  return useSyncExternalStore(
    (callback) => runtime.subscribe(callback),
    () => runtime.getState(),
    () => runtime.getState()
  );
}

export function App() {
  const state = useOracleState();
  const selectedBuilding = useMemo(() => selectSelectedBuilding(state), [state]);
  const selectedWalker = useMemo(() => selectSelectedWalker(state), [state]);
  const templeState = useMemo(() => deriveTempleState(state), [state]);
  const gameHostRef = useRef<HTMLDivElement | null>(null);
  const runtime = getRuntime();
  const lastAutosaveDayRef = useRef(state.lastAutosaveDay);
  const [persistenceNotice, setPersistenceNotice] = useState<PersistenceNotice | null>(null);
  const [runSetupOpen, setRunSetupOpen] = useState(() => isRunSetupInitiallyOpen());
  const [runSeed, setRunSeed] = useState(() => state.worldSeedText);
  const [runOriginId, setRunOriginId] = useState(() => state.originId);
  const [runScenarioId, setRunScenarioId] = useState(() => state.runConfig.scenarioId);
  const [runDifficultyId, setRunDifficultyId] = useState(() => state.runConfig.difficultyId);
  const [runPythiaArchetypeId, setRunPythiaArchetypeId] = useState(() => state.runConfig.pythiaArchetypeId);
  const [runStartingRegionId, setRunStartingRegionId] = useState(() => state.runConfig.startingRegionId);
  const [runDraftDirty, setRunDraftDirty] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [escapeMenuOpen, setEscapeMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const currentRunContext = useMemo(() => getRunDebugContext(undefined, false, state), [state]);
  const draftRunContext = useMemo(
    () => getRunDebugContext({
      seed: runSeed,
      originId: runOriginId,
      scenarioId: runScenarioId,
      difficultyId: runDifficultyId,
      pythiaArchetypeId: runPythiaArchetypeId,
      startingRegionId: runStartingRegionId
    }, false, state),
    [runDifficultyId, runOriginId, runPythiaArchetypeId, runScenarioId, runSeed, runStartingRegionId, state]
  );
  const runOriginOptions = draftRunContext.origins;
  const runScenarioOptions = draftRunContext.scenarios;
  const runDifficultyOptions = draftRunContext.difficulties;
  const runPythiaOptions = draftRunContext.pythias;
  const runPreview = draftRunContext.preview;
  const runCityOptions = useMemo(() => runPreview.startingCities ?? [], [runPreview.startingCities]);

  useEffect(() => {
    if (!persistenceNotice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPersistenceNotice((current) => (current === persistenceNotice ? null : current));
    }, PERSISTENCE_NOTICE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [persistenceNotice]);

  useEffect(() => {
    if (!gameHostRef.current) {
      return;
    }
    let disposed = false;
    let destroyGame = () => {};

    void import("./game/createGame").then(({ createGame }) => {
      if (disposed || !gameHostRef.current) {
        return;
      }
      const game = createGame(gameHostRef.current);
      destroyGame = () => {
        game.destroy(true);
      };
    });

    return () => {
      disposed = true;
      destroyGame();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = runtime.getState();
      if (!current.clock.paused && current.clock.speed > 0) {
        runtime.advanceTicks(current.clock.speed);
      }
    }, TICK_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [runtime]);

  useEffect(() => {
    if (state.lastAutosaveDay !== lastAutosaveDayRef.current) {
      lastAutosaveDayRef.current = state.lastAutosaveDay;
      void runtime.save("autosave").catch((error) => {
        console.error("Autosave failed", error);
        setPersistenceNotice({
          kind: "error",
          text: "Autosave failed. Existing progress is still in memory."
        });
      });
    }
    window.render_game_to_text = () => renderGameToText(runtime.getState());
  }, [runtime, state]);

  useEffect(() => {
    if (!runDraftDirty) {
      setRunSeed(state.worldSeedText);
      setRunOriginId(state.originId);
      setRunScenarioId(state.runConfig.scenarioId);
      setRunDifficultyId(state.runConfig.difficultyId);
      setRunPythiaArchetypeId(state.runConfig.pythiaArchetypeId);
      setRunStartingRegionId(state.runConfig.startingRegionId);
    }
  }, [runDraftDirty, state]);

  useEffect(() => {
    if (runCityOptions.length === 0) {
      return;
    }
    if (!runCityOptions.some((city) => city.id === runStartingRegionId)) {
      setRunStartingRegionId(runPreview.selectedStartingCityId ?? runCityOptions[0]?.id ?? "delphi");
    }
  }, [runCityOptions, runPreview.selectedStartingCityId, runStartingRegionId]);

  useEffect(() => {
    syncRunQueryFromState(state, runSetupOpen);
  }, [runSetupOpen, state]);

  useEffect(() => {
    const closeSetupOnLoad = () => {
      setRunSetupOpen(false);
      setRunDraftDirty(false);
    };

    window.addEventListener("oracle:load", closeSetupOnLoad);
    return () => window.removeEventListener("oracle:load", closeSetupOnLoad);
  }, []);

  const updateRunDraft = useCallback((
    seed: string,
    originId: OriginId,
    scenarioId: typeof state.runConfig.scenarioId,
    difficultyId: typeof state.runConfig.difficultyId,
    pythiaArchetypeId: typeof state.runConfig.pythiaArchetypeId,
    startingRegionId: string
  ) => {
    setRunSeed(seed);
    setRunOriginId(originId);
    setRunScenarioId(scenarioId);
    setRunDifficultyId(difficultyId);
    setRunPythiaArchetypeId(pythiaArchetypeId);
    setRunStartingRegionId(startingRegionId);
    setRunDraftDirty(
      seed !== state.worldSeedText
      || originId !== state.originId
      || scenarioId !== state.runConfig.scenarioId
      || difficultyId !== state.runConfig.difficultyId
      || pythiaArchetypeId !== state.runConfig.pythiaArchetypeId
      || startingRegionId !== state.runConfig.startingRegionId
    );
  }, [state]);

  const syncDraftToLiveRun = useCallback(() => {
    setRunSeed(state.worldSeedText);
    setRunOriginId(state.originId);
    setRunScenarioId(state.runConfig.scenarioId);
    setRunDifficultyId(state.runConfig.difficultyId);
    setRunPythiaArchetypeId(state.runConfig.pythiaArchetypeId);
    setRunStartingRegionId(state.runConfig.startingRegionId);
    setRunDraftDirty(false);
  }, [state.originId, state.runConfig.difficultyId, state.runConfig.pythiaArchetypeId, state.runConfig.scenarioId, state.runConfig.startingRegionId, state.worldSeedText]);

  const handleManualSave = useCallback(async () => {
    try {
      await runtime.save("slot-1");
      setPersistenceNotice({
        kind: "success",
        text: "Saved to slot 1."
      });
    } catch (error) {
      console.error("Manual save failed", error);
      setPersistenceNotice({
        kind: "error",
        text: "Save failed. Check the console for details."
      });
    }
  }, [runtime]);

  const handleManualLoad = useCallback(async () => {
    try {
      await runtime.load("slot-1");
      setRunDraftDirty(false);
      setRunSetupOpen(false);
    } catch (error) {
      console.error("Manual load failed", error);
      setPersistenceNotice({
        kind: "error",
        text: "Load failed because the save payload is invalid or unreadable."
      });
    }
  }, [runtime]);

  const handleStartRun = useCallback(() => {
    startNewRun({
      seed: runSeed,
      originId: runOriginId,
      scenarioId: runScenarioId,
      difficultyId: runDifficultyId,
      pythiaArchetypeId: runPythiaArchetypeId,
      startingRegionId: runStartingRegionId
    });
    setRunDraftDirty(false);
    setRunSetupOpen(false);
    setPersistenceNotice(null);
  }, [runDifficultyId, runOriginId, runPythiaArchetypeId, runScenarioId, runSeed, runStartingRegionId]);

  const openRunSetup = useCallback(() => {
    syncDraftToLiveRun();
    setRunSetupOpen(true);
  }, [syncDraftToLiveRun]);

  const handleSave = useCallback(() => { void handleManualSave(); }, [handleManualSave]);
  const handleLoad = useCallback(() => { void handleManualLoad(); }, [handleManualLoad]);

  // Consolidated keyboard handler
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Don't intercept when typing in inputs
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (event.key) {
        case "?":
          setHelpOpen((prev) => !prev);
          break;
        case "Escape":
          if (helpOpen) {
            setHelpOpen(false);
          } else if (escapeMenuOpen) {
            setEscapeMenuOpen(false);
          } else if (activeOverlay) {
            setActiveOverlay(null);
          } else {
            const current = runtime.getState();
            if (current.ui.activeTool !== "select") {
              runtime.dispatch({ type: "SetToolCommand", tool: "select" });
            } else {
              setEscapeMenuOpen(true);
            }
          }
          break;
        case "o":
        case "O":
          setActiveOverlay((prev) => (prev === "oracle" ? null : "oracle"));
          break;
        case "w":
        case "W":
          setActiveOverlay((prev) => (prev === "world" ? null : "world"));
          break;
        case "s":
        case "S":
          setActiveOverlay((prev) => (prev === "stores" ? null : "stores"));
          break;
        case "p":
        case "P":
          setActiveOverlay((prev) => (prev === "priests" ? null : "priests"));
          break;
        case "r":
        case "R":
          setActiveOverlay((prev) => (prev === "record" ? null : "record"));
          break;
        case "e":
        case "E":
          setActiveOverlay((prev) => (prev === "espionage" ? null : "espionage"));
          break;
        case "l":
        case "L":
          setActiveOverlay((prev) => (prev === "legacy" ? null : "legacy"));
          break;
        case "i":
        case "I":
          setActiveOverlay((prev) => (prev === "lineage" ? null : "lineage"));
          break;
        case "c":
        case "C":
          setActiveOverlay((prev) => (prev === "city" ? null : "city"));
          break;
        case "t":
        case "T":
          setActiveOverlay((prev) => (prev === "research" ? null : "research"));
          break;
        case "g":
        case "G":
          setActiveOverlay((prev) => (prev === "progress" ? null : "progress"));
          break;
        case "1":
          runtime.dispatch({ type: "SetGameSpeedCommand", speed: 1 });
          break;
        case "2":
          runtime.dispatch({ type: "SetGameSpeedCommand", speed: 2 });
          break;
        case "3":
          runtime.dispatch({ type: "SetGameSpeedCommand", speed: 3 });
          break;
        case " ":
          event.preventDefault();
          runtime.dispatch({
            type: "SetGameSpeedCommand",
            speed: runtime.getState().clock.speed === 0 ? 1 : 0
          });
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [runtime, activeOverlay, escapeMenuOpen, helpOpen]);

  const dispatchActions: GameDispatchActions = useMemo(
    () => ({
      onSetTool: (tool: PlacementTool) => runtime.dispatch({ type: "SetToolCommand", tool }),
      onSetSpeed: (speed: 0 | 1 | 2 | 3) => runtime.dispatch({ type: "SetGameSpeedCommand", speed }),
      onAssignPriest: (priestId: string, buildingId: string) => runtime.dispatch({ type: "AssignPriestCommand", priestId, buildingId }),
      onStartConsultation: () => runtime.dispatch({ type: "StartConsultationCommand" }),
      onPurchaseTradeOffer: (offerId: string) => runtime.dispatch({ type: "PurchaseTradeOfferCommand", offerId }),
      onRestPythia: () => runtime.dispatch({ type: "RestPythiaCommand" }),
      onPurifyPythia: () => runtime.dispatch({ type: "PurifyPythiaCommand" }),
      onRepairBuilding: (buildingId: string) => runtime.dispatch({ type: "RepairBuildingCommand", buildingId }),
      onOpenRunSetup: openRunSetup,
      onSave: handleSave,
      onLoad: handleLoad,
      setActiveOverlay,
      onIssuePriestDecree: (decreeType: "calm" | "reform" | "investigate") => runtime.dispatch({ type: "IssuePriestDecreeCommand", decreeType }),
      onDismissPriest: (priestId: string) => runtime.dispatch({ type: "DismissPriestCommand", priestId }),
      onEndorseBloc: (blocId: string) => runtime.dispatch({ type: "EndorseBlocCommand", blocId }),
      onBeginExcavation: (siteId: string) => runtime.dispatch({ type: "BeginExcavationCommand", siteId }),
      onClaimRelic: (siteId: string, layerDepth: number) => runtime.dispatch({ type: "ClaimRelicCommand", siteId, layerDepth }),
      onActivateSacredSite: (siteId: string) => runtime.dispatch({ type: "ActivateSacredSiteCommand", siteId }),
      onLaunchEspionageOperation: (operationKind: EspionageOperationKind, agentId: string, targetId: string) =>
        runtime.dispatch({ type: "LaunchEspionageOperationCommand", operationKind, agentId, targetId }),
      onInvestigatePriest: (priestId: string) => runtime.dispatch({ type: "InvestigatePriestCommand", priestId }),
      onRecruitAgent: (cover: EspionageAgentCover, targetFactionId: FactionId) =>
        runtime.dispatch({ type: "RecruitAgentCommand", cover, targetFactionId }),
      onTriggerEndOfRun: () => runtime.dispatch({ type: "TriggerEndOfRunCommand" }),
      onBeginLegendaryConsultation: (consultationId: LegendaryConsultationId) =>
        runtime.dispatch({ type: "BeginLegendaryConsultationCommand", consultationId }),
      onAdvanceLegendaryStage: (consultationId: LegendaryConsultationId) =>
        runtime.dispatch({ type: "AdvanceLegendaryStageCommand", consultationId }),
      onStartNewLineageRun: (originId: OriginId, seedText: string, burdens: BurdenId[], endlessMode: boolean) =>
        runtime.dispatch({ type: "StartNewLineageRunCommand", originId, seedText, burdens, endlessMode }),
      onRecordLineageRun: () =>
        runtime.dispatch({ type: "RecordLineageRunCommand" }),
      onSelectResearch: (techId: string) =>
        runtime.dispatch({ type: "SELECT_RESEARCH", techId }),
      onSellResource: (resourceId: ResourceId, amount: number, targetFactionId: string) =>
        runtime.dispatch({ type: "SELL_RESOURCE", resourceId, amount, targetFactionId }),
      onDemolishBuilding: (buildingId: string) =>
        runtime.dispatch({ type: "DEMOLISH_BUILDING", buildingId }),
      onInterrogateAgent: (agentId: string) =>
        runtime.dispatch({ type: "InterrogateAgentCommand", agentId }),
      onRansomAgent: (agentId: string) =>
        runtime.dispatch({ type: "RansomAgentCommand", agentId })
    }),
    [handleLoad, handleSave, openRunSetup, runtime]
  );

  const consultationActive = state.consultation.mode !== "idle";
  const hasResourceWarning = Object.values(state.resources).some(
    (res) => res.amount < 10 && res.trend < -0.01
  );

  return (
    <ErrorBoundary>
    <UndoProvider>
    <GameDispatchContext.Provider value={dispatchActions}>
      <div className={`app-shell ${templeState !== "neutral" ? `state-${templeState}` : ""}`}>
        <div ref={gameHostRef} className="game-host" />
        {runSetupOpen ? (
          <div
            style={{
              position: "absolute",
              inset: 14,
              zIndex: 5,
              overflow: "auto"
            }}
          >
            <RunSetupPanel
              title="Start New Game"
              eyebrow="Cast the Opening Lots"
              seed={runSeed}
              onSeedChange={(seed) => updateRunDraft(seed, runOriginId, runScenarioId, runDifficultyId, runPythiaArchetypeId, runStartingRegionId)}
              onSeedRandomize={() => updateRunDraft(randomSeedText(), runOriginId, runScenarioId, runDifficultyId, runPythiaArchetypeId, runStartingRegionId)}
              scenarios={runScenarioOptions}
              selectedScenarioId={runScenarioId}
              onSelectScenario={(scenarioId) => updateRunDraft(runSeed, runOriginId, scenarioId as typeof state.runConfig.scenarioId, runDifficultyId, runPythiaArchetypeId, runStartingRegionId)}
              difficulties={runDifficultyOptions}
              selectedDifficultyId={runDifficultyId}
              onSelectDifficulty={(difficultyId) => updateRunDraft(runSeed, runOriginId, runScenarioId, difficultyId as typeof state.runConfig.difficultyId, runPythiaArchetypeId, runStartingRegionId)}
              origins={runOriginOptions}
              selectedOriginId={runOriginId}
              onSelectOrigin={(originId) => updateRunDraft(runSeed, originId as typeof state.originId, runScenarioId, runDifficultyId, runPythiaArchetypeId, runStartingRegionId)}
              pythias={runPythiaOptions}
              selectedPythiaId={runPythiaArchetypeId}
              onSelectPythia={(pythiaArchetypeId) =>
                updateRunDraft(
                  runSeed,
                  runOriginId,
                  runScenarioId,
                  runDifficultyId,
                  pythiaArchetypeId as typeof state.runConfig.pythiaArchetypeId,
                  runStartingRegionId
                )
              }
              startingCities={runCityOptions}
              selectedStartingCityId={runStartingRegionId}
              onSelectStartingCity={(startingRegionId) =>
                updateRunDraft(runSeed, runOriginId, runScenarioId, runDifficultyId, runPythiaArchetypeId, startingRegionId)
              }
              preview={runPreview}
              onStart={handleStartRun}
              startLabel="Start New Game"
              note={`Live run ${state.worldGeneration.originTitle} · ${state.runConfig.scenarioId} · ${state.runConfig.difficultyId} · seed ${state.worldSeedText}.`}
            />
          </div>
        ) : (
          <>
            <OracleHud
              state={state}
              selectedBuilding={selectedBuilding}
              selectedWalker={selectedWalker}
              activeOverlay={activeOverlay}
            />
            <ConsultationOverlay
              state={state}
              onToggleTile={(tileId, active) =>
                runtime.dispatch(active ? { type: "RemoveProphecyTileCommand", tileId } : { type: "PlaceProphecyTileCommand", tileId })
              }
              onDeliver={() => runtime.dispatch({ type: "DeliverProphecyCommand" })}
            />
            {escapeMenuOpen ? (
              <EscapeMenu
                onResume={() => setEscapeMenuOpen(false)}
                onSave={() => { void handleManualSave(); setEscapeMenuOpen(false); }}
                onLoad={() => { void handleManualLoad(); setEscapeMenuOpen(false); }}
                onNewRun={() => { openRunSetup(); setEscapeMenuOpen(false); }}
              />
            ) : null}
            {helpOpen ? <HelpOverlay onClose={() => setHelpOpen(false)} /> : null}
          </>
        )}
        <SeedReplayInspector
          currentContext={currentRunContext}
          draftContext={draftRunContext}
          runSetupOpen={runSetupOpen}
          state={state}
          onDraftOriginChange={(originId) => updateRunDraft(runSeed, originId, runScenarioId, runDifficultyId, runPythiaArchetypeId, runStartingRegionId)}
          onDraftSeedChange={(seed) => updateRunDraft(seed, runOriginId, runScenarioId, runDifficultyId, runPythiaArchetypeId, runStartingRegionId)}
          onOpenDraftInSetup={() => setRunSetupOpen(true)}
          onRandomizeSeed={() => updateRunDraft(randomSeedText(), runOriginId, runScenarioId, runDifficultyId, runPythiaArchetypeId, runStartingRegionId)}
          onResetDraftToLive={syncDraftToLiveRun}
          onStartDraftRun={handleStartRun}
        />
        {persistenceNotice ? (
          <div
            className="panel"
            role="status"
            style={{
              position: "absolute",
              right: 14,
              bottom: 14,
              zIndex: 4,
              maxWidth: 360,
              padding: "12px 14px",
              borderColor: persistenceNotice.kind === "error" ? "rgba(143, 43, 28, 0.55)" : "rgba(54, 93, 40, 0.45)"
            }}
          >
            {persistenceNotice.text}
          </div>
        ) : null}
        {/* Advisor hints for first-time encounters */}
        <AdvisorHintBanner hintId="first-consultation" active={consultationActive} />
        <AdvisorHintBanner hintId="first-resource-warning" active={hasResourceWarning} />
        <AdvisorHintBanner hintId="first-envoy-arrival" active={state.consultation.mode === "pending"} />
      </div>
    </GameDispatchContext.Provider>
    </UndoProvider>
    </ErrorBoundary>
  );
}
