import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state/initialState";
import { advanceFestivals, advanceWeather } from "../src/simulation/festivals";
import type { ActiveFestival, GameState, ResourceId, Season, WeatherCondition } from "../src/state/gameState";
import { festivalDefs, festivalDefById } from "@the-oracle/content";

function withMonth(state: GameState, month: number, year = 1): GameState {
  const seasons: Record<number, Season> = {
    1: "Spring", 2: "Spring", 3: "Spring",
    4: "Summer", 5: "Summer", 6: "Summer",
    7: "Autumn", 8: "Autumn", 9: "Autumn",
    10: "Winter", 11: "Winter", 12: "Winter",
  };
  return {
    ...state,
    clock: {
      ...state.clock,
      month,
      year,
      season: seasons[month] ?? "Spring",
    },
    lastFestivalCheck: undefined,
  };
}

function withResource(state: GameState, resourceId: ResourceId, amount: number): GameState {
  const res = state.resources[resourceId];
  if (!res) return state;
  return {
    ...state,
    resources: {
      ...state.resources,
      [resourceId]: { ...res, amount },
    },
  };
}

function withFestivals(state: GameState, festivals: ActiveFestival[]): GameState {
  return { ...state, festivals };
}

function withSeason(state: GameState, season: Season): GameState {
  return {
    ...state,
    clock: { ...state.clock, season },
  };
}

