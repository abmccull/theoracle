import type { EventChainDef } from "./schema";

export const eventChainDefs: EventChainDef[] = [
  // --- MILITARY DOMAIN ---
  {
    id: "border-skirmish",
    label: "Border Skirmish",
    domain: "military",
    triggerConditions: [
      { kind: "faction_at_war" },
      { kind: "random_chance", probability: 0.15 }
    ],
    triggerCooldownDays: 45,
    maxConcurrent: 1,
    stages: [
      {
        id: "skirmish-report",
        label: "Reports of Fighting",
        description: "Word reaches Delphi of clashes along the border. Both sides claim the other struck first.",
        durationDays: 5,
        outcomes: [
          { kind: "credibility_delta", factionId: "athens", delta: -1 }
        ],
        choiceA: { label: "Offer to mediate", outcomes: [{ kind: "reputation_delta", delta: 2 }] },
        choiceB: { label: "Remain silent", outcomes: [] },
        nextStageId: "skirmish-escalation"
      },
      {
        id: "skirmish-escalation",
        label: "Escalation",
        description: "The fighting intensifies. Envoys arrive seeking the oracle's counsel on the conflict's outcome.",
        durationDays: 10,
        outcomes: [
          { kind: "spawn_consultation", factionId: "athens", domain: "military", urgency: 3 }
        ],
        nextStageId: "skirmish-resolution"
      },
      {
        id: "skirmish-resolution",
        label: "Resolution",
        description: "The border dispute subsides, though tensions remain high.",
        durationDays: 3,
        outcomes: [
          { kind: "reputation_delta", delta: 1 }
        ]
      }
    ]
  },
  {
    id: "barbarian-raid",
    label: "Barbarian Raid",
    domain: "military",
    triggerConditions: [
      { kind: "season", season: "Autumn" },
      { kind: "random_chance", probability: 0.08 }
    ],
    triggerCooldownDays: 90,
    maxConcurrent: 1,
    stages: [
      {
        id: "raid-warning",
        label: "Raiders Sighted",
        description: "Northern raiders have been spotted moving south. The precinct may be at risk.",
        durationDays: 7,
        outcomes: [],
        choiceA: { label: "Stockpile defenses", outcomes: [{ kind: "resource_delta", resourceId: "gold", amount: -10 }] },
        choiceB: { label: "Trust the gods", outcomes: [] },
        nextStageId: "raid-strike"
      },
      {
        id: "raid-strike",
        label: "The Raid",
        description: "Raiders descend upon the surrounding countryside. Some buildings sustain damage.",
        durationDays: 3,
        outcomes: [
          { kind: "building_damage", conditionLoss: 15 },
          { kind: "resource_delta", resourceId: "grain", amount: -8 }
        ],
        nextStageId: "raid-aftermath"
      },
      {
        id: "raid-aftermath",
        label: "Aftermath",
        description: "The raiders withdraw. Factions look to the oracle for guidance in the aftermath.",
        durationDays: 5,
        outcomes: [
          { kind: "pilgrim_surge", amount: 2 },
          { kind: "reputation_delta", delta: 1 }
        ]
      }
    ]
  },
  {
    id: "sacred-truce-violation",
    label: "Sacred Truce Violation",
    domain: "military",
    triggerConditions: [
      { kind: "faction_at_war" },
      { kind: "season", season: "Summer" },
      { kind: "random_chance", probability: 0.1 }
    ],
    triggerCooldownDays: 120,
    maxConcurrent: 1,
    stages: [
      {
        id: "truce-broken",
        label: "Truce Broken",
        description: "A faction has violated the sacred truce of the games. All of Hellas is outraged.",
        durationDays: 10,
        outcomes: [
          { kind: "reputation_delta", delta: -3 }
        ],
        choiceA: { label: "Condemn the violators", outcomes: [{ kind: "reputation_delta", delta: 4 }] },
        choiceB: { label: "Call for understanding", outcomes: [{ kind: "credibility_delta", factionId: "sparta", delta: -2 }] },
        nextStageId: "truce-judgment"
      },
      {
        id: "truce-judgment",
        label: "Divine Judgment",
        description: "The oracle is asked to pronounce divine judgment on the truce-breakers.",
        durationDays: 5,
        outcomes: [
          { kind: "spawn_consultation", factionId: "corinth", domain: "spiritual", urgency: 5 }
        ]
      }
    ]
  },

  // --- ECONOMIC DOMAIN ---
  {
    id: "grain-famine",
    label: "Grain Famine",
    domain: "economic",
    triggerConditions: [
      { kind: "resource_below", resourceId: "grain", threshold: 5 },
      { kind: "season", season: "Winter" }
    ],
    triggerCooldownDays: 60,
    maxConcurrent: 1,
    stages: [
      {
        id: "famine-onset",
        label: "Grain Shortage",
        description: "Winter stores run dangerously low. The people look to the oracle for guidance.",
        durationDays: 10,
        outcomes: [
          { kind: "resource_delta", resourceId: "grain", amount: -3 }
        ],
        choiceA: { label: "Open sacred reserves", outcomes: [{ kind: "resource_delta", resourceId: "gold", amount: -15 }, { kind: "resource_delta", resourceId: "grain", amount: 8 }] },
        choiceB: { label: "Ration existing stores", outcomes: [{ kind: "reputation_delta", delta: -2 }] },
        nextStageId: "famine-desperation"
      },
      {
        id: "famine-desperation",
        label: "Desperate Times",
        description: "Hungry pilgrims crowd the precinct. Some factions offer grain in exchange for favorable prophecies.",
        durationDays: 15,
        outcomes: [
          { kind: "pilgrim_surge", amount: 3 },
          { kind: "spawn_consultation", factionId: "thebes", domain: "economic", urgency: 4 }
        ]
      }
    ]
  },
  {
    id: "trade-war",
    label: "Trade War",
    domain: "economic",
    triggerConditions: [
      { kind: "faction_debt_above", threshold: 30 },
      { kind: "random_chance", probability: 0.12 }
    ],
    triggerCooldownDays: 60,
    maxConcurrent: 1,
    stages: [
      {
        id: "trade-tensions",
        label: "Trade Tensions",
        description: "Rising debts and broken agreements threaten commerce across the Greek world.",
        durationDays: 10,
        outcomes: [
          { kind: "trade_disruption", factionId: "miletus", durationMonths: 2 }
        ],
        choiceA: { label: "Broker a deal", outcomes: [{ kind: "resource_delta", resourceId: "gold", amount: -20 }, { kind: "reputation_delta", delta: 3 }] },
        choiceB: { label: "Let them settle it", outcomes: [] },
        nextStageId: "trade-embargo"
      },
      {
        id: "trade-embargo",
        label: "Embargo",
        description: "Trade routes close. The oracle's markets feel the strain.",
        durationDays: 20,
        outcomes: [
          { kind: "resource_delta", resourceId: "gold", amount: -5 },
          { kind: "trade_disruption", factionId: "corinth", durationMonths: 1 }
        ]
      }
    ]
  },
  {
    id: "silver-discovery",
    label: "Silver Discovery",
    domain: "economic",
    triggerConditions: [
      { kind: "reputation_tier", tier: "recognized" },
      { kind: "random_chance", probability: 0.06 }
    ],
    triggerCooldownDays: 180,
    maxConcurrent: 1,
    stages: [
      {
        id: "silver-news",
        label: "Silver Veins Found",
        description: "Rich silver deposits discovered near Delphi! Factions scramble for mining rights.",
        durationDays: 5,
        outcomes: [
          { kind: "resource_delta", resourceId: "gold", amount: 25 }
        ],
        choiceA: { label: "Dedicate to the gods", outcomes: [{ kind: "reputation_delta", delta: 5 }, { kind: "resource_delta", resourceId: "gold", amount: -15 }] },
        choiceB: { label: "Invest in the precinct", outcomes: [{ kind: "resource_delta", resourceId: "gold", amount: 15 }] },
        nextStageId: "silver-rush"
      },
      {
        id: "silver-rush",
        label: "Silver Rush",
        description: "Prospectors flood the region. Several factions send envoys to negotiate terms.",
        durationDays: 15,
        outcomes: [
          { kind: "pilgrim_surge", amount: 4 },
          { kind: "spawn_consultation", factionId: "athens", domain: "economic", urgency: 3 }
        ]
      }
    ]
  },
  {
    id: "drought-cycle",
    label: "Drought Cycle",
    domain: "economic",
    triggerConditions: [
      { kind: "season", season: "Summer" },
      { kind: "random_chance", probability: 0.1 }
    ],
    triggerCooldownDays: 90,
    maxConcurrent: 1,
    stages: [
      {
        id: "drought-onset",
        label: "The Rains Fail",
        description: "The summer brings no rain. Crops wither and springs run low.",
        durationDays: 20,
        outcomes: [
          { kind: "resource_delta", resourceId: "grain", amount: -5 },
          { kind: "resource_delta", resourceId: "sacred_water", amount: -3 }
        ],
        choiceA: { label: "Perform rain rites", outcomes: [{ kind: "resource_delta", resourceId: "incense", amount: -3 }, { kind: "resource_delta", resourceId: "sacred_water", amount: 2 }] },
        choiceB: { label: "Conserve and wait", outcomes: [] },
        nextStageId: "drought-desperation"
      },
      {
        id: "drought-desperation",
        label: "Parched Land",
        description: "The drought deepens. Factions blame each other and seek divine counsel.",
        durationDays: 15,
        outcomes: [
          { kind: "spawn_consultation", factionId: "argos", domain: "spiritual", urgency: 4 },
          { kind: "reputation_delta", delta: -1 }
        ]
      }
    ]
  },

  // --- SPIRITUAL DOMAIN ---
  {
    id: "divine-omen",
    label: "Divine Omen",
    domain: "spiritual",
    triggerConditions: [
      { kind: "random_chance", probability: 0.05 }
    ],
    triggerCooldownDays: 60,
    maxConcurrent: 1,
    stages: [
      {
        id: "omen-appears",
        label: "Omen in the Skies",
        description: "A brilliant comet streaks across the heavens. All of Hellas watches and waits for the oracle's interpretation.",
        durationDays: 3,
        outcomes: [
          { kind: "pilgrim_surge", amount: 5 }
        ],
        choiceA: { label: "Declare it favorable", outcomes: [{ kind: "reputation_delta", delta: 4 }] },
        choiceB: { label: "Declare it a warning", outcomes: [{ kind: "philosopher_pressure", philosopherId: "heraclitus", delta: -5 }, { kind: "reputation_delta", delta: 2 }] },
        nextStageId: "omen-aftermath"
      },
      {
        id: "omen-aftermath",
        label: "Omen's Echo",
        description: "The interpretation spreads across the Greek world. Factions send envoys seeking further guidance.",
        durationDays: 10,
        outcomes: [
          { kind: "spawn_consultation", factionId: "macedon", domain: "spiritual", urgency: 5 },
          { kind: "spawn_consultation", factionId: "thebes", domain: "military", urgency: 3 }
        ]
      }
    ]
  },
  {
    id: "oracle-doubt",
    label: "Crisis of Faith",
    domain: "spiritual",
    triggerConditions: [
      { kind: "prophecy_failed_recently", withinDays: 30 },
      { kind: "random_chance", probability: 0.2 }
    ],
    triggerCooldownDays: 45,
    maxConcurrent: 1,
    stages: [
      {
        id: "doubt-spreads",
        label: "Whispers of Doubt",
        description: "A recent failed prophecy has shaken confidence. Philosophers seize the moment.",
        durationDays: 10,
        outcomes: [
          { kind: "philosopher_pressure", philosopherId: "gorgias", delta: 8 },
          { kind: "reputation_delta", delta: -3 }
        ],
        choiceA: { label: "Address doubts publicly", outcomes: [{ kind: "reputation_delta", delta: 2 }, { kind: "philosopher_pressure", philosopherId: "gorgias", delta: -3 }] },
        choiceB: { label: "Silence critics through devotion", outcomes: [{ kind: "resource_delta", resourceId: "incense", amount: -5 }] },
        nextStageId: "doubt-test"
      },
      {
        id: "doubt-test",
        label: "Test of Faith",
        description: "A prominent envoy demands proof of the oracle's divine connection.",
        durationDays: 7,
        outcomes: [
          { kind: "spawn_consultation", factionId: "athens", domain: "spiritual", urgency: 5 }
        ]
      }
    ]
  },
  {
    id: "plague-visitation",
    label: "Plague Visitation",
    domain: "spiritual",
    triggerConditions: [
      { kind: "season", season: "Autumn" },
      { kind: "random_chance", probability: 0.07 }
    ],
    triggerCooldownDays: 120,
    maxConcurrent: 1,
    stages: [
      {
        id: "plague-arrives",
        label: "Sickness Spreads",
        description: "A pestilence sweeps through the region. The sacred spring is sought for healing.",
        durationDays: 15,
        outcomes: [
          { kind: "resource_delta", resourceId: "sacred_water", amount: -5 },
          { kind: "building_damage", conditionLoss: 5 }
        ],
        choiceA: { label: "Open healing rites", outcomes: [{ kind: "resource_delta", resourceId: "sacred_water", amount: -3 }, { kind: "resource_delta", resourceId: "incense", amount: -2 }, { kind: "reputation_delta", delta: 5 }] },
        choiceB: { label: "Quarantine the precinct", outcomes: [{ kind: "reputation_delta", delta: -3 }] },
        nextStageId: "plague-peak"
      },
      {
        id: "plague-peak",
        label: "The Fever Peaks",
        description: "The plague reaches its height. Factions beg the oracle for divine intervention.",
        durationDays: 10,
        outcomes: [
          { kind: "spawn_consultation", factionId: "syracuse", domain: "spiritual", urgency: 5 },
          { kind: "pilgrim_surge", amount: 3 }
        ]
      }
    ]
  },
  {
    id: "prophetic-dream",
    label: "Prophetic Dream",
    domain: "spiritual",
    triggerConditions: [
      { kind: "random_chance", probability: 0.04 }
    ],
    triggerCooldownDays: 90,
    maxConcurrent: 1,
    stages: [
      {
        id: "dream-received",
        label: "The Pythia Dreams",
        description: "The Pythia awakens from a vivid dream. She speaks of visions not sought by any mortal.",
        durationDays: 3,
        outcomes: [],
        choiceA: { label: "Share the vision publicly", outcomes: [{ kind: "reputation_delta", delta: 3 }, { kind: "pilgrim_surge", amount: 3 }] },
        choiceB: { label: "Keep it private", outcomes: [{ kind: "resource_delta", resourceId: "knowledge", amount: 5 }] }
      }
    ]
  },

  // --- POLITICAL DOMAIN ---
  {
    id: "succession-crisis",
    label: "Succession Crisis",
    domain: "military",
    triggerConditions: [
      { kind: "random_chance", probability: 0.06 }
    ],
    triggerCooldownDays: 120,
    maxConcurrent: 1,
    stages: [
      {
        id: "king-falls",
        label: "A Throne Vacant",
        description: "A faction leader has died. Multiple claimants seek the oracle's endorsement.",
        durationDays: 5,
        outcomes: [
          { kind: "pilgrim_surge", amount: 4 }
        ],
        choiceA: { label: "Endorse the eldest", outcomes: [{ kind: "credibility_delta", factionId: "thebes", delta: 3 }] },
        choiceB: { label: "Let the gods decide", outcomes: [{ kind: "spawn_consultation", factionId: "thebes", domain: "military", urgency: 5 }] },
        nextStageId: "succession-contest"
      },
      {
        id: "succession-contest",
        label: "The Contest",
        description: "Rival claimants present their cases. The oracle's word will determine the new ruler.",
        durationDays: 15,
        outcomes: [
          { kind: "reputation_delta", delta: 2 },
          { kind: "faction_relation_delta", factionA: "thebes", factionB: "athens", delta: -5 }
        ]
      }
    ]
  },
  {
    id: "embassy-standoff",
    label: "Embassy Standoff",
    domain: "economic",
    triggerConditions: [
      { kind: "consultation_pending" },
      { kind: "random_chance", probability: 0.08 }
    ],
    triggerCooldownDays: 60,
    maxConcurrent: 1,
    stages: [
      {
        id: "standoff-begins",
        label: "Competing Envoys",
        description: "Two rival factions both demand to be heard first. Their envoys nearly come to blows in the sacred precinct.",
        durationDays: 5,
        outcomes: [
          { kind: "reputation_delta", delta: -1 }
        ],
        choiceA: { label: "Hear the wealthier faction", outcomes: [{ kind: "resource_delta", resourceId: "gold", amount: 10 }] },
        choiceB: { label: "Hear neither until they calm", outcomes: [{ kind: "reputation_delta", delta: 2 }] }
      }
    ]
  },
  {
    id: "eclipse",
    label: "Solar Eclipse",
    domain: "spiritual",
    triggerConditions: [
      { kind: "random_chance", probability: 0.02 }
    ],
    triggerCooldownDays: 365,
    maxConcurrent: 1,
    stages: [
      {
        id: "eclipse-occurs",
        label: "The Sun Goes Dark",
        description: "The sun vanishes from the sky. Panic spreads across Hellas. All eyes turn to Delphi.",
        durationDays: 1,
        outcomes: [
          { kind: "pilgrim_surge", amount: 8 }
        ],
        choiceA: { label: "Declare divine message", outcomes: [{ kind: "reputation_delta", delta: 6 }, { kind: "philosopher_pressure", philosopherId: "anaxagoras", delta: 10 }] },
        choiceB: { label: "Counsel calm", outcomes: [{ kind: "reputation_delta", delta: 2 }, { kind: "philosopher_pressure", philosopherId: "anaxagoras", delta: -3 }] },
        nextStageId: "eclipse-aftermath"
      },
      {
        id: "eclipse-aftermath",
        label: "After the Eclipse",
        description: "Light returns, but the world is changed. Every faction sends envoys seeking meaning.",
        durationDays: 10,
        outcomes: [
          { kind: "spawn_consultation", factionId: "sparta", domain: "spiritual", urgency: 5 },
          { kind: "spawn_consultation", factionId: "athens", domain: "spiritual", urgency: 4 },
          { kind: "reputation_delta", delta: 3 }
        ]
      }
    ]
  },

  // --- PROPHECY FEEDBACK ---
  {
    id: "prophecy-exploitation",
    label: "Prophecy Exploitation",
    domain: "spiritual",
    triggerConditions: [
      { kind: "prophecy_succeeded_recently", withinDays: 30 },
      { kind: "random_chance", probability: 0.15 }
    ],
    triggerCooldownDays: 60,
    maxConcurrent: 1,
    stages: [
      {
        id: "exploitation-scheme",
        label: "Twisted Words",
        description: "A scheming faction has begun twisting a recent prophecy to serve their own agenda. The oracle's words are being used to justify actions never intended.",
        durationDays: 7,
        outcomes: [
          { kind: "reputation_delta", delta: -2 }
        ],
        choiceA: { label: "Issue a clarification", outcomes: [{ kind: "reputation_delta", delta: 3 }, { kind: "credibility_delta", factionId: "athens", delta: 2 }] },
        choiceB: { label: "Let it slide", outcomes: [{ kind: "reputation_delta", delta: -1 }] },
        nextStageId: "exploitation-fallout"
      },
      {
        id: "exploitation-fallout",
        label: "The Fallout",
        description: "The distorted prophecy has spread. Other factions now question whether the oracle's words can be trusted, or if they serve hidden masters.",
        durationDays: 10,
        outcomes: [
          { kind: "philosopher_pressure", philosopherId: "gorgias", delta: 5 },
          { kind: "spawn_consultation", factionId: "corinth", domain: "spiritual", urgency: 4 }
        ]
      }
    ]
  },

  // --- DIPLOMATIC DOMAIN ---
  {
    id: "diplomatic-summit",
    label: "Diplomatic Summit",
    domain: "spiritual",
    triggerConditions: [
      { kind: "reputation_tier", tier: "revered" },
      { kind: "random_chance", probability: 0.08 }
    ],
    triggerCooldownDays: 120,
    maxConcurrent: 1,
    stages: [
      {
        id: "summit-gathering",
        label: "The Gathering",
        description: "Multiple factions send their most influential envoys to Delphi for a grand summit. The oracle's guidance will shape alliances for a generation.",
        durationDays: 5,
        outcomes: [
          { kind: "pilgrim_surge", amount: 6 }
        ],
        choiceA: { label: "Host lavishly", outcomes: [{ kind: "resource_delta", resourceId: "gold", amount: -20 }, { kind: "reputation_delta", delta: 5 }] },
        choiceB: { label: "Keep it austere", outcomes: [{ kind: "reputation_delta", delta: 1 }] },
        nextStageId: "summit-negotiations"
      },
      {
        id: "summit-negotiations",
        label: "High Stakes Negotiations",
        description: "The envoys demand consultations on matters of war, trade, and succession. Every word the oracle speaks carries enormous weight.",
        durationDays: 10,
        outcomes: [
          { kind: "spawn_consultation", factionId: "athens", domain: "military", urgency: 5 },
          { kind: "spawn_consultation", factionId: "sparta", domain: "economic", urgency: 4 }
        ],
        nextStageId: "summit-resolution"
      },
      {
        id: "summit-resolution",
        label: "Summit Concludes",
        description: "The summit ends with new alliances forged and old enmities sharpened. Delphi's role as arbiter is cemented.",
        durationDays: 3,
        outcomes: [
          { kind: "reputation_delta", delta: 3 },
          { kind: "faction_relation_delta", factionA: "athens", factionB: "sparta", delta: -3 }
        ]
      }
    ]
  },
  {
    id: "patron-defection",
    label: "Patron Defection",
    domain: "economic",
    triggerConditions: [
      { kind: "rival_pressure_above", threshold: 60 },
      { kind: "random_chance", probability: 0.12 }
    ],
    triggerCooldownDays: 90,
    maxConcurrent: 1,
    stages: [
      {
        id: "defection-rumor",
        label: "Whispers of Betrayal",
        description: "A valued patron is rumored to be considering switching allegiance to a rival oracle. Their envoys have been seen meeting in secret.",
        durationDays: 7,
        outcomes: [
          { kind: "reputation_delta", delta: -2 }
        ],
        choiceA: { label: "Offer favorable terms", outcomes: [{ kind: "resource_delta", resourceId: "gold", amount: -15 }, { kind: "credibility_delta", factionId: "corinth", delta: 3 }] },
        choiceB: { label: "Let them go", outcomes: [{ kind: "credibility_delta", factionId: "corinth", delta: -4 }] },
        nextStageId: "defection-crisis"
      },
      {
        id: "defection-crisis",
        label: "The Decision",
        description: "The patron makes their choice. Other factions watch closely — defection from Delphi would embolden the oracle's rivals.",
        durationDays: 5,
        outcomes: [
          { kind: "rival_pressure", rivalId: "oak-seers", delta: 5 },
          { kind: "spawn_consultation", factionId: "thebes", domain: "economic", urgency: 3 }
        ]
      }
    ]
  },
  {
    id: "hegemon-challenge",
    label: "Hegemon Challenge",
    domain: "military",
    triggerConditions: [
      { kind: "faction_at_war" },
      { kind: "reputation_tier", tier: "recognized" },
      { kind: "random_chance", probability: 0.06 }
    ],
    triggerCooldownDays: 180,
    maxConcurrent: 1,
    stages: [
      {
        id: "hegemon-rising",
        label: "A Rising Power",
        description: "A faction grows bold enough to challenge the current hegemon. They seek the oracle's blessing for their campaign.",
        durationDays: 7,
        outcomes: [
          { kind: "pilgrim_surge", amount: 4 }
        ],
        choiceA: { label: "Bless the challenger", outcomes: [{ kind: "credibility_delta", factionId: "macedon", delta: 4 }, { kind: "credibility_delta", factionId: "sparta", delta: -3 }] },
        choiceB: { label: "Counsel patience", outcomes: [{ kind: "reputation_delta", delta: 2 }] },
        nextStageId: "hegemon-clash"
      },
      {
        id: "hegemon-clash",
        label: "The Clash of Titans",
        description: "War erupts between the challenger and the old guard. The oracle must navigate treacherous political waters.",
        durationDays: 15,
        outcomes: [
          { kind: "faction_relation_delta", factionA: "macedon", factionB: "sparta", delta: -10 },
          { kind: "spawn_consultation", factionId: "macedon", domain: "military", urgency: 5 },
          { kind: "spawn_consultation", factionId: "sparta", domain: "military", urgency: 5 }
        ],
        nextStageId: "hegemon-aftermath"
      },
      {
        id: "hegemon-aftermath",
        label: "New Order",
        description: "The dust settles. A new balance of power emerges across the Greek world.",
        durationDays: 5,
        outcomes: [
          { kind: "reputation_delta", delta: 2 },
          { kind: "rival_pressure", rivalId: "isthmus-ledger", delta: -3 }
        ]
      }
    ]
  },

  // --- BUILDING DEDICATION ---
  {
    id: "building-dedication",
    label: "Building Dedication Ceremony",
    domain: "spiritual",
    triggerConditions: [
      { kind: "building_count_above", count: 5 },
      { kind: "reputation_tier", tier: "recognized" }
    ],
    triggerCooldownDays: 60,
    maxConcurrent: 1,
    stages: [
      {
        id: "ceremony-preparation",
        label: "Ceremony Preparation",
        description: "A newly completed building awaits proper dedication. Sacred resources must be gathered for the ritual.",
        durationDays: 5,
        outcomes: [
          { kind: "resource_delta", resourceId: "gold", amount: -10 },
          { kind: "resource_delta", resourceId: "incense", amount: -5 },
          { kind: "resource_delta", resourceId: "sacred_water", amount: -5 }
        ],
        nextStageId: "dedication-ritual",
        nextStageCondition: { kind: "resource_above", resourceId: "gold", threshold: 10 }
      },
      {
        id: "dedication-ritual",
        label: "Dedication Ritual",
        description: "The resources have been gathered. The priesthood stands ready to consecrate the new building with sacred rites.",
        durationDays: 3,
        outcomes: [
          { kind: "reputation_delta", delta: 3 },
          { kind: "credibility_delta", factionId: "athens", delta: 2 }
        ],
        choiceA: {
          label: "Grand Ceremony",
          outcomes: [
            { kind: "resource_delta", resourceId: "gold", amount: -10 },
            { kind: "reputation_delta", delta: 5 },
            { kind: "pilgrim_surge", amount: 3 }
          ]
        },
        choiceB: {
          label: "Simple Blessing",
          outcomes: [
            { kind: "reputation_delta", delta: 3 }
          ]
        }
      }
    ]
  },

  // --- DISASTER DOMAIN ---
  {
    id: "disaster-plague",
    label: "The Great Plague",
    domain: "spiritual",
    triggerConditions: [
      { kind: "random_chance", probability: 0.04 }
    ],
    triggerCooldownDays: 120,
    maxConcurrent: 1,
    stages: [
      {
        id: "plague-outbreak",
        label: "Plague Outbreak",
        description: "A terrible pestilence sweeps through the land. Workers fall ill and pilgrims flee in terror.",
        durationDays: 10,
        outcomes: [
          { kind: "reputation_delta", delta: -3 },
          { kind: "pilgrim_surge", amount: -5 }
        ],
        choiceA: {
          label: "Sacrifice sacred animals and incense",
          outcomes: [
            { kind: "resource_delta", resourceId: "sacred_animals", amount: -5 },
            { kind: "resource_delta", resourceId: "incense", amount: -5 },
            { kind: "reputation_delta", delta: 3 }
          ]
        },
        choiceB: {
          label: "Wait for it to pass",
          outcomes: [
            { kind: "reputation_delta", delta: -2 }
          ]
        },
        nextStageId: "plague-peak"
      },
      {
        id: "plague-peak",
        label: "The Fever Burns",
        description: "The plague reaches its terrible peak. Production across the precinct grinds to a near halt.",
        durationDays: 15,
        outcomes: [
          { kind: "building_damage", conditionLoss: 10 },
          { kind: "resource_delta", resourceId: "grain", amount: -5 }
        ],
        nextStageId: "plague-subsides"
      },
      {
        id: "plague-subsides",
        label: "The Plague Subsides",
        description: "After thirty days of suffering, the plague finally loosens its grip. The survivors give thanks.",
        durationDays: 5,
        outcomes: [
          { kind: "reputation_delta", delta: 2 },
          { kind: "pilgrim_surge", amount: 3 }
        ]
      }
    ]
  },
  {
    id: "disaster-earthquake",
    label: "Earthquake",
    domain: "spiritual",
    triggerConditions: [
      { kind: "random_chance", probability: 0.05 }
    ],
    triggerCooldownDays: 90,
    maxConcurrent: 1,
    stages: [
      {
        id: "earthquake-tremors",
        label: "The Earth Trembles",
        description: "Violent tremors shake the sacred precinct. Buildings crack and stones tumble from walls.",
        durationDays: 1,
        outcomes: [
          { kind: "building_damage", conditionLoss: 30 },
          { kind: "resource_delta", resourceId: "stone", amount: -10 },
          { kind: "resource_delta", resourceId: "cut_stone", amount: -5 }
        ],
        choiceA: {
          label: "Begin immediate rebuilding",
          outcomes: [
            { kind: "resource_delta", resourceId: "gold", amount: -20 },
            { kind: "resource_delta", resourceId: "stone", amount: -5 }
          ]
        },
        choiceB: {
          label: "Pray to Poseidon for mercy",
          outcomes: [
            { kind: "resource_delta", resourceId: "incense", amount: -3 },
            { kind: "reputation_delta", delta: 2 }
          ]
        },
        nextStageId: "earthquake-aftershocks"
      },
      {
        id: "earthquake-aftershocks",
        label: "Aftershocks",
        description: "Lesser tremors continue to shake the area. The people are terrified and seek the oracle's counsel.",
        durationDays: 5,
        outcomes: [
          { kind: "building_damage", conditionLoss: 10 },
          { kind: "pilgrim_surge", amount: 4 }
        ],
        nextStageId: "earthquake-recovery"
      },
      {
        id: "earthquake-recovery",
        label: "Recovery",
        description: "The earth stills at last. The damage is severe but rebuilding can begin.",
        durationDays: 10,
        outcomes: [
          { kind: "spawn_consultation", factionId: "thebes", domain: "spiritual", urgency: 4 },
          { kind: "reputation_delta", delta: 1 }
        ]
      }
    ]
  },
  {
    id: "disaster-flood",
    label: "Great Flood",
    domain: "economic",
    triggerConditions: [
      { kind: "season_is", season: "Spring" },
      { kind: "random_chance", probability: 0.08 }
    ],
    triggerCooldownDays: 90,
    maxConcurrent: 1,
    stages: [
      {
        id: "flood-waters-rise",
        label: "The Waters Rise",
        description: "Spring rains swell the rivers beyond their banks. The grain stores are threatened as water seeps in.",
        durationDays: 5,
        outcomes: [
          { kind: "resource_delta", resourceId: "grain", amount: -15 },
          { kind: "building_damage", conditionLoss: 10 }
        ],
        choiceA: {
          label: "Divert the waters with labor and stone",
          outcomes: [
            { kind: "resource_delta", resourceId: "stone", amount: -8 },
            { kind: "resource_delta", resourceId: "gold", amount: -10 },
            { kind: "resource_delta", resourceId: "grain", amount: 5 }
          ]
        },
        choiceB: {
          label: "Accept the losses and save what we can",
          outcomes: [
            { kind: "resource_delta", resourceId: "grain", amount: -10 }
          ]
        },
        nextStageId: "flood-peak"
      },
      {
        id: "flood-peak",
        label: "Flood Peak",
        description: "The flood reaches its height. Roads are impassable and trade is disrupted.",
        durationDays: 7,
        outcomes: [
          { kind: "trade_disruption", factionId: "corinth", durationMonths: 1 },
          { kind: "reputation_delta", delta: -2 }
        ],
        nextStageId: "flood-recedes"
      },
      {
        id: "flood-recedes",
        label: "The Waters Recede",
        description: "The flood waters finally recede, leaving rich silt behind. Perhaps some good can come of this.",
        durationDays: 5,
        outcomes: [
          { kind: "reputation_delta", delta: 1 },
          { kind: "resource_delta", resourceId: "sacred_water", amount: 5 }
        ]
      }
    ]
  },
  {
    id: "disaster-drought",
    label: "Devastating Drought",
    domain: "economic",
    triggerConditions: [
      { kind: "season_is", season: "Summer" },
      { kind: "random_chance", probability: 0.08 }
    ],
    triggerCooldownDays: 90,
    maxConcurrent: 1,
    stages: [
      {
        id: "drought-begins",
        label: "The Land Parches",
        description: "The summer sun scorches without mercy. Wells run dry and crops wither in the fields.",
        durationDays: 15,
        outcomes: [
          { kind: "resource_delta", resourceId: "grain", amount: -10 },
          { kind: "resource_delta", resourceId: "sacred_water", amount: -5 }
        ],
        choiceA: {
          label: "Perform rain prayer ritual",
          outcomes: [
            { kind: "resource_delta", resourceId: "incense", amount: -5 },
            { kind: "resource_delta", resourceId: "sacred_animals", amount: -2 },
            { kind: "resource_delta", resourceId: "sacred_water", amount: 3 },
            { kind: "reputation_delta", delta: 3 }
          ]
        },
        choiceB: {
          label: "Trade for food from abroad",
          outcomes: [
            { kind: "resource_delta", resourceId: "gold", amount: -15 },
            { kind: "resource_delta", resourceId: "grain", amount: 8 }
          ]
        },
        nextStageId: "drought-deepens"
      },
      {
        id: "drought-deepens",
        label: "Parched Earth",
        description: "The drought deepens. Food production is halved and the sacred spring runs low.",
        durationDays: 10,
        outcomes: [
          { kind: "resource_delta", resourceId: "grain", amount: -5 },
          { kind: "resource_delta", resourceId: "sacred_water", amount: -3 },
          { kind: "reputation_delta", delta: -2 }
        ],
        nextStageId: "drought-breaks"
      },
      {
        id: "drought-breaks",
        label: "The Rains Return",
        description: "At last, clouds gather and the rains come. The drought is broken, though the damage lingers.",
        durationDays: 3,
        outcomes: [
          { kind: "reputation_delta", delta: 2 },
          { kind: "pilgrim_surge", amount: 2 }
        ]
      }
    ]
  },
  {
    id: "disaster-locust-swarm",
    label: "Locust Swarm",
    domain: "economic",
    triggerConditions: [
      { kind: "random_chance", probability: 0.05 }
    ],
    triggerCooldownDays: 90,
    maxConcurrent: 1,
    stages: [
      {
        id: "locusts-arrive",
        label: "Swarm Descends",
        description: "A dark cloud of locusts descends upon the fields. Grain and olive crops are devoured in hours.",
        durationDays: 3,
        outcomes: [
          { kind: "resource_delta", resourceId: "grain", amount: -12 },
          { kind: "resource_delta", resourceId: "olives", amount: -8 }
        ],
        choiceA: {
          label: "Sacrifice and pray for deliverance",
          outcomes: [
            { kind: "resource_delta", resourceId: "sacred_animals", amount: -3 },
            { kind: "resource_delta", resourceId: "incense", amount: -3 },
            { kind: "reputation_delta", delta: 3 }
          ]
        },
        choiceB: {
          label: "Burn fields to drive them away",
          outcomes: [
            { kind: "resource_delta", resourceId: "grain", amount: -5 },
            { kind: "building_damage", defId: "grain_field", conditionLoss: 20 }
          ]
        },
        nextStageId: "locusts-linger"
      },
      {
        id: "locusts-linger",
        label: "Fields Laid Bare",
        description: "The locusts move on, but the fields are stripped bare. No harvest will come for some time.",
        durationDays: 12,
        outcomes: [
          { kind: "resource_delta", resourceId: "grain", amount: -3 },
          { kind: "reputation_delta", delta: -1 }
        ],
        nextStageId: "locusts-aftermath"
      },
      {
        id: "locusts-aftermath",
        label: "Recovery Begins",
        description: "The swarm has passed. The fields must be replanted and patience is needed.",
        durationDays: 5,
        outcomes: [
          { kind: "spawn_consultation", factionId: "argos", domain: "economic", urgency: 3 }
        ]
      }
    ]
  },
  {
    id: "disaster-wildfire",
    label: "Wildfire",
    domain: "economic",
    triggerConditions: [
      { kind: "season_is", season: "Summer" },
      { kind: "random_chance", probability: 0.06 }
    ],
    triggerCooldownDays: 90,
    maxConcurrent: 1,
    stages: [
      {
        id: "wildfire-ignites",
        label: "Fire on the Hills",
        description: "A wildfire erupts in the dry summer hills. Timber buildings and log stores are at grave risk.",
        durationDays: 3,
        outcomes: [
          { kind: "building_damage", defId: "hylotomos_camp", conditionLoss: 30 },
          { kind: "resource_delta", resourceId: "logs", amount: -10 },
          { kind: "resource_delta", resourceId: "planks", amount: -5 }
        ],
        choiceA: {
          label: "Sacrifice resources to create firebreaks",
          outcomes: [
            { kind: "resource_delta", resourceId: "logs", amount: -5 },
            { kind: "resource_delta", resourceId: "gold", amount: -10 }
          ]
        },
        choiceB: {
          label: "Pray for rain",
          outcomes: [
            { kind: "resource_delta", resourceId: "incense", amount: -3 },
            { kind: "reputation_delta", delta: 1 }
          ]
        },
        nextStageId: "wildfire-spreads"
      },
      {
        id: "wildfire-spreads",
        label: "The Fire Spreads",
        description: "Flames leap from hill to hill. The air is thick with smoke and ash.",
        durationDays: 5,
        outcomes: [
          { kind: "building_damage", conditionLoss: 15 },
          { kind: "resource_delta", resourceId: "logs", amount: -5 },
          { kind: "reputation_delta", delta: -2 }
        ],
        nextStageId: "wildfire-aftermath"
      },
      {
        id: "wildfire-aftermath",
        label: "Ashes and Renewal",
        description: "The fire burns itself out. The hillsides are scarred but rebuilding can begin.",
        durationDays: 7,
        outcomes: [
          { kind: "reputation_delta", delta: 1 },
          { kind: "spawn_consultation", factionId: "sparta", domain: "spiritual", urgency: 3 }
        ]
      }
    ]
  }
];

export const eventChainDefById: Record<string, EventChainDef> = Object.fromEntries(
  eventChainDefs.map((d) => [d.id, d])
);
