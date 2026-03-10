import { describe, expect, it } from "vitest";

import { createInitialExcavationState } from "../src/state/excavation";
import { createInitialState } from "../src/state/initialState";
import { reduceCommand } from "../src/reducers";
import { runSimulationTick } from "../src/simulation/updateDay";
import type { GameState } from "../src/state/gameState";
import type { ExcavationSite, SacredSite } from "../src/state/excavation";

describe("excavation", () => {
  it("generates excavation sites from world seed", () => {
    const excavation = createInitialExcavationState(42);
    expect(excavation.sites.length).toBeGreaterThanOrEqual(2);
    expect(excavation.sites.length).toBeLessThanOrEqual(4);
    // First site should be discovered
    expect(excavation.sites[0]!.status).toBe("discovered");
    // Subsequent sites should be undiscovered
    if (excavation.sites.length > 1) {
      expect(excavation.sites[1]!.status).toBe("undiscovered");
    }
  });

  it("generates layers with valid contents", () => {
    const excavation = createInitialExcavationState(123);
    const validContents = new Set(["empty", "pottery", "relic", "sacred_fragment", "ancient_chamber"]);
    for (const site of excavation.sites) {
      expect(site.layers.length).toBe(site.maxDepth);
      for (const layer of site.layers) {
        expect(validContents.has(layer.contents)).toBe(true);
        expect(layer.revealed).toBe(false);
      }
    }
  });

  it("BeginExcavationCommand changes site status to excavating", () => {
    const state = createInitialState();
    const site = state.excavation!.sites.find((s) => s.status === "discovered");
    if (!site) {
      // Skip if no discovered sites (seed-dependent)
      return;
    }

    const { state: next } = reduceCommand(state, {
      type: "BeginExcavationCommand",
      siteId: site.id
    });

    const updatedSite = next.excavation!.sites.find((s) => s.id === site.id);
    expect(updatedSite!.status).toBe("excavating");
  });

  it("generates sacred sites", () => {
    const excavation = createInitialExcavationState(99);
    expect(excavation.sacredSites.length).toBeGreaterThanOrEqual(1);
    const validKinds = new Set(["oracle_spring", "earth_fissure", "ancient_altar", "sacred_grove"]);
    for (const sacred of excavation.sacredSites) {
      expect(validKinds.has(sacred.kind)).toBe(true);
      expect(sacred.discovered).toBe(false);
      expect(sacred.active).toBe(false);
    }
  });

  it("different seeds produce different site layouts", () => {
    const excavation1 = createInitialExcavationState(1);
    const excavation2 = createInitialExcavationState(9999);
    // While technically possible to collide, extremely unlikely
    const sites1 = excavation1.sites.map((s) => `${s.tile.x},${s.tile.y}`).join(";");
    const sites2 = excavation2.sites.map((s) => `${s.tile.x},${s.tile.y}`).join(";");
    expect(sites1).not.toBe(sites2);
  });

  it("initializes with empty claimedRelics", () => {
    const state = createInitialState();
    expect(state.excavation).toBeDefined();
    expect(state.excavation!.claimedRelics).toEqual([]);
  });

  it("rejects excavation of undiscovered site", () => {
    const state = createInitialState();
    const site = state.excavation?.sites.find((s) => s.status === "undiscovered");
    if (!site) return;

    const { state: next } = reduceCommand(state, {
      type: "BeginExcavationCommand",
      siteId: site.id
    });
    const updatedSite = next.excavation?.sites.find((s) => s.id === site.id);
    expect(updatedSite?.status).toBe("undiscovered");
  });

  it("excavation progresses with simulation ticks", () => {
    let state = createInitialState();
    if (!state.excavation) return;
    const siteIndex = state.excavation.sites.findIndex(
      (s) => s.status === "discovered" || s.status === "excavating"
    );
    if (siteIndex === -1) return;

    // Set up an excavating site and position clock so a day boundary is crossed
    state = {
      ...state,
      excavation: {
        ...state.excavation,
        sites: state.excavation.sites.map((s, i) =>
          i === siteIndex
            ? { ...s, status: "excavating" as const, depth: 0 }
            : s
        )
      },
      clock: {
        ...state.clock,
        // Set clock so the next tick crosses a day boundary
        day: 2,
        tick: state.clock.ticksPerDay * 2
      }
    };

    // Run 1 tick with a previousClock from the prior day so day change is detected
    const previousClock = { ...state.clock, day: 1 };
    const { state: next } = runSimulationTick(state, 1, { previousClock });
    const updatedSite = next.excavation?.sites[siteIndex];
    expect(updatedSite?.depth).toBeGreaterThan(0);
  });

  it("sacred site activation costs resources", () => {
    let state = createInitialState();
    if (!state.excavation?.sacredSites.length) return;

    const sacredSite = state.excavation.sacredSites[0]!;
    state = {
      ...state,
      excavation: {
        ...state.excavation,
        sacredSites: state.excavation.sacredSites.map((s, i) =>
          i === 0 ? { ...s, discovered: true, active: false } : s
        )
      },
      resources: {
        ...state.resources,
        gold: { ...state.resources.gold, amount: 50 },
        incense: { ...state.resources.incense, amount: 10 }
      }
    };

    const { state: next } = reduceCommand(state, {
      type: "ActivateSacredSiteCommand",
      siteId: sacredSite.id
    });
    expect(next.resources.gold.amount).toBeLessThan(50);
  });

  it("ClaimRelicCommand adds relic to claimedRelics", () => {
    let state = createInitialState();
    if (!state.excavation) return;

    // Find a site with a relic layer
    let targetSite: ExcavationSite | undefined;
    let targetLayerDepth: number | undefined;

    for (const site of state.excavation.sites) {
      for (const layer of site.layers) {
        if (layer.relicId && (layer.contents === "relic" || layer.contents === "sacred_fragment")) {
          targetSite = site;
          targetLayerDepth = layer.depth;
          break;
        }
      }
      if (targetSite) break;
    }

    if (!targetSite || targetLayerDepth === undefined) return;

    // Make the layer revealed so we can claim it
    state = {
      ...state,
      excavation: {
        ...state.excavation,
        sites: state.excavation.sites.map((s) =>
          s.id === targetSite!.id
            ? {
                ...s,
                status: "excavating" as const,
                layers: s.layers.map((l) =>
                  l.depth === targetLayerDepth ? { ...l, revealed: true } : l
                )
              }
            : s
        )
      }
    };

    const { state: next } = reduceCommand(state, {
      type: "ClaimRelicCommand",
      siteId: targetSite.id,
      layerDepth: targetLayerDepth
    });

    expect(next.excavation!.claimedRelics.length).toBe(1);
    expect(next.excavation!.claimedRelics[0]!.discoveredDay).toBe(next.clock.day);
  });

  it("excavation initializes with sites and sacred sites", () => {
    const state = createInitialState();
    expect(state.excavation).toBeDefined();
    expect(state.excavation!.sites.length).toBeGreaterThan(0);
    expect(state.excavation!.sacredSites.length).toBeGreaterThan(0);
  });
});
