import type { DifficultyId, PythiaArchetypeDef, PythiaArchetypeId, RunDifficultyDef } from "./schema";

export const DEFAULT_DIFFICULTY_ID: DifficultyId = "oracle";
export const DEFAULT_PYTHIA_ARCHETYPE_ID: PythiaArchetypeId = "hearth-voice";

export const difficultyDefs: RunDifficultyDef[] = [
  {
    id: "pilgrim",
    label: "Pilgrim",
    title: "Pilgrim Difficulty",
    summary: "A forgiving opening with calmer politics, steadier supplies, and more room to learn the precinct.",
    worldBias: {
      climate: 1,
      economy: 1,
      divineMood: 1,
      pressure: -2,
      unrest: -1
    },
    startingResources: {
      gold: 35,
      grain: 10,
      incense: 4,
      olive_oil: 6,
      sacred_water: 8
    },
    pythiaModifiers: {
      physicalHealth: 4,
      mentalClarity: 5,
      prestige: 2,
      purification: -6,
      rest: -6
    },
    factionModifiers: {
      credibility: 5,
      favour: 4,
      dependence: -4,
      debt: -4
    }
  },
  {
    id: "oracle",
    label: "Oracle",
    title: "Oracle Difficulty",
    summary: "The balanced campaign baseline. Delphi rises or falls on how well you manage prophecy, politics, and supply.",
    worldBias: {
      pressure: 0,
      unrest: 0
    }
  },
  {
    id: "prophet",
    label: "Prophet",
    title: "Prophet Difficulty",
    summary: "Sharper political pressure, leaner stores, and less patience from the Greek world.",
    worldBias: {
      economy: -1,
      pressure: 1,
      unrest: 1
    },
    startingResources: {
      gold: -15,
      grain: -8,
      incense: -2,
      sacred_water: -2
    },
    pythiaModifiers: {
      physicalHealth: -4,
      mentalClarity: -3,
      purification: 6,
      rest: 8
    },
    factionModifiers: {
      credibility: -3,
      favour: -2,
      dependence: 3,
      debt: 3
    }
  },
  {
    id: "mythic",
    label: "Mythic",
    title: "Mythic Difficulty",
    summary: "The world is harsh, suspicious, and crowded with rival omens. You begin with forceful visions and very little margin.",
    worldBias: {
      economy: -1,
      divineMood: -1,
      pressure: 2,
      unrest: 2
    },
    startingResources: {
      gold: -30,
      grain: -12,
      incense: -3,
      sacred_water: -4,
      olive_oil: -4
    },
    pythiaModifiers: {
      attunement: 4,
      tranceDepth: 4,
      physicalHealth: -8,
      mentalClarity: -6,
      prestige: -4,
      purification: 10,
      rest: 12
    },
    factionModifiers: {
      credibility: -6,
      favour: -5,
      dependence: 5,
      debt: 5
    }
  }
];

export const pythiaArchetypeDefs: PythiaArchetypeDef[] = [
  {
    id: "hearth-voice",
    label: "Thaleia",
    title: "Hearth Voice",
    summary: "A steady oracle who reads people as well as omens. Safer for diplomacy-heavy openings.",
    name: "Thaleia",
    startingTraits: ["visionary", "diplomatic"],
    pythiaModifiers: {
      attunement: 4,
      mentalClarity: 3,
      prestige: 2
    }
  },
  {
    id: "silver-tongue",
    label: "Myrine",
    title: "Silver Tongue",
    summary: "Raised among envoys and patrons. Better at persuasion, credibility management, and factional courtship.",
    name: "Myrine",
    startingTraits: ["diplomatic", "calculating"],
    pythiaModifiers: {
      mentalClarity: 5,
      prestige: 6,
      attunement: 1
    },
    startingResources: {
      papyrus: 2,
      gold: 10
    }
  },
  {
    id: "storm-sighted",
    label: "Ione",
    title: "Storm-Sighted",
    summary: "A volatile seer with fierce trance depth and dangerous clarity. Stronger visions, weaker stamina.",
    name: "Ione",
    startingTraits: ["visionary", "fragile"],
    pythiaModifiers: {
      attunement: 9,
      tranceDepth: 7,
      physicalHealth: -6,
      purification: 8,
      rest: 6
    }
  },
  {
    id: "keeper-of-tablets",
    label: "Damaris",
    title: "Keeper of Tablets",
    summary: "A disciplined scholar-sibyl who enters the shrine with better recall, records, and ritual method.",
    name: "Damaris",
    startingTraits: ["calculating"],
    pythiaModifiers: {
      mentalClarity: 8,
      prestige: 3,
      tranceDepth: -2
    },
    startingResources: {
      scrolls: 2,
      papyrus: 3
    }
  }
];

export const difficultyDefById = Object.fromEntries(
  difficultyDefs.map((difficulty) => [difficulty.id, difficulty])
) as Record<DifficultyId, RunDifficultyDef>;

export const pythiaArchetypeDefById = Object.fromEntries(
  pythiaArchetypeDefs.map((archetype) => [archetype.id, archetype])
) as Record<PythiaArchetypeId, PythiaArchetypeDef>;
