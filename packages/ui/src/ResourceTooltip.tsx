import { buildingDefs } from "@the-oracle/content";
import type { ResourceId } from "@the-oracle/content";
import type { BuildingInstance, ResourceState } from "@the-oracle/core";
import { isBuildingUnderConstruction } from "@the-oracle/core";
import React, { useMemo } from "react";

type IncomeSource = {
  buildingName: string;
  amount: number;
};

type DrainSource = {
  buildingName: string;
  amount: number;
  kind: "upkeep" | "recipe";
};

type ResourceBreakdown = {
  income: IncomeSource[];
  drains: DrainSource[];
  netPerDay: number;
};

type SparklinePoint = {
  value: number;
};

type ResourceTooltipProps = {
  resourceId: ResourceId;
  resourceState: ResourceState;
  label: string;
  buildings: BuildingInstance[];
};

function computeBreakdown(
  resourceId: ResourceId,
  buildings: BuildingInstance[]
): ResourceBreakdown {
  const income: IncomeSource[] = [];
  const drains: DrainSource[] = [];

  for (const building of buildings) {
    if (isBuildingUnderConstruction(building)) continue;

    const def = buildingDefs[building.defId];
    if (!def) continue;

    // Check upkeep costs (these are drains)
    const upkeepAmount = def.upkeep[resourceId];
    if (upkeepAmount && upkeepAmount > 0) {
      drains.push({
        buildingName: def.name,
        amount: upkeepAmount,
        kind: "upkeep",
      });
    }

    // Check recipes
    if (def.recipes) {
      for (const recipe of def.recipes) {
        const produceAmount = recipe.produces[resourceId];
        if (produceAmount && produceAmount > 0) {
          income.push({
            buildingName: def.name,
            amount: produceAmount * recipe.dailyRate,
          });
        }

        const consumeAmount = recipe.consumes[resourceId];
        if (consumeAmount && consumeAmount > 0) {
          drains.push({
            buildingName: def.name,
            amount: consumeAmount * recipe.dailyRate,
            kind: "recipe",
          });
        }
      }
    }
  }

  const totalIncome = income.reduce((sum, s) => sum + s.amount, 0);
  const totalDrain = drains.reduce((sum, s) => sum + s.amount, 0);

  return {
    income,
    drains,
    netPerDay: totalIncome - totalDrain,
  };
}

function generateSparkline(
  currentValue: number,
  trend: number,
  pointCount: number
): SparklinePoint[] {
  // Synthetic sparkline: project backwards from current value using trend
  const points: SparklinePoint[] = [];
  for (let i = 0; i < pointCount; i++) {
    const daysBack = pointCount - 1 - i;
    // Add slight noise for visual interest
    const noise = Math.sin(i * 0.7) * Math.abs(trend) * 2;
    const value = Math.max(0, currentValue - trend * daysBack + noise);
    points.push({ value });
  }
  return points;
}

function SparklineSvg({ points }: { points: SparklinePoint[] }) {
  if (points.length < 2) return null;

  const width = 60;
  const height = 20;
  const padding = 1;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;

  const xStep = (width - padding * 2) / (points.length - 1);

  const polylinePoints = points
    .map((p, i) => {
      const x = padding + i * xStep;
      const y = height - padding - ((p.value - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const lastValue = values[values.length - 1];
  const lineColor = lastValue >= avg ? "var(--green)" : "var(--red)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="resource-sparkline"
      aria-hidden="true"
    >
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ResourceTooltip({
  resourceId,
  resourceState,
  label,
  buildings,
}: ResourceTooltipProps) {
  const breakdown = useMemo(
    () => computeBreakdown(resourceId, buildings),
    [resourceId, buildings]
  );

  const netPerDay = breakdown.netPerDay;
  const daysToDepletion =
    netPerDay < -0.001 && resourceState.amount > 0
      ? Math.floor(resourceState.amount / Math.abs(netPerDay))
      : null;

  const sparklinePoints = useMemo(
    () => generateSparkline(resourceState.amount, resourceState.trend, 30),
    [resourceState.amount, resourceState.trend]
  );

  return (
    <div className="resource-tooltip" role="tooltip">
      <div className="resource-tooltip-header">
        <span className="resource-tooltip-title">{label}</span>
        <span className="resource-tooltip-amount">
          {resourceState.amount.toFixed(0)} / {resourceState.capacity.toFixed(0)}
        </span>
      </div>

      <SparklineSvg points={sparklinePoints} />

      {breakdown.income.length > 0 ? (
        <div className="resource-tooltip-section">
          <span className="resource-tooltip-section-label">Income</span>
          {breakdown.income.map((source, i) => (
            <div key={`inc-${i}`} className="resource-tooltip-row">
              <span className="resource-tooltip-row-name">{source.buildingName}</span>
              <span className="resource-tooltip-row-value income">
                +{source.amount.toFixed(2)}/d
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {breakdown.drains.length > 0 ? (
        <div className="resource-tooltip-section">
          <span className="resource-tooltip-section-label">Drains</span>
          {breakdown.drains.map((source, i) => (
            <div key={`drn-${i}`} className="resource-tooltip-row">
              <span className="resource-tooltip-row-name">
                {source.buildingName}
                {source.kind === "upkeep" ? " (upkeep)" : ""}
              </span>
              <span className="resource-tooltip-row-value drain">
                -{source.amount.toFixed(2)}/d
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="resource-tooltip-footer">
        <div className="resource-tooltip-row">
          <span className="resource-tooltip-row-name">Net change</span>
          <span
            className={`resource-tooltip-row-value ${
              netPerDay > 0.001 ? "income" : netPerDay < -0.001 ? "drain" : ""
            }`}
          >
            {netPerDay > 0 ? "+" : ""}
            {netPerDay.toFixed(2)}/d
          </span>
        </div>
        {daysToDepletion !== null ? (
          <div className="resource-tooltip-depletion">
            Depleted in ~{daysToDepletion} day{daysToDepletion !== 1 ? "s" : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Threshold classification ──

type ResourceSeverity = "normal" | "warning" | "critical";

const CRITICAL_THRESHOLDS: Record<string, number> = {
  gold: 5,
  grain: 10,
  bread: 10,
  olives: 10,
  olive_oil: 8,
  incense: 8,
  sacred_water: 8,
  sacred_animals: 3,
};

const WARNING_CAPACITY_RATIO = 0.3;

export function getResourceSeverity(
  resourceId: ResourceId,
  state: ResourceState
): ResourceSeverity {
  const criticalThreshold = CRITICAL_THRESHOLDS[resourceId] ?? 5;
  if (state.amount < criticalThreshold) return "critical";

  // Warning when below 30% of capacity (with a minimum capacity floor)
  const effectiveCapacity = Math.max(state.capacity, 20);
  if (state.amount < effectiveCapacity * WARNING_CAPACITY_RATIO) return "warning";

  return "normal";
}
