import { buildingDefs } from "@the-oracle/content";
import type { BuildingDef, BuildingDefId, ResourceId } from "@the-oracle/content";
import type { GameState, PlacementTool } from "@the-oracle/core";
import React, { useState } from "react";

import { Icon } from "./Icons";
import { PrecinctArtThumb } from "./PrecinctArtThumb";

type BuildPaletteProps = {
  activeTool: PlacementTool;
  unlockedBuildingIds: BuildingDefId[];
  resources: GameState["resources"];
  onSetTool: (tool: PlacementTool) => void;
};

const CATEGORY_META: Record<string, { label: string; iconName: string }> = {
  processional: { label: "Roads & Paths", iconName: "road" },
  ritual: { label: "Sacred Structures", iconName: "sacred" },
  housing: { label: "Quarters", iconName: "quarters" },
  storage: { label: "Storage", iconName: "storage" },
  production: { label: "Production", iconName: "production" },
  trade: { label: "Trade", iconName: "trade" },
  hospitality: { label: "Visitor Facilities", iconName: "hospitality" }
};

const CATEGORY_ORDER = ["processional", "ritual", "housing", "storage", "production", "trade", "hospitality"];

const TIER_ORDER = ["base", "obscure", "recognized", "revered", "panhellenic"];

const PRODUCTION_SUBGROUPS: { label: string; resources: ResourceId[] }[] = [
  { label: "Food Chain", resources: ["grain", "bread", "olives", "olive_oil"] },
  { label: "Material Chain", resources: ["logs", "stone", "planks", "cut_stone"] },
  { label: "Knowledge", resources: ["scrolls", "knowledge", "papyrus"] },
  { label: "Sacred", resources: ["incense", "sacred_water", "sacred_animals"] },
];

function getProductionSubgroup(def: BuildingDef): string {
  const outputResources = new Set<string>();
  for (const recipe of def.recipes ?? []) {
    for (const resId of Object.keys(recipe.produces)) {
      outputResources.add(resId);
    }
  }
  for (const group of PRODUCTION_SUBGROUPS) {
    if (group.resources.some((r) => outputResources.has(r))) {
      return group.label;
    }
  }
  return "Other";
}

function formatResourceName(id: string): string {
  return id.replace(/_/g, " ");
}

