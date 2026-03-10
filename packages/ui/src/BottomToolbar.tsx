import { buildingDefs } from "@the-oracle/content";
import type { BuildingDef, BuildingDefId, ResourceId } from "@the-oracle/content";
import type { GameState, PlacementTool } from "@the-oracle/core";
import React, { useMemo, useState } from "react";
import { Icon } from "./Icons";

type BottomToolbarProps = {
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
  hospitality: { label: "Visitor Facilities", iconName: "hospitality" },
};

const CATEGORY_ORDER = [
  "processional",
  "ritual",
  "housing",
  "storage",
  "production",
  "trade",
  "hospitality",
] as const;

const TIER_ORDER = ["base", "obscure", "recognized", "revered", "panhellenic"];

/** Subcategory grouping for production buildings based on output resource type. */
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

function groupBuildingsByCategory() {
  const grouped = new Map<string, BuildingDef[]>();
  for (const def of Object.values(buildingDefs)) {
    const cat = def.category;
    if (!grouped.has(cat)) {
      grouped.set(cat, []);
    }
    grouped.get(cat)!.push(def);
  }
  return grouped;
}

const GROUPED = groupBuildingsByCategory();

function renderBuildingItem(
  def: BuildingDef,
  activeTool: PlacementTool,
  goldAmount: number,
  onItemClick: (defId: BuildingDefId) => void,
) {
  const isActive = activeTool === def.id;
  const affordable = goldAmount >= def.costGold;
  const workLabel = def.constructionWork ? `${def.constructionWork}w` : null;

  return (
    <button
      key={def.id}
      type="button"
      role="option"
      id={`tool-${def.id}`}
      aria-selected={isActive}
      className={`bottom-toolbar-item ${isActive ? "active" : ""} ${!affordable ? "building-item-unaffordable" : ""}`}
      onClick={() => onItemClick(def.id)}
      title={def.description}
    >
      <span>{def.name}</span>
      <span className="bottom-toolbar-item-cost-group">
        <span className={`bottom-toolbar-item-cost ${affordable ? "affordable" : "expensive"}`}>
          {def.costGold}g{workLabel ? ` \u00B7 ${workLabel}` : ""}
        </span>
        {!affordable ? <span className="bottom-toolbar-insufficient-label">Insufficient gold</span> : null}
      </span>
    </button>
  );
}

export function BottomToolbar({
  activeTool,
  unlockedBuildingIds,
  resources,
  onSetTool,
}: BottomToolbarProps) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const unlockedSet = new Set<string>(unlockedBuildingIds);

  const goldAmount = resources.gold?.amount ?? 0;

  /** Filter to unlocked buildings and sort by tier. */
  const visibleItems = useMemo(() => {
    if (!openCategory) return null;
    const categoryBuildings = GROUPED.get(openCategory);
    if (!categoryBuildings) return null;

    const filtered = categoryBuildings.filter(
      (b) => unlockedSet.has(b.id) || b.unlockTier === undefined,
    );

    filtered.sort((a, b) => {
      const aIdx = TIER_ORDER.indexOf(a.unlockTier ?? "base");
      const bIdx = TIER_ORDER.indexOf(b.unlockTier ?? "base");
      return aIdx - bIdx;
    });

    return filtered;
  }, [openCategory, unlockedSet]);

  function handleCategoryClick(cat: string) {
    setOpenCategory((prev) => (prev === cat ? null : cat));
  }

  function handleItemClick(defId: BuildingDefId) {
    onSetTool(defId);
    setOpenCategory(null);
  }

  function handleSelectClick() {
    onSetTool("select");
    setOpenCategory(null);
  }

  const activeToolLabel =
    activeTool === "select"
      ? "Select"
      : buildingDefs[activeTool]?.name ?? activeTool;

  /** Group visible items into subcategories for large production lists. */
  function renderExpansionContent(items: BuildingDef[], category: string) {
    const useSubgroups = category === "production" && items.length >= 5;

    if (!useSubgroups) {
      return items.map((def) =>
        renderBuildingItem(def, activeTool, goldAmount, handleItemClick),
      );
    }

    // Group by production subcategory
    const groups = new Map<string, BuildingDef[]>();
    for (const def of items) {
      const subgroup = getProductionSubgroup(def);
      if (!groups.has(subgroup)) {
        groups.set(subgroup, []);
      }
      groups.get(subgroup)!.push(def);
    }

    // Render each subcategory with a header
    const rendered: React.ReactNode[] = [];
    for (const sg of PRODUCTION_SUBGROUPS) {
      const groupItems = groups.get(sg.label);
      if (!groupItems || groupItems.length === 0) continue;
      rendered.push(
        <div key={sg.label} className="toolbar-subgroup">
          <span className="toolbar-subgroup-label">{sg.label}</span>
          <div className="toolbar-subgroup-items">
            {groupItems.map((def) =>
              renderBuildingItem(def, activeTool, goldAmount, handleItemClick),
            )}
          </div>
        </div>,
      );
    }
    // "Other" group for anything that doesn't match
    const otherItems = groups.get("Other");
    if (otherItems && otherItems.length > 0) {
      rendered.push(
        <div key="other" className="toolbar-subgroup">
          <span className="toolbar-subgroup-label">Other</span>
          <div className="toolbar-subgroup-items">
            {otherItems.map((def) =>
              renderBuildingItem(def, activeTool, goldAmount, handleItemClick),
            )}
          </div>
        </div>,
      );
    }
    return rendered;
  }

  return (
    <div className="bottom-toolbar" role="toolbar" aria-label="Build toolbar">
      {/* Select tool */}
      <button
        type="button"
        className={`bottom-toolbar-btn bottom-toolbar-select ${activeTool === "select" ? "active" : ""}`}
        id="tool-select"
        onClick={handleSelectClick}
        aria-pressed={activeTool === "select"}
      >
        Select
      </button>

      <div className="bottom-toolbar-divider" aria-hidden="true" />

      {/* Category tabs */}
      {CATEGORY_ORDER.map((cat) => {
        const meta = CATEGORY_META[cat] ?? { label: cat, iconName: "" };
        const isOpen = openCategory === cat;
        return (
          <button
            key={cat}
            type="button"
            className={`bottom-toolbar-btn ${isOpen ? "active" : ""}`}
            id={`tool-category-${cat}`}
            onClick={() => handleCategoryClick(cat)}
            aria-expanded={isOpen}
            aria-controls={isOpen ? "bottom-toolbar-expansion" : undefined}
          >
            <span className="bottom-toolbar-btn-icon" aria-hidden="true">
              <Icon name={meta.iconName} size={14} />
            </span>
            {meta.label}
          </button>
        );
      })}

      {/* Active tool mode indicator */}
      <span className="bottom-toolbar-mode" aria-live="polite">
        {activeToolLabel}
      </span>

      {/* Expansion panel */}
      {openCategory && visibleItems && visibleItems.length > 0 ? (
        <div
          id="bottom-toolbar-expansion"
          className="bottom-toolbar-expansion"
          role="listbox"
          aria-label={`${CATEGORY_META[openCategory]?.label ?? openCategory} buildings`}
        >
          {renderExpansionContent(visibleItems, openCategory)}
        </div>
      ) : null}
    </div>
  );
}