describe("Festival System", () => {
  describe("Festival Triggering", () => {
    it("activates a festival when the current month matches", () => {
      const base = createInitialState();
      // Theophania is month 1 (annual)
      const state = withMonth(base, 1, 1);
      const result = advanceFestivals(state);

      const active = result.festivals?.find((f) => f.defId === "theophania");
      expect(active).toBeDefined();
      expect(active!.resolved).toBe(false);
    });

    it("does not activate a festival when month does not match", () => {
      const base = createInitialState();
      // Month 2 has no festivals
      const state = withMonth(base, 2, 1);
      const result = advanceFestivals(state);

      const active = (result.festivals ?? []).filter((f) => !f.resolved);
      expect(active.length).toBe(0);
    });

    it("activates quadrennial festival only on years divisible by 4", () => {
      const base = createInitialState();

      // Pythian Games: month 8, quadrennial
      // Year 3: should NOT trigger
      let state = withMonth(base, 8, 3);
      let result = advanceFestivals(state);
      let pythian = result.festivals?.find((f) => f.defId === "pythian-games");
      expect(pythian).toBeUndefined();

      // Year 4: should trigger
      state = withMonth(base, 8, 4);
      result = advanceFestivals(state);
      pythian = result.festivals?.find((f) => f.defId === "pythian-games");
      expect(pythian).toBeDefined();
      expect(pythian!.resolved).toBe(false);
    });

    it("generates an advance warning in the event feed", () => {
      const base = createInitialState();
      const state = withMonth(base, 3, 1); // Theoxenia month
      const result = advanceFestivals(state);

      const warning = result.eventFeed.find((e) =>
        e.text.includes("Theoxenia") && e.text.includes("approaches")
      );
      expect(warning).toBeDefined();
    });
  });

  describe("Resource Demand Checking", () => {
    it("resolves festival as success when resources are sufficient", () => {
      const base = createInitialState();
      // Theophania requires incense:15, sacred_water:10
      let state = withMonth(base, 1, 1);
      state = withResource(state, "incense", 20);
      state = withResource(state, "sacred_water", 15);

      // Activate festival
      state = advanceFestivals(state);

      // Now resolve: set the festival endDay to current day so it resolves
      const festival = state.festivals!.find((f) => f.defId === "theophania")!;
      state = withFestivals(state, [
        { ...festival, endDay: 0 }, // already expired
      ]);
      // Reset lastFestivalCheck to allow re-processing
      state = { ...state, lastFestivalCheck: undefined };

      const result = advanceFestivals(state);
      const resolved = result.festivals!.find((f) => f.defId === "theophania");
      expect(resolved).toBeDefined();
      expect(resolved!.resolved).toBe(true);
      expect(resolved!.resourcesMet).toBe(true);
    });

    it("resolves festival as failure when resources are insufficient", () => {
      const base = createInitialState();
      let state = withMonth(base, 1, 1);
      state = withResource(state, "incense", 5); // needs 15
      state = withResource(state, "sacred_water", 5); // needs 10

      // Create an already-expired festival
      const festival: ActiveFestival = {
        defId: "theophania",
        startDay: 0,
        endDay: 0,
        resourcesMet: false,
        resolved: false,
      };
      state = withFestivals(state, [festival]);

      const result = advanceFestivals(state);
      const resolved = result.festivals!.find((f) => f.defId === "theophania");
      expect(resolved).toBeDefined();
      expect(resolved!.resolved).toBe(true);
      expect(resolved!.resourcesMet).toBe(false);
    });
  });

  describe("Reward and Penalty Application", () => {
    it("applies success rewards (reputation boost)", () => {
      const base = createInitialState();
      let state = withMonth(base, 1, 1);
      state = withResource(state, "incense", 100);
      state = withResource(state, "sacred_water", 100);
      const initialRep = state.campaign.reputation.score;

      // Create an already-expired festival with sufficient resources
      const festival: ActiveFestival = {
        defId: "theophania",
        startDay: 0,
        endDay: 0,
        resourcesMet: false,
        resolved: false,
      };
      state = withFestivals(state, [festival]);

      const result = advanceFestivals(state);
      const def = festivalDefById("theophania")!;
      const repDelta = def.successRewards.find((r) => r.kind === "reputation_delta");
      expect(result.campaign.reputation.score).toBe(initialRep + (repDelta as { kind: "reputation_delta"; delta: number }).delta);
    });

    it("applies failure penalties (reputation loss)", () => {
      const base = createInitialState();
      let state = withMonth(base, 1, 1);
      state = withResource(state, "incense", 0);
      state = withResource(state, "sacred_water", 0);
      const initialRep = state.campaign.reputation.score;

      const festival: ActiveFestival = {
        defId: "theophania",
        startDay: 0,
        endDay: 0,
        resourcesMet: false,
        resolved: false,
      };
      state = withFestivals(state, [festival]);

      const result = advanceFestivals(state);
      const def = festivalDefById("theophania")!;
      const repDelta = def.failurePenalties.find((r) => r.kind === "reputation_delta");
      expect(result.campaign.reputation.score).toBe(
        Math.max(0, initialRep + (repDelta as { kind: "reputation_delta"; delta: number }).delta)
      );
    });

    it("deducts resources on success", () => {
      const base = createInitialState();
      let state = withMonth(base, 1, 1);
      state = withResource(state, "incense", 50);
      state = withResource(state, "sacred_water", 30);

      const festival: ActiveFestival = {
        defId: "theophania",
        startDay: 0,
        endDay: 0,
        resourcesMet: false,
        resolved: false,
      };
      state = withFestivals(state, [festival]);

      const result = advanceFestivals(state);
      // Theophania demands incense:15, sacred_water:10
      expect(result.resources.incense.amount).toBe(50 - 15);
      expect(result.resources.sacred_water.amount).toBe(30 - 10);
    });
  });

  describe("Weather System", () => {
    it("determines weather based on season and seed", () => {
      const base = createInitialState();
      const state = withSeason(base, "Summer");
      const result = advanceWeather(state);

      expect(result.weather).toBeDefined();
      const validWeather: WeatherCondition[] = ["normal", "drought", "heat_wave"];
      expect(validWeather).toContain(result.weather);
    });

    it("does not produce season-inappropriate weather", () => {
      const base = createInitialState();

      // Test multiple seeds to ensure seasonal appropriateness
      for (let seed = 0; seed < 50; seed++) {
        const state = withSeason({ ...base, worldSeed: seed }, "Winter");
        const result = advanceWeather(state);
        // Winter should never produce drought or heat_wave
        expect(result.weather).not.toBe("drought");
        expect(result.weather).not.toBe("heat_wave");
      }
    });

    it("is deterministic for the same seed", () => {
      const base = createInitialState();
      const state = withSeason(base, "Summer");

      const result1 = advanceWeather(state);
      const result2 = advanceWeather(state);
      expect(result1.weather).toBe(result2.weather);
    });
  });
});
