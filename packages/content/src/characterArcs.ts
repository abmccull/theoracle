import type { FactionId } from "./schema";

export type CharacterArcTrigger = "high_trust" | "low_trust" | "war" | "succession" | "trade" | "any";

export type BranchCondition = "prophecy_success" | "prophecy_failure" | "neutral";

export type CharacterArcStageDef = {
  narrative: string;
  branchCondition?: BranchCondition;
};

export type CharacterArcDef = {
  id: string;
  label: string;
  description: string;
  stages: number;
  stageDefs: CharacterArcStageDef[];
  triggerCondition: CharacterArcTrigger;
  factionAffinity?: FactionId;
};

export const characterArcDefs: CharacterArcDef[] = [
  {
    id: "generals_gambit",
    label: "The General's Gambit",
    description: "A general seeks a war prophecy across several visits, the outcome of which may determine the course of a campaign.",
    stages: 3,
    triggerCondition: "war",
    stageDefs: [
      {
        narrative: "The general arrives at {oracleName} with dust-caked boots and a map etched in desperation. He speaks of a campaign against {factionName} and demands a sign from Apollo. His officers watch from the colonnade, gauging whether the oracle's words will match their own ambitions.",
      },
      {
        narrative: "Returning with a bloodied sash and fewer attendants, the general presses for clarity. The first prophecy haunts him — did it promise victory or merely survival? He lays an offering of captured arms upon the altar and asks whether the gods still favor his march.",
        branchCondition: "prophecy_success",
      },
      {
        narrative: "The general arrives a final time, alone. The campaign's outcome now rests on a single prophecy. If the oracle speaks true, songs will be written of this day. If not, the general's name will become a cautionary whisper among {factionName}'s council halls.",
        branchCondition: "prophecy_success",
      },
    ],
  },
  {
    id: "merchants_bargain",
    label: "The Merchant's Bargain",
    description: "A merchant proposes escalating trade deals over successive visits, with the potential to become a long-term patron.",
    stages: 4,
    triggerCondition: "trade",
    stageDefs: [
      {
        narrative: "A merchant from {factionName} enters with a modest offering and a shrewd glint. He asks whether the next trading season will favor his caravans. His question is simple, but his eyes measure every priest, every column, every crack in the marble.",
      },
      {
        narrative: "The merchant returns bearing finer gifts — amphorae of oil and bolts of dyed cloth. He proposes a regular tithe in exchange for priority consultations. His ambition has grown; he now speaks of exclusive routes through {factionName}'s territory.",
        branchCondition: "neutral",
      },
      {
        narrative: "Gold flows freely from the merchant's purse. He whispers of a grand monopoly and asks {oracleName} to bless the venture. Other traders eye the arrangement with jealousy. The merchant's patronage is generous, but his expectations have become a kind of debt.",
        branchCondition: "prophecy_success",
      },
      {
        narrative: "The merchant arrives with a final proposition — permanent patronage or nothing. He has staked his fortune on the oracle's favor. The deal would enrich {oracleName} for years, but binding the sanctuary to a single merchant's fortunes carries its own risk.",
        branchCondition: "prophecy_success",
      },
    ],
  },
  {
    id: "exiles_return",
    label: "The Exile's Return",
    description: "A political refugee seeks the oracle's support to reclaim what was lost, testing Delphi's willingness to intervene.",
    stages: 3,
    triggerCondition: "succession",
    stageDefs: [
      {
        narrative: "A cloaked figure slips through the Sacred Way at dusk. Once a noble of {factionName}, now an exile with nothing but a name and a grievance. They ask only one question: will the gods permit a return? The air in the sanctum grows heavy as the Pythia considers.",
      },
      {
        narrative: "The exile returns with allies — quiet men bearing the sigils of a minor house. They seek not merely permission now, but endorsement. A prophecy in their favor would rally supporters across {factionName}. A refusal would seal their fate as fugitives forever.",
        branchCondition: "prophecy_success",
      },
      {
        narrative: "The exile stands before {oracleName} one final time, no longer cloaked but armored. Behind them waits a small host. The moment of return has arrived, and all that remains is the oracle's final word — a word that will echo through {factionName}'s halls of power for a generation.",
        branchCondition: "prophecy_failure",
      },
    ],
  },
  {
    id: "priests_doubt",
    label: "The Priest's Doubt",
    description: "A visiting priest from another sanctuary begins to question the foundations of faith, seeking answers from Apollo's voice.",
    stages: 3,
    triggerCondition: "any",
    stageDefs: [
      {
        narrative: "A priest from a distant shrine arrives at {oracleName} bearing questions no offering can answer. He has seen too many prayers go unanswered and too many omens prove false. He does not ask for prophecy — he asks whether prophecy itself still holds meaning.",
      },
      {
        narrative: "The visiting priest returns, having spent weeks debating with local acolytes. His doubt has deepened but so has his fascination. He requests a private audience with the Pythia, hoping her trance-words will restore what reason has eroded. The other priests watch with unease.",
        branchCondition: "neutral",
      },
      {
        narrative: "On his final visit, the priest's doubt has crystallized into either renewed conviction or quiet apostasy. He asks one last question of {oracleName} — not about the future, but about the nature of the divine voice itself. His answer will determine whether he returns to his shrine as a believer or a heretic.",
        branchCondition: "prophecy_success",
      },
    ],
  },
  {
    id: "queens_secret",
    label: "The Queen's Secret",
    description: "A royal figure seeks a private prophecy across multiple audiences, each visit revealing another layer of intrigue.",
    stages: 4,
    triggerCondition: "high_trust",
    stageDefs: [
      {
        narrative: "A veiled figure of unmistakable bearing enters {oracleName} with a small retinue. She identifies herself only as a servant of {factionName}, but the quality of her offerings betrays royalty. Her question concerns a matter she will not name aloud — only in whispers to the Pythia.",
      },
      {
        narrative: "The queen returns without her retinue, cloaked in common wool. She reveals the true nature of her inquiry: a succession crisis threatens {factionName}'s throne, and she needs the oracle's voice to outmaneuver her rivals. Trust deepens, and so does the danger.",
        branchCondition: "neutral",
      },
      {
        narrative: "On her third visit, the queen brings a sealed letter and asks {oracleName} to prophesy over it. The contents, she says, will determine whether {factionName} sees peace or civil war. She trusts the oracle now — perhaps more than is wise for either party.",
        branchCondition: "prophecy_success",
      },
      {
        narrative: "The queen arrives in full regalia, her disguise abandoned. She asks for a public prophecy to legitimize her claim before all of {factionName}. The oracle's word will either crown her or condemn her. There is no middle ground, and {oracleName}'s reputation rides on the outcome.",
        branchCondition: "prophecy_success",
      },
    ],
  },
  {
    id: "scholars_quest",
    label: "The Scholar's Quest",
    description: "A researcher arrives seeking fragments of ancient knowledge, each visit building toward a revelation.",
    stages: 3,
    triggerCondition: "any",
    stageDefs: [
      {
        narrative: "A scholar arrives at {oracleName} bearing scrolls and a restless curiosity. He does not seek prophecy for war or trade but for knowledge itself — fragments of an ancient hymn said to contain the true name of Apollo. The priests are intrigued despite themselves.",
      },
      {
        narrative: "The scholar returns with new translations and a theory that connects {oracleName}'s founding myths to a forgotten rite. He requests access to the sanctuary's archives and offers to share his findings. His work is brilliant, but some priests fear what forgotten knowledge might unearth.",
        branchCondition: "neutral",
      },
      {
        narrative: "On his final visit, the scholar presents his completed work — a reconstruction of the lost hymn. If performed during a consultation, it might deepen the Pythia's trance beyond anything seen in living memory. Or it might invoke something the sanctuary was never meant to contain. The choice belongs to {oracleName}.",
        branchCondition: "prophecy_success",
      },
    ],
  },
  {
    id: "ambassadors_mission",
    label: "The Ambassador's Mission",
    description: "A diplomat arrives seeking a prophecy of peace, but each visit reveals deeper entanglements between warring states.",
    stages: 3,
    triggerCondition: "war",
    stageDefs: [
      {
        narrative: "An ambassador from {factionName} arrives with olive branches and a carefully worded plea. War grinds on, and the factions seek a divine mandate for peace. But the ambassador's smile is practiced, and the terms of peace may favor {factionName} above all others.",
      },
      {
        narrative: "The ambassador returns with new instructions and a harder edge. The war has shifted, and {factionName} no longer asks for peace but for advantage. The oracle is being drawn into politics, and the ambassador makes clear that neutrality will be interpreted as hostility.",
        branchCondition: "prophecy_failure",
      },
      {
        narrative: "On the ambassador's final visit, the pretense of diplomacy has worn thin. {factionName} demands a prophecy that will end the war on their terms. The ambassador lays a staggering sum on the altar and waits. Whatever {oracleName} speaks next will reshape the balance of power across Hellas.",
        branchCondition: "prophecy_success",
      },
    ],
  },
  {
    id: "heirs_claim",
    label: "The Heir's Claim",
    description: "A successor seeks divine legitimacy for a contested throne, returning with greater urgency each time.",
    stages: 4,
    triggerCondition: "succession",
    stageDefs: [
      {
        narrative: "A young noble of {factionName} arrives at {oracleName}, claiming rightful succession to a contested seat. They bear the signet of their house and speak with the confidence of one who has never been refused. They ask: does Apollo recognize the blood-right?",
      },
      {
        narrative: "The heir returns in haste. A rival claimant has emerged, and {factionName}'s council is divided. The heir needs more than a vague blessing now — they need a prophecy specific enough to silence dissent. Desperation sharpens their offerings and their tone.",
        branchCondition: "neutral",
      },
      {
        narrative: "Tensions in {factionName} have escalated to the brink of violence. The heir arrives with armed guards and asks {oracleName} for a prophecy that names them by right. The Pythia's words will either prevent bloodshed or ignite it. Other factions watch closely.",
        branchCondition: "prophecy_success",
      },
      {
        narrative: "The heir stands before the oracle one final time. Civil war has already begun in {factionName}, and both sides invoke divine will. The heir begs {oracleName} for a definitive proclamation. Whatever the oracle speaks now becomes history — carved into stone and sung by bards for centuries to come.",
        branchCondition: "prophecy_failure",
      },
    ],
  },
];

export const characterArcDefById: Record<string, CharacterArcDef> = Object.fromEntries(
  characterArcDefs.map((def) => [def.id, def])
);
