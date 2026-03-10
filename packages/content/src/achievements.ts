export type AchievementCategory = "prophecy" | "survival" | "building" | "espionage" | "diplomacy" | "meta";

export type AchievementCondition =
  | { kind: "prophecy_count"; count: number }
  | { kind: "grand_prophecy" }
  | { kind: "years_survived"; years: number }
  | { kind: "reputation_tier"; tier: string }
  | { kind: "all_techs_researched" }
  | { kind: "all_buildings_built" }
  | { kind: "rival_defeated" }
  | { kind: "festival_count"; count: number }
  | { kind: "relic_count"; count: number }
  | { kind: "sacred_sites_active"; count: number }
  | { kind: "patron_count"; count: number }
  | { kind: "zero_debt_run" }
  | { kind: "neutral_in_wars"; count: number }
  | { kind: "belief_strength_above"; threshold: number }
  | { kind: "espionage_successes"; count: number }
  | { kind: "espionage_undetected" }
  | { kind: "treaties_formed"; count: number }
  | { kind: "building_count"; count: number }
  | { kind: "custom"; check: string };

export type AchievementDef = {
  id: string;
  label: string;
  description: string;
  category: AchievementCategory;
  condition: AchievementCondition;
};

export const achievementDefs: AchievementDef[] = [
  // --- Prophecy (6) ---
  {
    id: "first_oracle",
    label: "First Oracle",
    description: "Deliver your first prophecy to a faction envoy.",
    category: "prophecy",
    condition: { kind: "prophecy_count", count: 1 }
  },
  {
    id: "seasoned_seer",
    label: "Seasoned Seer",
    description: "Deliver 10 prophecies across your run.",
    category: "prophecy",
    condition: { kind: "prophecy_count", count: 10 }
  },
  {
    id: "century_oracle",
    label: "Century Oracle",
    description: "Deliver 100 prophecies across your run.",
    category: "prophecy",
    condition: { kind: "prophecy_count", count: 100 }
  },
  {
    id: "grand_prophet",
    label: "Grand Prophet",
    description: "Deliver a grand prophecy of oracular depth.",
    category: "prophecy",
    condition: { kind: "grand_prophecy" }
  },
  {
    id: "self_fulfilling",
    label: "Self-Fulfilling",
    description: "Achieve belief strength above 90 for any prophecy.",
    category: "prophecy",
    condition: { kind: "belief_strength_above", threshold: 90 }
  },
  {
    id: "trusted_voice",
    label: "Trusted Voice",
    description: "Deliver 25 prophecies to the city-states.",
    category: "prophecy",
    condition: { kind: "prophecy_count", count: 25 }
  },

  // --- Survival (5) ---
  {
    id: "first_year",
    label: "First Year",
    description: "Survive one full year at Delphi.",
    category: "survival",
    condition: { kind: "years_survived", years: 1 }
  },
  {
    id: "decade",
    label: "Decade",
    description: "Survive ten years as Oracle.",
    category: "survival",
    condition: { kind: "years_survived", years: 10 }
  },
  {
    id: "century_survivor",
    label: "Century",
    description: "Survive one hundred years at the sanctuary.",
    category: "survival",
    condition: { kind: "years_survived", years: 100 }
  },
  {
    id: "panhellenic",
    label: "Panhellenic",
    description: "Reach the Panhellenic reputation tier.",
    category: "survival",
    condition: { kind: "reputation_tier", tier: "panhellenic" }
  },
  {
    id: "recognized",
    label: "Rising Name",
    description: "Reach the Recognized reputation tier.",
    category: "survival",
    condition: { kind: "reputation_tier", tier: "recognized" }
  },

  // --- Building (4) ---
  {
    id: "master_builder",
    label: "Master Builder",
    description: "Construct every type of building available.",
    category: "building",
    condition: { kind: "all_buildings_built" }
  },
  {
    id: "monumental",
    label: "Monumental",
    description: "Complete 5 buildings in the sanctuary.",
    category: "building",
    condition: { kind: "building_count", count: 5 }
  },
  {
    id: "city_planner",
    label: "City Planner",
    description: "Have 10 or more buildings standing.",
    category: "building",
    condition: { kind: "building_count", count: 10 }
  },
  {
    id: "tech_master",
    label: "Sage of All Arts",
    description: "Research every technology.",
    category: "building",
    condition: { kind: "all_techs_researched" }
  },

  // --- Espionage (4) ---
  {
    id: "spymaster",
    label: "Spymaster",
    description: "Complete 5 successful espionage operations.",
    category: "espionage",
    condition: { kind: "espionage_successes", count: 5 }
  },
  {
    id: "shadow_network",
    label: "Shadow Network",
    description: "Complete 15 successful espionage operations.",
    category: "espionage",
    condition: { kind: "espionage_successes", count: 15 }
  },
  {
    id: "ghost",
    label: "Ghost",
    description: "Complete a run with zero espionage detections.",
    category: "espionage",
    condition: { kind: "espionage_undetected" }
  },
  {
    id: "rival_defeated",
    label: "Oracle Slayer",
    description: "Defeat a rival oracle.",
    category: "espionage",
    condition: { kind: "rival_defeated" }
  },

  // --- Diplomacy (5) ---
  {
    id: "peacemaker",
    label: "Peacemaker",
    description: "Form 3 treaties with city-states.",
    category: "diplomacy",
    condition: { kind: "treaties_formed", count: 3 }
  },
  {
    id: "grand_diplomat",
    label: "Grand Diplomat",
    description: "Form 6 treaties with city-states.",
    category: "diplomacy",
    condition: { kind: "treaties_formed", count: 6 }
  },
  {
    id: "neutral_arbiter",
    label: "Neutral Arbiter",
    description: "Remain neutral during 3 wars.",
    category: "diplomacy",
    condition: { kind: "neutral_in_wars", count: 3 }
  },
  {
    id: "patron_of_patrons",
    label: "Patron of Patrons",
    description: "Maintain 3 active patron contracts simultaneously.",
    category: "diplomacy",
    condition: { kind: "patron_count", count: 3 }
  },
  {
    id: "kingmaker",
    label: "Kingmaker",
    description: "Have 5 active patron contracts simultaneously.",
    category: "diplomacy",
    condition: { kind: "patron_count", count: 5 }
  },

  // --- Meta (6) ---
  {
    id: "collector",
    label: "Collector",
    description: "Discover 15 relics from excavation sites.",
    category: "meta",
    condition: { kind: "relic_count", count: 15 }
  },
  {
    id: "festival_master",
    label: "Festival Master",
    description: "Successfully complete 5 festivals.",
    category: "meta",
    condition: { kind: "festival_count", count: 5 }
  },
  {
    id: "sacred_guardian",
    label: "Sacred Guardian",
    description: "Have 3 sacred sites active simultaneously.",
    category: "meta",
    condition: { kind: "sacred_sites_active", count: 3 }
  },
  {
    id: "zero_debt",
    label: "Zero Debt",
    description: "Complete a run without ever taking on debt.",
    category: "meta",
    condition: { kind: "zero_debt_run" }
  },
  {
    id: "relic_hunter",
    label: "Relic Hunter",
    description: "Discover 5 relics from excavation sites.",
    category: "meta",
    condition: { kind: "relic_count", count: 5 }
  },
  {
    id: "celebrant",
    label: "Celebrant",
    description: "Successfully complete 10 festivals.",
    category: "meta",
    condition: { kind: "festival_count", count: 10 }
  }
];

export const achievementDefById: Record<string, AchievementDef> = Object.fromEntries(
  achievementDefs.map((def) => [def.id, def])
);
