import type { FactionId } from "./schema";

/**
 * Personality-flavored consultation intro lines for each faction's envoy.
 * Tone matches the faction profile as defined in factionDefs.
 */
export const envoyDialogues: Record<FactionId, string[]> = {
  athens: [
    "We do not come seeking mere fortune-telling — Athens asks the deeper question: what does wisdom demand of us now?",
    "The Assembly debates endlessly, but only Apollo speaks with certainty. Tell me, Oracle — what truth hides behind our deliberations?",
    "Socrates taught us to question everything. Yet here I stand, because some questions require more than mortal reason.",
    "Athens has never feared knowledge, even when it cuts. Speak plainly — what does the god see in our future?",
    "The owl of Athena watches, but even she defers to the Pythia's sight. We are ready to hear what others would rather not."
  ],

  sparta: [
    "Enough ceremony. Speak the prophecy. Sparta has no patience for riddles.",
    "We march at dawn. One question, one answer — make it count.",
    "Our shields are polished and our spears are sharp. Tell us where to point them.",
    "Sparta does not beg. We ask once. The god answers, or he does not."
  ],

  corinth: [
    "Consider this offering a down payment. If the prophecy proves profitable, there will be more — much more.",
    "Corinth understands value. We do not ask the gods for charity; we propose a fair exchange. Knowledge for gold.",
    "The trade winds shift, and I need to know which way before my competitors do. What can Apollo tell me about the coming season?",
    "Every deal has two sides. I bring tribute; you bring foresight. Let us negotiate terms the old-fashioned way — with mutual profit in mind.",
    "My warehouses are full and my ships are ready. All I need from the oracle is a heading."
  ],

  thebes: [
    "The sacred vapors call to us across the mountains. Thebes has always honored the old rites, and we come now in reverent supplication.",
    "I have fasted for seven days and bathed in the river at dawn. The god will find me worthy. Let the Pythia speak what the heavens whisper.",
    "There are signs in the sky that only the oracle can read. Thebes trembles before their beauty and their terror alike.",
    "We bring incense from the sacred groves and a prayer older than the stones of this temple. May Apollo's light illumine what mortal eyes cannot see.",
    "The divine voice speaks through many mouths, but only here does it speak true. Thebes kneels before the mystery."
  ],

  argos: [
    "Argos was old when other cities were mud huts. Remember that when you weigh our question.",
    "We are the sons of Heracles, and we do not grovel. But we respect the god's voice — when it speaks something worth hearing.",
    "Let lesser cities come hat in hand. Argos comes as an equal, seeking counsel between peers.",
    "Our lineage stretches back to the heroes. The oracle would do well to remember who stands before it.",
    "Argos has never lost its honor, and we will not start today. Speak a prophecy worthy of our legacy."
  ],

  miletus: [
    "I have studied the patterns of tides and stars, yet the oracle reveals what measurement cannot. Fascinating. Proceed.",
    "Miletus approaches prophecy as we approach all things — with rigorous curiosity. We will analyze every word.",
    "The natural philosophers theorize, but the Pythia demonstrates. I am here to observe, to record, and to learn.",
    "Our scholars have debated the mechanism of divine speech for decades. Perhaps today we will finally gather conclusive evidence.",
    "Knowledge is the only currency that appreciates with use. What can the oracle add to Miletus's treasury of understanding?"
  ],

  syracuse: [
    "Syracuse is building something the world has not seen before. The oracle's vision will help us seize the moment.",
    "We did not sail across the sea to hear half-measures. Give us a prophecy bold enough to match our ambitions.",
    "The western colonies grow stronger by the season. Tell us — does Apollo see Syracuse at the head of a new order?",
    "Power favors the decisive. Syracuse is ready to act. We need only the god's confirmation.",
    "Other cities cling to the past. Syracuse looks forward. What does the oracle see on our horizon?"
  ],

  macedon: [
    "We come in friendship, of course. Macedon always comes in friendship... until friendship is no longer convenient.",
    "The court sends its regards and a generous tribute. In return, we ask only for a small prophecy — one that might reshape the balance of certain... arrangements.",
    "Let us speak candidly, behind closed doors. Macedon has interests that align with the oracle's prosperity. A mutually beneficial reading, perhaps?",
    "The king watches from afar and weighs every word that leaves this sanctuary. Choose yours carefully, as we choose ours.",
    "There are many oracles in the world, but only one with Delphi's reputation. Macedon would hate to see that reputation... diminished."
  ]
};
