import { describe, it, expect } from "vitest";
import {
  buildingDefs,
  resourceDefs,
  scenarioDefs,
  ageDefs,
  legendaryConsultationDefs,
  techDefs,
  techDefById
} from "@the-oracle/content";
import type { ResourceId, TechId, BuildingDefId } from "@the-oracle/content";
import { validateContentIntegrity } from "@the-oracle/content";

describe("Content Validation", () => {
  const resourceIds = resourceDefs.map((r) => r.id) as readonly ResourceId[];
  const ageIds = ageDefs.map((a) => a.id);
  const legendaryDefs = Object.fromEntries(
    Object.entries(legendaryConsultationDefs)
  );

  it("all building definitions pass validation", () => {
    const result = validateContentIntegrity({
      buildingDefs,
      resourceIds,
      scenarioDefs,
      ageIds,
      legendaryDefs
    });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("all resource IDs are unique", () => {
    const ids = resourceDefs.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("knowledge resource exists with research category", () => {
    const knowledge = resourceDefs.find((r) => r.id === "knowledge");
    expect(knowledge).toBeDefined();
    expect(knowledge!.category).toBe("research");
  });

  it("all new material resources exist", () => {
    const materialIds = ["logs", "stone", "planks", "cut_stone"];
    for (const id of materialIds) {
      const def = resourceDefs.find((r) => r.id === id);
      expect(def, `Resource "${id}" should exist`).toBeDefined();
      expect(def!.category).toBe("material");
    }
  });

  it("all tech prerequisites reference valid tech IDs", () => {
    const validIds = new Set(techDefs.map((t) => t.id));
    for (const tech of techDefs) {
      if (tech.requires) {
        for (const req of tech.requires) {
          expect(validIds.has(req), `Tech "${tech.id}" requires unknown "${req}"`).toBe(true);
        }
      }
    }
  });

  it("all tech effects reference valid building IDs", () => {
    const validBuildingIds = new Set(Object.keys(buildingDefs));
    for (const tech of techDefs) {
      for (const effect of tech.effects) {
        if ("buildingId" in effect) {
          expect(
            validBuildingIds.has(effect.buildingId),
            `Tech "${tech.id}" references unknown building "${effect.buildingId}"`
          ).toBe(true);
        }
      }
    }
  });

  it("all tech production_bonus effects reference valid recipe IDs", () => {
    for (const tech of techDefs) {
      for (const effect of tech.effects) {
        if (effect.kind === "production_bonus") {
          const building = buildingDefs[effect.buildingId as BuildingDefId];
          expect(building, `Tech "${tech.id}" references unknown building "${effect.buildingId}"`).toBeDefined();
          const recipe = building.recipes?.find((r) => r.id === effect.recipeId);
          expect(recipe, `Tech "${tech.id}" references unknown recipe "${effect.recipeId}" on building "${effect.buildingId}"`).toBeDefined();
        }
      }
    }
  });

  it("no circular tech prerequisites", () => {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function hasCycle(techId: string): boolean {
      if (inStack.has(techId)) return true;
      if (visited.has(techId)) return false;
      visited.add(techId);
      inStack.add(techId);
      const tech = techDefById[techId];
      if (tech?.requires) {
        for (const req of tech.requires) {
          if (hasCycle(req)) return true;
        }
      }
      inStack.delete(techId);
      return false;
    }

    for (const tech of techDefs) {
      expect(hasCycle(tech.id), `Circular prerequisite involving "${tech.id}"`).toBe(false);
    }
  });

  it("new expansion buildings have valid definitions", () => {
    const expansionIds = ["hylotomos_camp", "lithotomia", "tekton_ergasterion", "lithoxoos", "ergasterion", "apotheke"] as const;
    for (const id of expansionIds) {
      const def = buildingDefs[id];
      expect(def, `Building "${id}" should exist`).toBeDefined();
      expect(def.constructionWork).toBeGreaterThan(0);
      const hasFunctionality = (def.recipes?.length ?? 0) + (def.passiveEffects?.length ?? 0) + (def.housingCapacity ? 1 : 0) + (def.storageCaps ? 1 : 0);
      expect(hasFunctionality).toBeGreaterThan(0);
    }
  });

  it("library has knowledge recipe", () => {
    const library = buildingDefs["library"];
    const knowledgeRecipe = library.recipes?.find((r) => r.id === "generate-knowledge");
    expect(knowledgeRecipe).toBeDefined();
    expect(knowledgeRecipe!.produces.knowledge).toBeGreaterThan(0);
    expect(knowledgeRecipe!.consumes.scrolls).toBeGreaterThan(0);
    expect(library.storageCaps?.knowledge).toBeGreaterThan(0);
  });
});