function BuildingDetail({ defId }: { defId: BuildingDefId }) {
  const def = buildingDefs[defId];
  const colorHex = `#${def.color.toString(16).padStart(6, "0")}`;
  const upkeepEntries = Object.entries(def.upkeep).filter(([, v]) => v > 0);
  const hasRecipes = def.recipes && def.recipes.length > 0;
  const hasEffects = def.passiveEffects && def.passiveEffects.length > 0;
  const hasStorage = def.storageCaps && Object.keys(def.storageCaps).length > 0;
  const hasStaffing = def.staffing && (def.staffing.priests || def.staffing.custodians || def.staffing.carriers || def.staffing.visitors);

  return (
    <div className="building-detail">
      {/* Color swatch + name */}
      <div className="building-detail-header">
        <div className="building-detail-visual">
          <PrecinctArtThumb
            defId={defId}
            alt={def.name}
            className="building-detail-art"
          />
          <div className="building-swatch" style={{ background: colorHex }} />
        </div>
        <div>
          <div className="building-detail-name">{def.name}</div>
          <div className="building-detail-category">{def.category}</div>
        </div>
      </div>

      {/* Description */}
      <p className="building-detail-desc">{def.description}</p>

      {/* Cost & upkeep */}
      <div className="building-detail-section">
        <div className="building-detail-row">
          <span className="building-detail-label">Build Cost</span>
          <span className="building-detail-value">{def.costGold} gold</span>
        </div>
        <div className="building-detail-row">
          <span className="building-detail-label">Durability</span>
          <span className="building-detail-value">{def.maxCondition} HP</span>
        </div>
        {def.requiresPriest ? (
          <div className="building-detail-row">
            <span className="building-detail-label">Requires</span>
            <span className="building-detail-value building-detail-priest">Priest</span>
          </div>
        ) : null}
        {upkeepEntries.length > 0 ? (
          <div className="building-detail-row">
            <span className="building-detail-label">Upkeep</span>
            <span className="building-detail-value">
              {upkeepEntries.map(([id, amount]) => `${Number(amount).toFixed(3)} ${formatResourceName(id)}`).join(", ")}/day
            </span>
          </div>
        ) : (
          <div className="building-detail-row">
            <span className="building-detail-label">Upkeep</span>
            <span className="building-detail-value opacity-50">None</span>
          </div>
        )}
      </div>

      {/* Production recipes */}
      {hasRecipes ? (
        <div className="building-detail-section">
          <div className="building-detail-section-title">Production</div>
          {def.recipes!.map((recipe) => {
            const consumes = Object.entries(recipe.consumes).filter(([, v]) => v > 0);
            const produces = Object.entries(recipe.produces).filter(([, v]) => v > 0);
            return (
              <div key={recipe.id} className="building-detail-recipe">
                {consumes.length > 0 ? (
                  <div className="building-detail-recipe-line">
                    <span className="recipe-label">Uses</span>
                    {consumes.map(([id, amount]) => (
                      <span key={id} className="recipe-chip consumes">{Number(amount).toFixed(2)} {formatResourceName(id)}</span>
                    ))}
                  </div>
                ) : null}
                {produces.length > 0 ? (
                  <div className="building-detail-recipe-line">
                    <span className="recipe-label">Makes</span>
                    {produces.map(([id, amount]) => (
                      <span key={id} className="recipe-chip produces">{Number(amount).toFixed(2)} {formatResourceName(id)}</span>
                    ))}
                  </div>
                ) : null}
                {recipe.notes ? <div className="building-detail-note">{recipe.notes}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Passive effects */}
      {hasEffects ? (
        <div className="building-detail-section">
          <div className="building-detail-section-title">Effects</div>
          {def.passiveEffects!.map((effect) => (
            <div key={effect.id} className="building-detail-effect">
              <span className="effect-kind">{effect.kind.replace(/_/g, " ")}</span>
              <span className="effect-value">+{effect.value}</span>
              {effect.notes ? <div className="building-detail-note">{effect.notes}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Storage */}
      {hasStorage ? (
        <div className="building-detail-section">
          <div className="building-detail-section-title">Storage Capacity</div>
          <div className="building-detail-storage">
            {Object.entries(def.storageCaps!).map(([id, cap]) => (
              <span key={id} className="storage-chip">{formatResourceName(id)} {cap}</span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Staffing */}
      {hasStaffing ? (
        <div className="building-detail-section">
          <div className="building-detail-section-title">Staffing</div>
          {def.staffing!.priests ? (
            <div className="building-detail-row">
              <span className="building-detail-label">Priests</span>
              <span className="building-detail-value">
                {Object.entries(def.staffing!.priests).map(([role, count]) => `${count} ${role.replace(/_/g, " ")}`).join(", ")}
              </span>
            </div>
          ) : null}
          {def.staffing!.custodians ? (
            <div className="building-detail-row">
              <span className="building-detail-label">Custodians</span>
              <span className="building-detail-value">{def.staffing!.custodians}</span>
            </div>
          ) : null}
          {def.staffing!.carriers ? (
            <div className="building-detail-row">
              <span className="building-detail-label">Carriers</span>
              <span className="building-detail-value">{def.staffing!.carriers}</span>
            </div>
          ) : null}
          {def.staffing!.visitors ? (
            <div className="building-detail-row">
              <span className="building-detail-label">Visitor Slots</span>
              <span className="building-detail-value">{def.staffing!.visitors}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function renderPaletteItem(
  def: BuildingDef,
  activeTool: PlacementTool,
  inspectedBuilding: BuildingDefId | null,
  goldAmount: number,
  onItemClick: (defId: BuildingDefId, locked: boolean) => void,
) {
  const isActive = activeTool === def.id;
  const isInspected = inspectedBuilding === def.id;
  const affordable = goldAmount >= def.costGold;
  const colorHex = `#${def.color.toString(16).padStart(6, "0")}`;
  const workLabel = def.constructionWork ? `${def.constructionWork}w` : null;

  return (
    <button
      key={def.id}
      className={`build-item ${isActive ? "active" : ""} ${isInspected && !isActive ? "inspected" : ""} ${!affordable ? "building-item-unaffordable" : ""}`}
      id={`tool-${def.id}`}
      onClick={() => onItemClick(def.id, false)}
      title={def.description}
      type="button"
    >
      <span className="build-item-main">
        <PrecinctArtThumb defId={def.id} alt="" className="build-item-thumb" />
        <span className="build-item-fallback" style={{ background: colorHex }} aria-hidden="true" />
        <span>{def.name}</span>
      </span>
      <span className="build-item-cost-group">
        <span className={`build-item-cost ${affordable ? "" : "building-cost-insufficient"}`}>
          {def.costGold}g{workLabel ? ` \u00B7 ${workLabel}` : ""}
        </span>
        {!affordable ? <span className="build-item-insufficient-label">Insufficient gold</span> : null}
      </span>
    </button>
  );
}

export function BuildPalette({ activeTool, unlockedBuildingIds, resources, onSetTool }: BuildPaletteProps) {
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set(CATEGORY_ORDER));
  const [inspectedBuilding, setInspectedBuilding] = useState<BuildingDefId | null>(null);
  const unlockedSet = new Set<string>(unlockedBuildingIds);
  const goldAmount = resources.gold?.amount ?? 0;

  const grouped = new Map<string, BuildingDef[]>();
  for (const def of Object.values(buildingDefs)) {
    // Filter: only show unlocked or base-tier buildings
    if (!unlockedSet.has(def.id) && def.unlockTier !== undefined) continue;
    const cat = def.category;
    if (!grouped.has(cat)) {
      grouped.set(cat, []);
    }
    grouped.get(cat)!.push(def);
  }
  // Sort each category by tier
  for (const [, items] of grouped) {
    items.sort((a, b) => {
      const aIdx = TIER_ORDER.indexOf(a.unlockTier ?? "base");
      const bIdx = TIER_ORDER.indexOf(b.unlockTier ?? "base");
      return aIdx - bIdx;
    });
  }

  function toggleCategory(cat: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  function handleItemClick(defId: BuildingDefId, locked: boolean) {
    if (locked) {
      // Show details even for locked buildings
      setInspectedBuilding((prev) => (prev === defId ? null : defId));
      return;
    }
    if (activeTool === defId) {
      // Already active — toggle detail panel
      setInspectedBuilding((prev) => (prev === defId ? null : defId));
    } else {
      // Select the tool and show details
      onSetTool(defId);
      setInspectedBuilding(defId);
    }
  }

  return (
    <div className="build-palette">
      <div className="pad-palette">
        <button
          className={`build-item w-full ${activeTool === "select" ? "active" : ""}`}
          id="tool-select"
          onClick={() => { onSetTool("select"); setInspectedBuilding(null); }}
          type="button"
        >
          Select
        </button>
      </div>

      {/* Building detail popup */}
      {inspectedBuilding ? (
        <div className="building-detail-container">
          <button
            className="building-detail-close"
            onClick={() => setInspectedBuilding(null)}
            type="button"
          >
            <Icon name="close" size={14} />
          </button>
          <BuildingDetail defId={inspectedBuilding} />
        </div>
      ) : null}

      {CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat);
        if (!items || items.length === 0) return null;
        const meta = CATEGORY_META[cat] ?? { label: cat, iconName: "" };
        const isOpen = openCategories.has(cat);

        return (
          <div key={cat} className="build-category">
            <button className="build-category-header" onClick={() => toggleCategory(cat)} type="button">
              <span>
                <span className="cat-icon"><Icon name={meta.iconName} size={14} /></span>
                {meta.label}
              </span>
              <span className={`chevron ${isOpen ? "open" : ""}`}>&#9654;</span>
            </button>
            {isOpen ? (
              <div className="build-category-items">
                {cat === "production" && items.length >= 5 ? (
                  // Subcategory grouping for production
                  (() => {
                    const subgroups = new Map<string, BuildingDef[]>();
                    for (const def of items) {
                      const sg = getProductionSubgroup(def);
                      if (!subgroups.has(sg)) subgroups.set(sg, []);
                      subgroups.get(sg)!.push(def);
                    }
                    return (
                      <>
                        {PRODUCTION_SUBGROUPS.map((sg) => {
                          const groupItems = subgroups.get(sg.label);
                          if (!groupItems || groupItems.length === 0) return null;
                          return (
                            <div key={sg.label} className="toolbar-subgroup">
                              <span className="toolbar-subgroup-label">{sg.label}</span>
                              <div className="toolbar-subgroup-items">
                                {groupItems.map((def) => renderPaletteItem(def, activeTool, inspectedBuilding, goldAmount, handleItemClick))}
                              </div>
                            </div>
                          );
                        })}
                        {subgroups.has("Other") ? (
                          <div className="toolbar-subgroup">
                            <span className="toolbar-subgroup-label">Other</span>
                            <div className="toolbar-subgroup-items">
                              {subgroups.get("Other")!.map((def) => renderPaletteItem(def, activeTool, inspectedBuilding, goldAmount, handleItemClick))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    );
                  })()
                ) : (
                  items.map((def) => renderPaletteItem(def, activeTool, inspectedBuilding, goldAmount, handleItemClick))
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
