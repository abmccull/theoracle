import { buildingDefs, resourceDefs } from "@the-oracle/content";
import type { BuildingDefId } from "@the-oracle/content";
import type {
  BuildingInstance,
  GameState,
  WalkerInstance
} from "@the-oracle/core";
import { selectCurrentAge } from "@the-oracle/core";
import React, { useEffect, useMemo, useState } from "react";

import { AnimatedNumber } from "./AnimatedNumber";
import { BottomToolbar } from "./BottomToolbar";
import { Icon } from "./Icons";
import { EspionagePanel } from "./EspionagePanel";
import { ResourceTooltip, getResourceSeverity } from "./ResourceTooltip";
import { GameOverlay } from "./GameOverlay";
import { useGameDispatch } from "./GameDispatchContext";
import { OracleOverlayPanel } from "./OracleOverlayPanel";
import { OverlayTriggerStrip } from "./OverlayTriggerStrip";
import { SidePanel } from "./SidePanel";
import {
  PrecinctOverviewPanel,
  deriveSiteInspection,
  resolvePrecinctFocusTile
} from "./PrecinctOverviewPanel";
import { PrecinctArtThumb } from "./PrecinctArtThumb";
import { PriestsOverlayPanel } from "./PriestsOverlayPanel";
import { LegacyPanel } from "./LegacyPanel";
import { LineagePanel } from "./LineagePanel";
import { RecordOverlayPanel } from "./RecordOverlayPanel";
import { StoresOverlayPanel } from "./StoresOverlayPanel";
import { WorldOverlayPanel } from "./WorldOverlayPanel";
import { CityOverviewPanel } from "./CityOverviewPanel";
import { ResearchPanel } from "./ResearchPanel";
import { ProgressionPanel } from "./ProgressionPanel";
import { trendArrow } from "./SharedComponents";

const RESOURCE_ICON_NAMES: Record<string, string> = {
  gold: "gold",
  olive_oil: "olive_oil",
  incense: "incense",
  sacred_water: "sacred_water",
  grain: "grain",
  sacred_animals: "sacred_animals",
  bread: "bread",
  olives: "olives",
  papyrus: "papyrus",
  scrolls: "scrolls"
};

const SEASON_ICON_NAMES: Record<string, string> = {
  Spring: "spring",
  Summer: "summer",
  Autumn: "autumn",
  Winter: "winter"
};

const OVERLAY_TITLES: Record<string, string> = {
  oracle: "Oracle",
  world: "World",
  stores: "Stores",
  priests: "Temple Council",
  espionage: "Espionage",
  record: "Sacred Record",
  legacy: "Legacy",
  lineage: "Lineage",
  city: "City of Delphi",
  research: "Research",
  progress: "Progression"
};

const OVERLAY_WIDTHS: Record<string, "narrow" | "medium" | "wide"> = {
  oracle: "medium",
  world: "wide",
  stores: "narrow",
  priests: "medium",
  espionage: "medium",
  record: "wide",
  legacy: "medium",
  lineage: "medium",
  city: "medium",
  research: "medium",
  progress: "medium"
};

const SIDE_PANEL_OVERLAYS = new Set(["oracle", "stores", "priests"]);

const QUICK_BUILD_CATEGORIES = ["ritual", "housing", "production", "storage"] as const;

const QUICK_BUILD_CATEGORY_LABELS: Record<string, string> = {
  ritual: "Sacred",
  housing: "Quarters",
  production: "Production",
  storage: "Storage",
};

/** Compact contextual build menu for placing buildings from a tile inspection. */
function QuickBuildMenu({
  goldAmount,
  unlockedBuildingIds,
  onSetTool,
}: {
  goldAmount: number;
  unlockedBuildingIds: BuildingDefId[];
  onSetTool: (tool: BuildingDefId) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const unlockedSet = useMemo(() => new Set<string>(unlockedBuildingIds), [unlockedBuildingIds]);

  const affordableBuildings = useMemo(() => {
    return Object.values(buildingDefs).filter(
      (def) =>
        def.costGold <= goldAmount &&
        (unlockedSet.has(def.id) || def.unlockTier === undefined) &&
        QUICK_BUILD_CATEGORIES.includes(def.category as (typeof QUICK_BUILD_CATEGORIES)[number]),
    );
  }, [goldAmount, unlockedSet]);

  if (affordableBuildings.length === 0) return null;

  if (!expanded) {
    return (
      <button
        className="oracle-button quick-build-trigger"
        onClick={() => setExpanded(true)}
        type="button"
      >
        <Icon name="production" size={14} aria-hidden="true" />
        <span>Quick Build ({affordableBuildings.length})</span>
      </button>
    );
  }

  // Group by category
  const grouped = new Map<string, typeof affordableBuildings>();
  for (const def of affordableBuildings) {
    if (!grouped.has(def.category)) grouped.set(def.category, []);
    grouped.get(def.category)!.push(def);
  }

  return (
    <div className="quick-build-menu" role="listbox" aria-label="Quick build options">
      <div className="quick-build-header">
        <span className="section-title">Quick Build</span>
        <button
          className="action-bar-btn"
          onClick={() => setExpanded(false)}
          type="button"
          aria-label="Close quick build menu"
        >
          <Icon name="close" size={12} />
        </button>
      </div>
      {QUICK_BUILD_CATEGORIES.map((cat) => {
        const items = grouped.get(cat);
        if (!items || items.length === 0) return null;
        return (
          <div key={cat} className="quick-build-group">
            <span className="quick-build-group-label">{QUICK_BUILD_CATEGORY_LABELS[cat]}</span>
            {items.slice(0, 4).map((def) => (
              <button
                key={def.id}
                className="quick-build-item"
                onClick={() => {
                  onSetTool(def.id);
                  setExpanded(false);
                }}
                type="button"
                role="option"
                title={def.description}
              >
                <span>{def.name}</span>
                <span className="quick-build-cost">{def.costGold}g</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

type OracleHudProps = {
  state: GameState;
  selectedBuilding?: BuildingInstance;
  selectedWalker?: WalkerInstance;
  activeOverlay: string | null;
};

export function OracleHud({
  state,
  selectedBuilding,
  selectedWalker,
  activeOverlay
}: OracleHudProps) {
  const dispatch = useGameDispatch();
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [infoTab, setInfoTab] = useState<"overview" | "production" | "staff">("overview");
  const [hoveredResource, setHoveredResource] = useState<string | null>(null);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const consultationReady = state.consultation.mode === "pending";
  const currentAge = useMemo(() => selectCurrentAge(state), [state]);
  const firstPriest = state.priests[0];
  const hasPendingAlert = consultationReady || state.campaign?.worldMap?.crisisChains?.some((c: { stepsCompleted: number }) => c.stepsCompleted === 0);
  const needAssignment = selectedBuilding?.requiresPriest && selectedBuilding.assignedPriestIds.length === 0 && firstPriest;
  const activeBuildingJobs = selectedBuilding
    ? state.resourceJobs.filter((job) => job.sourceBuildingId === selectedBuilding.id || job.targetBuildingId === selectedBuilding.id)
    : [];
  const carrierCount = state.walkers.filter((walker) => walker.role === "carrier").length;
  const carrierFatigueValues = state.walkers
    .filter((walker) => walker.role === "carrier")
    .map((walker) => walker.fatigue ?? 0);
  const highestCarrierFatigue = carrierFatigueValues.length > 0
    ? Math.round(Math.max(...carrierFatigueValues))
    : 0;
  const logisticsRows = [...state.resourceJobs]
    .sort((left, right) => {
      const priorityWeight = { critical: 0, high: 1, routine: 2 } as const;
      const leftWeight = priorityWeight[left.priority];
      const rightWeight = priorityWeight[right.priority];
      return leftWeight - rightWeight || left.id.localeCompare(right.id);
    })
    .slice(0, 4);
  const focusTile = useMemo(
    () => resolvePrecinctFocusTile(state, selectedBuilding, selectedWalker),
    [selectedBuilding, selectedWalker, state]
  );
  const siteReading = useMemo(() => deriveSiteInspection(state, focusTile), [focusTile, state]);

  const PRIMARY_RESOURCES = ["gold", "incense", "sacred_water", "grain", "bread", "olive_oil"];
  const primaryResourceDefs = resourceDefs.filter((d) => PRIMARY_RESOURCES.includes(d.id));

  // Ghost cost: when a building tool is active, show post-purchase gold amount
  const activePlacementCost = useMemo(() => {
    if (state.ui.activeTool === "select") return null;
    const def = buildingDefs[state.ui.activeTool as BuildingDefId];
    if (!def) return null;
    return def.costGold;
  }, [state.ui.activeTool]);

  // Handle M key for minimap toggle
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "m" || event.key === "M") {
        setMinimapVisible((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Reset info tab when selected building changes
  useEffect(() => {
    setInfoTab("overview");
  }, [selectedBuilding?.id]);

  function resolveEventOverlay(text: string): string | null {
    if (/consult|prophecy|pythia|omen|trance|vision|divination/i.test(text)) return "oracle";
    if (/espionage|spy|agent|infiltrat|sabotag|counterintel/i.test(text)) return "espionage";
    if (/excavat|relic|artifact|dig|layer|unearth/i.test(text)) return "world";
    if (/faction|credibility|treaty|demand|embargo|alliance|patron|envoy|rival|diplomat/i.test(text)) return "world";
    if (/construct|repair|damage|dedication|building|temple|shrine|granary|warehouse|bakery/i.test(text)) return "stores";
    return null;
  }

  function toggleOverlay(overlayId: string) {
    dispatch.setActiveOverlay(activeOverlay === overlayId ? null : overlayId);
  }

  function closeOverlay() {
    dispatch.setActiveOverlay(null);
  }

  const isSidePanel = activeOverlay !== null && SIDE_PANEL_OVERLAYS.has(activeOverlay);
  const isModalOverlay = activeOverlay !== null && !SIDE_PANEL_OVERLAYS.has(activeOverlay) && OVERLAY_TITLES[activeOverlay];

  function renderSidePanelContent() {
    switch (activeOverlay) {
      case "oracle":
        return <OracleOverlayPanel state={state} />;
      case "stores":
        return <StoresOverlayPanel state={state} />;
      case "priests":
        return <PriestsOverlayPanel state={state} selectedBuilding={selectedBuilding} />;
      default:
        return null;
    }
  }

  function renderModalContent() {
    switch (activeOverlay) {
      case "world":
        return <WorldOverlayPanel state={state} />;
      case "espionage":
        return <EspionagePanel state={state} />;
      case "record":
        return <RecordOverlayPanel state={state} />;
      case "legacy":
        return <LegacyPanel state={state} />;
      case "lineage":
        return <LineagePanel state={state} />;
      case "city":
        return <CityOverviewPanel state={state} />;
      case "research":
        return <ResearchPanel state={state} />;
      case "progress":
        return <ProgressionPanel state={state} />;
      default:
        return null;
    }
  }

  return (
    <div className="oracle-ui">
      {/* Top Bar */}
      <header className="top-bar panel">
        <div className="top-bar-left">
          <div className="top-bar-chronicle">
            <div className="top-bar-kicker-row">
              <span className="top-bar-seal"><Icon name="temple" size={16} /></span>
              <span className="top-bar-kicker">Temple Chronicle</span>
            </div>
            <div className="top-bar-calendar">
              <span className="top-bar-clock">
                Y{state.clock.year} M{state.clock.month} D{state.clock.day} {SEASON_ICON_NAMES[state.clock.season] ? <Icon name={SEASON_ICON_NAMES[state.clock.season]} size={14} className="icon-inline" /> : null} {state.clock.season}
              </span>
              <span className="age-badge" id="age-badge" title={currentAge.description}>{currentAge.name}</span>
            </div>
          </div>
          <div className="top-bar-speed">
            {[0, 1, 2, 3].map((speed) => (
              <button
                key={speed}
                className={`metal-button ${state.clock.speed === speed ? "active" : ""}`}
                id={`speed-${speed}`}
                onClick={() => dispatch.onSetSpeed(speed as 0 | 1 | 2 | 3)}
                type="button"
              >
                {speed === 0 ? "||" : `${speed}x`}
              </button>
            ))}
          </div>
          <div className="resource-pills">
            {primaryResourceDefs.map((def) => {
              const res = state.resources[def.id];
              if (!res) return null;
              const severity = getResourceSeverity(def.id, res);
              const severityClass = severity === "critical" ? " resource-critical" : severity === "warning" ? " resource-warning" : "";
              const isHovered = hoveredResource === def.id;
              return (
                <div
                  key={def.id}
                  className={`resource-pill${severityClass}`}
                  onMouseEnter={() => {
                    hoverTimerRef.current = setTimeout(() => setHoveredResource(def.id), 150);
                  }}
                  onMouseLeave={() => {
                    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                    setHoveredResource(null);
                  }}
                >
                  <span className={`resource-pill-icon ${def.id === "gold" ? "gold-icon" : ""}`}>{RESOURCE_ICON_NAMES[def.id] ? <Icon name={RESOURCE_ICON_NAMES[def.id]} size={14} /> : null}</span>
                  <div className="resource-pill-stack">
                    <span className="resource-pill-label">{def.label}</span>
                    <span className="resource-pill-value">
                      <AnimatedNumber value={res.amount} />
                      {def.id === "gold" && activePlacementCost !== null ? (
                        <span className={`resource-pill-ghost ${res.amount - activePlacementCost < 0 ? "ghost-negative" : ""}`}>
                          {" "}({(res.amount - activePlacementCost).toFixed(0)})
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {trendArrow(res.trend)}
                  {isHovered ? (
                    <ResourceTooltip
                      resourceId={def.id}
                      resourceState={res}
                      label={def.label}
                      buildings={state.buildings}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        {hasPendingAlert ? <span className="top-bar-alert" title="Pending events require attention" /> : null}
      </header>

      {/* Viewport */}
      <div className="viewport-area">
        {/* Consultation banner */}
        {consultationReady ? (
          <div className="consult-banner" id="envoy-btn" onClick={dispatch.onStartConsultation}>
            <span className="consult-banner-icon text-lg"><Icon name="scrolls" size={20} /></span>
            <div className="consult-banner-copy">
              <span className="consult-banner-kicker">Supplicant at the gate</span>
              <strong>Envoy Approaching — {state.consultation.current ? state.factions[state.consultation.current.factionId].name : "Unknown"}</strong>
            </div>
            <span className="consult-banner-action">Receive Envoy <Icon name="arrow_right" size={14} className="icon-inline" /></span>
          </div>
        ) : null}

        {/* Event log overlay */}
        {state.eventFeed.length > 0 ? (
          <div className="event-log-overlay" aria-live="polite" aria-label="Event feed">
            {state.eventFeed.slice(-4).map((event) => {
              const urgency = /collapse|destroy|revolt|death|killed|plague|famine|ruin|war|attack|crisis|default/i.test(event.text)
                ? "critical"
                : /treaty|patron|envoy|rival|threat|decline|warning|danger/i.test(event.text)
                  ? "important"
                  : /research|construct|excavat|trade|build|harvest|income|pilgrim|offer|caravan/i.test(event.text)
                    ? "routine"
                    : "ambient";
              const targetOverlay = resolveEventOverlay(event.text);
              const hasAction = targetOverlay !== null;
              return (
                <div
                  key={event.id}
                  className={`event-line event-${urgency}${hasAction ? " event-clickable" : ""}`}
                  onClick={hasAction ? () => dispatch.setActiveOverlay(targetOverlay) : undefined}
                  onKeyDown={hasAction ? (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); dispatch.setActiveOverlay(targetOverlay); } } : undefined}
                  role={hasAction ? "button" : undefined}
                  tabIndex={hasAction ? 0 : undefined}
                >
                  <span className="event-time">Day {event.day}</span>
                  <span className="event-text">{event.text}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        {logisticsRows.length > 0 ? (
          <div
            className="panel logistics-overlay"
            id="logistics-job-list"
            data-testid="logistics-job-list"
          >
            <div className="logistics-overlay-header">
              <div>
                <span className="section-title">Active Logistics</span>
                <div className="campaign-copy">Live queues across the sanctuary</div>
              </div>
              <span className="oracle-inline-chip">{logisticsRows.length} routes</span>
            </div>
            {logisticsRows.map((job, index) => (
              <div
                key={job.id}
                className={`logistics-overlay-row ${job.priority}`}
                id={`job-row-${index}`}
                data-testid={`logistics-job-row-${index}`}
              >
                <div className="logistics-overlay-row-top">
                  <strong>{job.priority} · {resourceDefs.find((def) => def.id === job.resourceId)?.label ?? job.resourceId}</strong>
                  <span>{Math.round(job.amount)} units</span>
                </div>
                <span>{job.sourceBuildingId} → {job.targetBuildingId}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Advisor banner */}
        {state.advisorMessages[0] ? (
          <div
            className={`advisor-banner ${state.advisorMessages[0].severity} ${
              state.advisorMessages[0].text.startsWith("[Trusted]") ? "advisor-trusted" :
              state.advisorMessages[0].text.startsWith("[Uncertain]") ? "advisor-uncertain" : ""
            }`}
            style={{ pointerEvents: "auto", position: "absolute", top: consultationReady ? 52 : 10, left: "50%", transform: "translateX(-50%)", maxWidth: 400 }}
          >
            {state.advisorMessages[0].text}
          </div>
        ) : null}

        {/* Info card for selected entity */}
        {selectedBuilding ? (
          <div className="info-card-overlay">
            <div className="info-card-header">
              <div className="info-card-visual">
                <PrecinctArtThumb
                  defId={selectedBuilding.defId}
                  alt={buildingDefs[selectedBuilding.defId].name}
                  className="info-card-art"
                />
                <div className="info-card-copy">
                  <span className="eyebrow">Selected structure</span>
                  <div className="headline">{buildingDefs[selectedBuilding.defId].name}</div>
                  <div className="inspector-subline">
                    {buildingDefs[selectedBuilding.defId].category} · {buildingDefs[selectedBuilding.defId].unlockTier ?? "base"}
                  </div>
                </div>
              </div>
              <div className="info-card-pill-row">
                <span className="oracle-inline-chip">Priests {selectedBuilding.assignedPriestIds.length}</span>
                <span className="oracle-inline-chip">Jobs {activeBuildingJobs.length}</span>
              </div>
            </div>

            {/* Tab bar */}
            <div className="info-card-tabs" role="tablist">
              <button className={`info-tab ${infoTab === "overview" ? "active" : ""}`} onClick={() => setInfoTab("overview")} role="tab" aria-selected={infoTab === "overview"} type="button">Overview</button>
              <button className={`info-tab ${infoTab === "production" ? "active" : ""}`} onClick={() => setInfoTab("production")} role="tab" aria-selected={infoTab === "production"} type="button">Production</button>
              <button className={`info-tab ${infoTab === "staff" ? "active" : ""}`} onClick={() => setInfoTab("staff")} role="tab" aria-selected={infoTab === "staff"} type="button">Staff</button>
            </div>

            {/* Overview tab */}
            {infoTab === "overview" ? (
              <div className="info-tab-content" role="tabpanel">
                <div className="info-card-meter-block">
                  Condition {selectedBuilding.condition.toFixed(1)} / {selectedBuilding.maxCondition}
                  <div className="condition-bar-track">
                    <div
                      className={`condition-bar-fill ${
                        selectedBuilding.condition / selectedBuilding.maxCondition >= 0.8 ? "good"
                        : selectedBuilding.condition / selectedBuilding.maxCondition >= 0.5 ? "warn"
                        : "bad"
                      }`}
                      style={{ width: `${Math.min(100, (selectedBuilding.condition / selectedBuilding.maxCondition) * 100)}%` }}
                    />
                  </div>
                </div>
                {selectedBuilding.condition < selectedBuilding.maxCondition * 0.95 ? (
                  <button
                    className="oracle-button"
                    id="repair-building-btn"
                    onClick={() => dispatch.onRepairBuilding(selectedBuilding.id)}
                    type="button"
                  >
                    Repair ({Math.ceil((selectedBuilding.maxCondition - selectedBuilding.condition) * 0.15)}g)
                  </button>
                ) : null}
                <div className="inspector-reading-row">
                  <span>Site {siteReading.toneLabel}</span>
                  <span>{siteReading.integrity}</span>
                </div>
                <div className="inspector-metric-strip">
                  <span>Approach {siteReading.approach}</span>
                  <span>Sanctity {siteReading.sanctity}</span>
                  <span>Shelter {siteReading.shelter}</span>
                  <span>Strain {siteReading.strain}</span>
                </div>
              </div>
            ) : null}

            {/* Production tab */}
            {infoTab === "production" ? (
              <div className="info-tab-content" role="tabpanel">
                {buildingDefs[selectedBuilding.defId].recipes?.length ? (
                  buildingDefs[selectedBuilding.defId].recipes!.map((recipe) => {
                    const consumes = Object.entries(recipe.consumes).filter(([, v]) => (v ?? 0) > 0);
                    const produces = Object.entries(recipe.produces).filter(([, v]) => (v ?? 0) > 0);
                    return (
                      <div key={recipe.id} className="production-chain-row">
                        <div className="production-inputs">
                          {consumes.length > 0 ? (
                            consumes.map(([resId, amount]) => (
                              <span key={resId} className="production-resource">
                                <Icon name={resId} size={12} /> {Number(amount).toFixed(2)}
                              </span>
                            ))
                          ) : (
                            <span className="text-dim text-xs">No inputs</span>
                          )}
                        </div>
                        <span className="production-arrow" aria-hidden="true">{"\u2192"}</span>
                        <div className="production-outputs">
                          {produces.map(([resId, amount]) => (
                            <span key={resId} className="production-resource">
                              <Icon name={resId} size={12} /> {Number(amount).toFixed(2)}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-dim">No production recipes</div>
                )}
                <div className="section-title text-xs" style={{ marginTop: 8 }}>Stored</div>
                {Object.entries(selectedBuilding.storedResources).length > 0 ? (
                  Object.entries(selectedBuilding.storedResources).map(([k, v]) => (
                    <div key={k} className="stored-resource-row">
                      <Icon name={k} size={12} /> {k.replace(/_/g, " ")}: {Number(v).toFixed(0)}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-dim">None</div>
                )}
              </div>
            ) : null}

            {/* Staff tab */}
            {infoTab === "staff" ? (
              <div className="info-tab-content" role="tabpanel">
                {selectedBuilding.assignedPriestIds.length > 0 ? (
                  selectedBuilding.assignedPriestIds.map((priestId) => {
                    const priest = state.priests.find((p) => p.id === priestId);
                    const walker = priest ? state.walkers.find((w) => w.id === priest.walkerId) : null;
                    return priest ? (
                      <div key={priestId} className="staff-row">
                        <strong>{walker?.name ?? priestId}</strong>
                        <span className="text-xs text-dim">{priest.role} · Skill {priest.skill}</span>
                        {priest.experience !== undefined ? <span className="text-xs text-dim">Exp {priest.experience}</span> : null}
                        {priest.loyalty !== undefined ? <span className="text-xs text-dim">Loyalty {priest.loyalty}</span> : null}
                      </div>
                    ) : null;
                  })
                ) : (
                  <div className="text-xs text-dim" style={{ fontStyle: "italic" }}>No staff assigned</div>
                )}
                {needAssignment ? (
                  <button
                    className="oracle-button"
                    id="assign-priest-btn"
                    onClick={() => dispatch.onAssignPriest(firstPriest.id, selectedBuilding.id)}
                    type="button"
                    style={{ marginTop: 8 }}
                  >
                    Assign {state.walkers.find((w) => w.id === firstPriest.walkerId)?.name ?? "Priest"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Quick-action bar */}
            <div className="info-card-action-bar" role="toolbar" aria-label="Building actions">
              {selectedBuilding.condition < selectedBuilding.maxCondition * 0.95 ? (
                <button
                  className="action-bar-btn"
                  onClick={() => dispatch.onRepairBuilding(selectedBuilding.id)}
                  type="button"
                  title="Repair this building"
                >
                  <Icon name="sacred" size={14} aria-hidden="true" />
                  <span>Repair</span>
                </button>
              ) : null}
              {selectedBuilding.requiresPriest && needAssignment ? (
                <button
                  className="action-bar-btn"
                  onClick={() => dispatch.onAssignPriest(firstPriest.id, selectedBuilding.id)}
                  type="button"
                  title="Assign an available priest"
                >
                  <Icon name="priests" size={14} aria-hidden="true" />
                  <span>Assign Priest</span>
                </button>
              ) : null}
              <button
                className="action-bar-btn"
                onClick={() => dispatch.setActiveOverlay("stores")}
                type="button"
                title="View in Stores overlay"
              >
                <Icon name="stores" size={14} aria-hidden="true" />
                <span>Stores</span>
              </button>
            </div>
          </div>
        ) : null}

        {selectedWalker && !selectedBuilding ? (
          <div className="info-card-overlay">
            <div className="info-card-header">
              <div className="info-card-copy">
                <span className="eyebrow">Selected walker</span>
                <div className="headline">{selectedWalker.name}</div>
                <div className="inspector-subline">
                  {selectedWalker.role} · {selectedWalker.assignmentBuildingId ? `Assigned to ${selectedWalker.assignmentBuildingId}` : "No assignment"}
                </div>
              </div>
              <div className="info-card-pill-row">
                <span className="oracle-inline-chip">State {selectedWalker.state}</span>
                <span className="oracle-inline-chip">Tile {selectedWalker.tile.x},{selectedWalker.tile.y}</span>
              </div>
            </div>
            <div className="info-card-meter-block">
              Carrying {selectedWalker.carrying ? `${selectedWalker.carrying} ${selectedWalker.carryingAmount?.toFixed(1) ?? 0}` : "Nothing"}
            </div>
            {selectedWalker.role === "carrier" ? (
              <div className="text-xs text-dim">
                <span id="selected-carrier-fatigue">Fatigue {(selectedWalker.fatigue ?? 0).toFixed(0)}/100</span>
                {" · "}
                <span id="selected-carrier-skill">Hauling skill {selectedWalker.haulingSkill ?? 0}</span>
                {" · "}
                <span id="selected-carrier-radius">Supply radius {selectedWalker.supplyRadius ?? 0}</span>
              </div>
            ) : null}
            {/* Walker traits */}
            {selectedWalker.traits && selectedWalker.traits.length > 0 ? (
              <div className="text-xs text-dim" style={{ marginTop: 4 }}>
                Traits: {selectedWalker.traits.map(t => t.replace(/_/g, ' ')).join(', ')}
              </div>
            ) : null}
            {/* Skill & Morale */}
            {selectedWalker.skillLevel !== undefined ? (
              <div className="text-xs text-dim">
                Skill Lv.{selectedWalker.skillLevel} · Exp {selectedWalker.experience ?? 0}/100
              </div>
            ) : null}
            {selectedWalker.morale !== undefined ? (
              <div className="walker-morale-row">
                <span className="text-xs">Morale</span>
                <div className="condition-bar-track" style={{ width: 60, height: 6 }}>
                  <div
                    className={`condition-bar-fill ${selectedWalker.morale >= 70 ? 'good' : selectedWalker.morale >= 20 ? 'warn' : 'bad'}`}
                    style={{ width: `${selectedWalker.morale}%` }}
                  />
                </div>
                <span className="text-xs text-dim">{selectedWalker.morale}</span>
              </div>
            ) : null}
            <div className="inspector-reading-row">
              <span>Ground {siteReading.toneLabel}</span>
              <span>{siteReading.integrity}</span>
            </div>
            <div className="inspector-metric-strip">
              <span>Approach {siteReading.approach}</span>
              <span>Sanctity {siteReading.sanctity}</span>
              <span>Shelter {siteReading.shelter}</span>
              <span>Strain {siteReading.strain}</span>
            </div>

            {/* Walker action/info bar */}
            <div className="info-card-action-bar" role="toolbar" aria-label="Walker info">
              <span className="action-bar-info">
                <Icon name="carrier" size={14} aria-hidden="true" />
                <span>{selectedWalker.role}</span>
              </span>
              {selectedWalker.assignmentBuildingId ? (
                <span className="action-bar-info">
                  <Icon name="quarters" size={14} aria-hidden="true" />
                  <span>{selectedWalker.assignmentBuildingId}</span>
                </span>
              ) : null}
              <button
                className="action-bar-btn"
                onClick={() => dispatch.setActiveOverlay("priests")}
                type="button"
                title="View Temple Council"
              >
                <Icon name="priests" size={14} aria-hidden="true" />
                <span>Council</span>
              </button>
            </div>
          </div>
        ) : null}

        {!selectedBuilding && !selectedWalker && state.ui.hoveredTile ? (
          <div className="site-inspection-overlay" id="site-inspection-panel">
            <div className="site-inspection-header">
              <div>
                <div className="section-title">Site Inspection</div>
                <div className="headline">
                  Tile {state.ui.hoveredTile.x},{state.ui.hoveredTile.y}
                </div>
              </div>
              <span className={`condition-badge ${siteReading.tone === "consecrated" || siteReading.tone === "attuned" ? "good" : siteReading.tone === "watchful" ? "warn" : "bad"}`}>
                {siteReading.integrity}
              </span>
            </div>
            <div className="site-inspection-grid">
              <div className="site-inspection-stat">
                <span>Approach</span>
                <strong>{siteReading.approach}</strong>
              </div>
              <div className="site-inspection-stat">
                <span>Sanctity</span>
                <strong>{siteReading.sanctity}</strong>
              </div>
              <div className="site-inspection-stat">
                <span>Shelter</span>
                <strong>{siteReading.shelter}</strong>
              </div>
              <div className="site-inspection-stat strain">
                <span>Strain</span>
                <strong>{siteReading.strain}</strong>
              </div>
            </div>
            <div className="inspector-subline">{siteReading.note}</div>
            {/* Quick Build action — opens build toolbar for fast placement */}
            {state.ui.activeTool === "select" ? (
              <div className="site-inspection-actions">
                <QuickBuildMenu
                  goldAmount={state.resources.gold?.amount ?? 0}
                  unlockedBuildingIds={state.campaign.reputation.unlockedBuildingIds}
                  onSetTool={dispatch.onSetTool}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Side panel for Oracle/Stores/Priests */}
        {isSidePanel && activeOverlay ? (
          <SidePanel
            title={OVERLAY_TITLES[activeOverlay]}
            onClose={closeOverlay}
            onExpand={() => {
              /* Close side panel and re-open as modal — not yet wired */
            }}
          >
            {renderSidePanelContent()}
          </SidePanel>
        ) : null}

        {/* Minimap overlay (M to toggle) */}
        {minimapVisible ? (
          <div className="minimap-overlay">
            <PrecinctOverviewPanel
              state={state}
              selectedBuilding={selectedBuilding}
              selectedWalker={selectedWalker}
            />
            <div className="minimap-status-bar">
              <span className="minimap-status-pill">
                <Icon name="carrier" size={12} /> {carrierCount}
              </span>
              <span className="minimap-status-pill">
                <Icon name="strain" size={12} /> {highestCarrierFatigue}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Overlay Trigger Bar (horizontal, above bottom toolbar) */}
      <OverlayTriggerStrip
        activeOverlay={activeOverlay}
        onToggleOverlay={toggleOverlay}
        notifications={{
          oracle: consultationReady,
          world: !!hasPendingAlert && !consultationReady
        }}
      />

      {/* Bottom Toolbar */}
      <BottomToolbar
        activeTool={state.ui.activeTool}
        unlockedBuildingIds={state.campaign.reputation.unlockedBuildingIds}
        resources={state.resources}
        onSetTool={dispatch.onSetTool}
      />

      {/* Modal overlays for deep-dive screens */}
      {isModalOverlay && activeOverlay ? (
        <GameOverlay
          title={OVERLAY_TITLES[activeOverlay]}
          width={OVERLAY_WIDTHS[activeOverlay]}
          onClose={closeOverlay}
        >
          {renderModalContent()}
        </GameOverlay>
      ) : null}
    </div>
  );
}
