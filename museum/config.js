/**
 * config.js — centralised data for the 7-era Carthage Virtual Museum.
 * Chronological linear journey: 814 BC → Phoenician origins → Roman legacy.
 *
 * Layout (Z axis, player walks from +Z toward −Z):
 *   Room 1 (r1): Z 68–82   | Foundation & Phoenician Origins  — 814 BC
 *   Room 2 (r2): Z 45–63   | Rise of Commerce                 — 750–500 BC
 *   Room 3 (r3): Z 22–40   | Conflicts with the Greeks        — 580–340 BC
 *   Room 4 (r4): Z −5–17   | Apogee of Carthage (grand hall)  — 400–264 BC
 *   Room 5 (r5): Z −33– −10| The Punic Wars                   — 264–146 BC
 *   Room 6 (r6): Z −56– −38| The Fall of Carthage             — 146 BC
 *   Room 7 (r7): Z −79– −61| Roman Carthage & Legacy          — 44 BC+
 */

import * as THREE from "three";

// =============================================================================
// PLAYER & SYSTEM CONFIG
// =============================================================================

export const CONFIG = {
  player: {
    height: 1.65, walkSpeed: 5.5, sprintSpeed: 9.0,
    acceleration: 30, deceleration: 15, radius: 0.35,
    footstepInterval: 0.42,
  },
  npc: {
    speed: 1.3, followSpeed: 2.2, alertDistance: 4.5,
    followDistance: 12.0, observeTime: 5.0, idleTime: 3.0, wanderTime: 4.0,
  },
  interaction: { maxDistance: 5.5 },
  shadows: { mapSize: 512 },          // 2048 → 512 = 16× fewer shadow pixels/frame
  particles: { count: 120, spread: 18, height: 7 },
  audio: { enabled: false },
};

// =============================================================================
// ROOMS — 7 chronological eras
// =============================================================================

export const ROOMS = {
  r1: {
    id: "r1", roomNumber: 1,
    name: "Phoenician Origins",
    year: "814 BC",
    subtitle: "Birth of Carthage — The Founding",
    narration: "You stand at the very dawn of Carthage. Around 814 BC, Queen Elissa — called Dido by the Romans — fled political persecution in the Phoenician city of Tyre (in modern Lebanon) and led exiles across the sea to North Africa. What began as a modest trading outpost on a strategic coastal hill would become Qart-Hadasht — the New City. Guided by the goddess Tanit, built on maritime skill and ambition, a great civilisation was born from exile.",
    bounds: { minX: -7, maxX: 7, minZ: 68, maxZ: 82 },
    height: 7, thickness: 0.4,
    fog: { color: 0xb8956a, near: 4, far: 20 },
    ambientColor: 0xffd4a0, ambientIntensity: 0.35,
    npcBehavior: "calm",
  },
  r2: {
    id: "r2", roomNumber: 2,
    name: "Rise of Commerce",
    year: "750–500 BC",
    subtitle: "Mediterranean Trade Empire",
    narration: "From a humble trading outpost, Carthage grew into the dominant commercial empire of the ancient western world. Governed by a powerful merchant oligarchy, the city's fleets carried wine, olive oil, metals, and textiles to every port in the known world. By the 6th century BC, Carthage controlled the sea lanes from North Africa to Spain, Sardinia, and Sicily — commanding the greatest trade network the Mediterranean had ever seen. Gold and goods flowed through Carthage like the sea itself.",
    bounds: { minX: -8, maxX: 8, minZ: 45, maxZ: 63 },
    height: 8, thickness: 0.4,
    fog: { color: 0xc8a870, near: 5, far: 28 },
    ambientColor: 0xffe0a0, ambientIntensity: 0.4,
    npcBehavior: "calm",
  },
  r3: {
    id: "r3", roomNumber: 3,
    name: "Conflicts with the Greeks",
    year: "580–340 BC",
    subtitle: "Naval Power & Military Rise",
    narration: "As Carthage expanded into Sicily, it collided with powerful Greek colonies in some of antiquity's largest battles. Sicily became the central battleground for three centuries of war. Allied with the Etruscans, Carthage transformed itself from a merchant republic into a dominant naval and military power. The weapons on these walls, the battle maps on the floors — they tell one story: the sea was no longer just for trade. It was for war.",
    bounds: { minX: -8, maxX: 8, minZ: 22, maxZ: 40 },
    height: 8, thickness: 0.4,
    fog: { color: 0x8a6040, near: 3, far: 20 },
    ambientColor: 0xff9944, ambientIntensity: 0.25,
    npcBehavior: "observational",
  },
  r4: {
    id: "r4", roomNumber: 4,
    name: "Apogee of Carthage",
    year: "400–264 BC",
    subtitle: "Peak of Power & Civilisation",
    narration: "At its zenith, Carthage was one of the wealthiest and most advanced cities in the ancient world — home to nearly half a million people. Governed by an oligarchic republic of elite merchant families, the city commanded the seas, minted gold coins, and built temples rivalling those of Greece. Advanced urban planning, multi-storey apartments, and a great twin harbour made Carthage a jewel of the Mediterranean. Under the eternal gaze of Tanit, art, science, and empire flourished together.",
    bounds: { minX: -12, maxX: 12, minZ: -5, maxZ: 17 },
    height: 12, thickness: 0.4,
    fog: { color: 0xc8a880, near: 6, far: 42 },
    ambientColor: 0xffe8d0, ambientIntensity: 0.45,
    npcBehavior: "guide",
  },
  r5: {
    id: "r5", roomNumber: 5,
    name: "The Punic Wars",
    year: "264–146 BC",
    subtitle: "Rome vs Carthage — A World at War",
    narration: "Three devastating wars between Carthage and the Roman Republic would decide the fate of civilisation. The brilliant general Hannibal Barca crossed the Alps with 37 war elephants and 38,000 soldiers, shattering Roman legions at Trebia, Trasimene, and Cannae — where 50,000 Romans died in a single afternoon. Hannibal came within reach of destroying Rome itself. Yet Rome endured, rebuilt, and turned the tide. Carthage would never recover.",
    bounds: { minX: -10, maxX: 10, minZ: -33, maxZ: -10 },
    height: 10, thickness: 0.4,
    fog: { color: 0x7a3a20, near: 2, far: 18 },
    ambientColor: 0xff6633, ambientIntensity: 0.2,
    npcBehavior: "observational",
  },
  r6: {
    id: "r6", roomNumber: 6,
    name: "The Fall of Carthage",
    year: "149–146 BC",
    subtitle: "Total Destruction by Rome",
    narration: "'Carthago delenda est' — Carthage must be destroyed. Rome's Senator Cato repeated those words at the end of every speech. After the Third Punic War, Rome besieged the city for three years, then burned it for seventeen days. The city was completely and utterly erased. 50,000 survivors were enslaved. The buildings were pulled down stone by stone. All that remained… was silence and ash.",
    bounds: { minX: -9, maxX: 9, minZ: -56, maxZ: -38 },
    height: 9, thickness: 0.4,
    fog: { color: 0x6a5a4a, near: 1, far: 12 },
    ambientColor: 0xaa8866, ambientIntensity: 0.12,
    npcBehavior: "reflective",
  },
  r7: {
    id: "r7", roomNumber: 7,
    name: "Roman Carthage & Legacy",
    year: "44 BC — Present",
    subtitle: "Rebirth, Memory & Modern Tunisia",
    narration: "Rome rebuilt Carthage as a Roman colonial city — and it became one of the largest cities in the entire Empire, a major centre of early Christianity, law, and learning. For centuries, Punic and Roman traditions blended into a unique hybrid civilisation. The Punic language survived four hundred years after the city's fall. From ancient Qart-Hadasht to modern Tunis — the memory of Carthage continues to shape the identity of North Africa. Even in ruin… Carthage lived on.",
    bounds: { minX: -9, maxX: 9, minZ: -79, maxZ: -61 },
    height: 9, thickness: 0.4,
    fog: { color: 0xc8c0b0, near: 5, far: 35 },
    ambientColor: 0xfff0e0, ambientIntensity: 0.45,
    npcBehavior: "reflective",
  },
};

// =============================================================================
// PASSAGES — linear corridors connecting the 7 rooms (all Z-aligned)
// =============================================================================

export const PASSAGES = [
  { id: "p1_2", from: "r1", to: "r2", year: "~750 BC", label: "The Merchants Set Sail",  cx: 0, cz: 65.5, w: 4, d: 5, h: 7  },
  { id: "p2_3", from: "r2", to: "r3", year: "~580 BC", label: "The First Battles",        cx: 0, cz: 42.5, w: 4, d: 5, h: 8  },
  { id: "p3_4", from: "r3", to: "r4", year: "~400 BC", label: "The Golden Age",            cx: 0, cz: 19.5, w: 4, d: 5, h: 9  },
  { id: "p4_5", from: "r4", to: "r5", year: "264 BC",  label: "The Wars Begin",            cx: 0, cz: -7.5, w: 4, d: 5, h: 10 },
  { id: "p5_6", from: "r5", to: "r6", year: "146 BC",  label: "The Final Siege",           cx: 0, cz: -35.5, w: 4, d: 5, h: 9 },
  { id: "p6_7", from: "r6", to: "r7", year: "44 BC",   label: "A New Beginning",           cx: 0, cz: -58.5, w: 4, d: 5, h: 8 },
];

// =============================================================================
// NPC DIALOGUES — era-specific historian commentary
// =============================================================================

export const NPC_DIALOGUES = {
  r1: [
    "Carthage was born from exile… and ambition.",
    "Queen Elissa bargained for land using an ox-hide cut into thin strips — clever enough to encircle the entire Byrsa hill.",
    "The Phoenicians of Tyre brought their alphabet, their gods, and their mastery of the sea to this African shore.",
    "What began as a trading outpost became one of history's mightiest civilisations. Everything starts somewhere.",
  ],
  r2: [
    "Gold and goods flowed through Carthage like the sea itself.",
    "Merchant ships reached Britain for tin, West Africa for gold, and possibly the Canary Islands — centuries before Columbus.",
    "The ruling merchant oligarchy controlled vast trade routes from North Africa to Spain, Sardinia, and Sicily.",
    "These amphorae held olive oil, wine, and textiles — the lifeblood of an empire built not on conquest, but commerce.",
  ],
  r3: [
    "The sea was no longer just for trade… but for war.",
    "Sicily was the prize. For three centuries, Carthage and the Greek world fought over this island — battle after battle.",
    "At Himera in 480 BC, Carthage suffered a crushing defeat on the same day as the Greek victory at Salamis.",
    "Through these wars, Carthage forged a true military identity — naval dominance and a mercenary army unlike any other.",
  ],
  r4: [
    "Carthage stood as a jewel of the Mediterranean.",
    "At its peak, nearly half a million people lived here — one of the largest, wealthiest cities of the ancient world.",
    "The goddess Tanit watched over everything. Her symbol appears on every coin, stele, and city wall.",
    "The twin harbours — one for trade, one for war — were feats of engineering that made Rome envious.",
  ],
  r5: [
    "Hannibal brought war to Rome's doorstep… and almost won.",
    "He crossed the Alps in winter with 37 war elephants. No general in history had attempted such a march.",
    "At Cannae, Hannibal encircled and destroyed 70,000 Roman soldiers in a single afternoon — military perfection.",
    "Yet Rome refused to surrender. City by city, year by year, they rebuilt — and slowly, the tide turned against Carthage.",
  ],
  r6: [
    "All that remained… was silence and ash.",
    "Cato ended every Senate speech the same way: 'Carthage must be destroyed.' He got his wish.",
    "The Roman siege lasted three years. Then the city burned for seventeen days. 50,000 survivors were enslaved.",
    "Yet the Punic language survived four more centuries. Saint Augustine knew people who still spoke it in the 5th century CE.",
  ],
  r7: [
    "Even in ruin… Carthage lived on.",
    "Rome rebuilt the city as a colonial capital — it became the second-largest metropolis of the western Empire.",
    "Punic and Roman traditions blended here into a unique hybrid culture that shaped all of North Africa.",
    "From Qart-Hadasht to Tunis — three thousand years of memory. The city changed names, but never truly died.",
  ],
};

// =============================================================================
// ARTIFACT CATEGORIES
// =============================================================================

export const CATEGORIES = {
  religion:     { label: "Religion & Mythology", color: "#c9a227" },
  trade:        { label: "Trade & Economy",      color: "#b89060" },
  military:     { label: "Military & War",       color: "#a04030" },
  daily:        { label: "Daily Life",           color: "#7a9a6a" },
  architecture: { label: "Architecture",         color: "#6a8aaa" },
};

// =============================================================================
// ARTWORK / ARTIFACT DATA
// zone: r1–r7  |  type: "wall" | "pedestal" | "case" | "centerpiece"
// wall: "back" (maxZ) | "front" (minZ) | "left" (minX) | "right" (maxX) | "center"
// centerpiece entries are placed by their room's build method, not _loadArtworks()
// posterImage: optional ./posters/… for *room overview* panels (with `poster` block).
// url: optional image for *framed wall* exhibits — https:// or ./local.png; same hero layout as posters (keep files reasonably small).
// =============================================================================

export const ARTWORK_DATA = [

  // ══════════════════════════ ROOM 1 — Foundation (814 BC) ══════════════════

  {
    id: "room-overview-r1", zone: "r1", type: "wall",
    posterImage: "./posters/room-overview-01.png",
    category: "religion", origin: "Museum guide",
    name: "Phoenician Origins",
    description: "Room overview: founding era of Qart-Hadasht from Tyre to North Africa.",
    context: "This panel summarises how Carthage began as a Phoenician trading settlement under Queen Elissa (Dido), grew from Tyrian exile and maritime skill, and laid the foundations of a Mediterranean power.",
    wall: "back", offset: 4.2, heightFactor: 0.52, w: 2.4, h: 3.5,
    poster: {
      period: "~814 BC — 7th century BC",
      rows: [
        ["Key idea", "Foundation of Carthage by Phoenician settlers from Tyre (modern Lebanon)."],
        ["Important figure", "Queen Elissa — called Dido in Roman legend."],
        ["Strategic focus", "Maritime trade and a defensible African coast."],
        ["Typical artifacts", "Amphorae, early ships, Phoenician inscriptions."],
      ],
      funFact: "Carthage began as a modest trading outpost before it became an empire.",
    },
  },
  {
    id: "founding-stele", zone: "r1", type: "wall",
    category: "religion", origin: "Phoenician / Punic",
    name: "Founding Stele of Carthage",
    description: "A votive limestone stele inscribed in Punic script, commemorating the founding of Qart-Hadasht — the New City — by Phoenician settlers from Tyre in modern Lebanon, around 814 BC.",
    context: "Queen Elissa (Dido) bargained for land by cutting an ox-hide into thin strips and encircling the entire Byrsa hill. What began as a simple trading outpost became the most powerful city of the ancient western world.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Stele_with_Tanit_symbol_from_Carthage.jpg/800px-Stele_with_Tanit_symbol_from_Carthage.jpg",
    wall: "back", offset: 0, heightFactor: 0.48, w: 2.0, h: 2.8,
  },
  {
    id: "queen-dido-r1", zone: "r1", type: "pedestal",
    category: "religion", origin: "Phoenician",
    name: "Votive Figure of Queen Elissa",
    description: "A stylised bronze figure representing Queen Elissa (Dido), founder of Carthage, depicted with the Tanit crescent crown.",
    context: "Elissa of Tyre fled political persecution and led Phoenician nobles to North Africa, where she founded Qart-Hadasht around 814 BC. Her story became legend across the ancient Mediterranean.",
    wall: "left", offset: 2,
  },
  {
    id: "migration-map-r1", zone: "r1", type: "wall",
    category: "trade", origin: "Phoenician",
    name: "Tyre to Carthage — The Great Migration",
    description: "A reconstruction map showing the Phoenician sea route from Tyre across the Mediterranean to the site of Carthage on the coast of North Africa.",
    context: "The Phoenicians were master navigators, using stars and coastal landmarks to sail the entire length of the Mediterranean. The journey from Tyre to Carthage would have taken several weeks.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Carthage_ruins.jpg/1024px-Carthage_ruins.jpg",
    wall: "right", offset: -1, heightFactor: 0.45, w: 2.6, h: 1.9,
  },
  {
    id: "phoenician-amphora-r1", zone: "r1", type: "pedestal",
    category: "trade", origin: "Phoenician",
    name: "Phoenician Transport Amphora",
    description: "A large ceramic amphora used to transport olive oil and wine across the Mediterranean. These vessels were the shipping containers of antiquity.",
    context: "Standardised amphora shapes allowed Phoenician merchants to stack cargo efficiently in ship holds. Fragments of these jars have been found from Cornwall to the Persian Gulf.",
    wall: "right", offset: 2,
  },

  // ══════════════════════════ ROOM 2 — Commerce (750–500 BC) ════════════════

  {
    id: "room-overview-r2", zone: "r2", type: "wall",
    posterImage: "./posters/room-overview-02.png",
    category: "trade", origin: "Museum guide",
    name: "Rise of Commerce",
    description: "Room overview: Carthage as a Mediterranean trade empire.",
    context: "Wealth came from networks linking North Africa, Iberia, Sardinia, and Sicily. Merchant elites traded wine, olive oil, metals, and textiles while an early oligarchic government steered the republic toward commercial dominance.",
    wall: "back", offset: 5, heightFactor: 0.52, w: 2.4, h: 3.5,
    poster: {
      period: "7th — 6th century BC (exhibit span ~750–500 BC)",
      rows: [
        ["Key idea", "Growth from colony into the leading western Mediterranean trade power."],
        ["Regions linked", "North Africa, Spain, Sardinia, Sicily, and sea routes beyond."],
        ["Trade goods", "Wine, olive oil, metals, textiles, and luxury crafts."],
        ["Economy & politics", "Wealth from commerce; powerful merchant class; early oligarchic rule."],
        ["Typical artifacts", "Coins, route maps, amphorae, and cargo imagery."],
      ],
      funFact: "Carthage controlled some of the busiest sea lanes of the ancient world.",
    },
  },
  {
    id: "trade-map-r2", zone: "r2", type: "wall",
    category: "trade", origin: "Phoenician",
    name: "Phoenician Trade Routes — Mediterranean Network",
    description: "A reconstruction of Carthage's vast Mediterranean trade network — spanning North Africa, Spain, Sardinia, Sicily, and reaching as far as Britain and possibly West Africa.",
    context: "Governed by a powerful merchant oligarchy, Carthage controlled trade in wine, olive oil, metals, and textiles across the entire western Mediterranean. By the 6th century BC, it was the dominant commercial power of the ancient world.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Carthage_ruins.jpg/1024px-Carthage_ruins.jpg",
    wall: "back", offset: 0, heightFactor: 0.45, w: 3.5, h: 2.4,
  },
  {
    id: "punic-coins-r2", zone: "r2", type: "case",
    category: "trade", origin: "Punic",
    name: "Carthaginian Gold & Silver Coins",
    description: "A collection of electrum and silver coins minted at Carthage, featuring the head of Tanit on the obverse and a horse on the reverse.",
    context: "Carthage began minting coins in the late 5th century BC. The horse motif referenced the city's legendary founding — settlers found a horse's head while digging, an omen of martial power.",
    wall: "left", offset: -3,
  },
  {
    id: "purple-dye-r2", zone: "r2", type: "pedestal",
    category: "trade", origin: "Phoenician",
    name: "Murex Shell — Tyrian Purple",
    description: "The murex sea snail, source of the legendary Tyrian purple dye that gave the Phoenicians their Greek name (phoinikes = purple people).",
    context: "It took approximately 12,000 murex snails to produce just 1.5 grams of dye. The colour was so precious that only royalty could afford garments dyed with it — hence 'royal purple'.",
    wall: "left", offset: 3,
  },
  {
    id: "glass-beads-r2", zone: "r2", type: "case",
    category: "trade", origin: "Phoenician",
    name: "Phoenician Glass Beads & Amulets",
    description: "Multicoloured glass beads and eye-shaped amulets created using techniques developed in Sidon and Tyre.",
    context: "The Phoenicians were master glassmakers. Their polychrome glass was traded as a luxury commodity throughout the ancient world. Eye-beads were believed to ward off the evil eye.",
    wall: "right", offset: -3,
  },

  // ══════════════════════════ ROOM 3 — Greek Conflicts (580–340 BC) ══════════

  {
    id: "room-overview-r3", zone: "r3", type: "wall",
    posterImage: "./posters/room-overview-03.png",
    category: "military", origin: "Museum guide",
    name: "Conflicts with the Greeks",
    description: "Room overview: wars that turned Carthage into a military sea power.",
    context: "Sicily was the main theatre: Greek colonies versus Punic armies and fleets. Alliances with peoples such as the Etruscans helped Carthage contest Greek expansion while building a feared navy and mercenary army.",
    wall: "back", offset: 5, heightFactor: 0.52, w: 2.4, h: 3.5,
    poster: {
      period: "6th — 4th century BC (exhibit span ~580–340 BC)",
      rows: [
        ["Key idea", "Military emergence through sustained conflict with Greek states."],
        ["Main rival", "Greek colonies, especially in Sicily."],
        ["Alliances", "Etruscans and other western Mediterranean partners."],
        ["Military strength", "Growing navy, mercenary armies, and combined-arms warfare."],
        ["Typical artifacts", "Helmets, shields, weapons, and battle maps."],
      ],
      funFact: "Sicily was the decisive chessboard for Greek–Punic rivalry.",
    },
  },
  {
    id: "sicily-battles-r3", zone: "r3", type: "wall",
    category: "military", origin: "Punic",
    name: "The Struggle for Sicily — Battle Maps",
    description: "A series of strategic battle maps showing the major Carthaginian-Greek conflicts over Sicily — the main battleground of the ancient western Mediterranean from the 6th to 4th centuries BC.",
    context: "Sicily was the central prize. Carthage, allied with the Etruscans, fought Greek colonies for three centuries. Through these wars Carthage transformed from a merchant republic into a dominant naval and military power with a feared mercenary army.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Carthage%2C_Tunisia_-_Antonine_baths.jpg/1024px-Carthage%2C_Tunisia_-_Antonine_baths.jpg",
    wall: "back", offset: 0, heightFactor: 0.45, w: 3.2, h: 2.2,
  },
  {
    id: "bronze-helmet-r3", zone: "r3", type: "pedestal",
    category: "military", origin: "Punic",
    name: "Carthaginian Bronze Helmet",
    description: "A Montefortino-type bronze helmet used by Carthaginian infantry, featuring a distinctive crest knob and cheek guards.",
    context: "Carthage's army was composed of mercenaries — Numidian cavalry, Balearic slingers, Iberian infantry, and Libyan spearmen. Officers like Hamilcar coordinated these diverse forces into effective armies.",
    wall: "right", offset: 2,
  },
  {
    id: "punic-mask-r3", zone: "r3", type: "wall",
    category: "religion", origin: "Punic",
    name: "Punic Funerary Mask",
    description: "A terracotta grimacing mask from the necropolis of Carthage, placed in tombs to ward off evil spirits and protect the dead.",
    context: "Punic burial customs blended Phoenician, Egyptian, and North African traditions. Warriors were buried with weapons, amulets, and these apotropaic masks to guide them to the afterlife.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Masque_Punique.jpg/800px-Masque_Punique.jpg",
    wall: "left", offset: -2, heightFactor: 0.45, w: 2.0, h: 2.6,
  },
  {
    id: "shield-boss-r3", zone: "r3", type: "case",
    category: "military", origin: "Punic",
    name: "Carthaginian Shield Boss",
    description: "A bronze shield boss (umbo) from a Carthaginian round shield, decorated with a crescent and palm motif.",
    context: "The round shield (aspis) was standard equipment for Carthaginian heavy infantry. The crescent of Tanit appeared even on military equipment, reflecting the deep bond between religion and warfare in Punic culture.",
    wall: "right", offset: -4,
  },

  // ══════════════════════════ ROOM 4 — Apogee (400–264 BC) ══════════════════

  {
    id: "room-overview-r4", zone: "r4", type: "wall",
    posterImage: "./posters/room-overview-04.png",
    category: "architecture", origin: "Museum guide",
    name: "Apogee of Carthage",
    description: "Room overview: the city at its height of wealth, population, and influence.",
    context: "An oligarchic republic of elite families governed a metropolis of hundreds of thousands. Twin harbours, dense housing on Byrsa, temples, and crafts made Carthage one of the richest cities of antiquity.",
    wall: "back", offset: 8.5, heightFactor: 0.48, w: 2.45, h: 3.5,
    poster: {
      period: "5th — 3rd century BC (exhibit span ~400–264 BC)",
      rows: [
        ["Key idea", "Peak urban power: wealth, population, and prestige across the Mediterranean."],
        ["Government", "Oligarchic republic led by merchant and landowning elites."],
        ["Strengths", "Dominant navy, vast trade network, and monumental building projects."],
        ["City life", "Grid streets, multi-storey housing, workshops, and busy harbours."],
        ["Typical artifacts", "Jewellery, fine pottery, religious stelae, and civic art."],
      ],
      funFact: "Carthage ranked among the wealthiest cities of the ancient world.",
    },
  },
  {
    id: "tanit-obelisk-r4", zone: "r4", type: "centerpiece",
    category: "religion", origin: "Punic",
    name: "Tanit Obelisk — Symbol of Carthage",
    description: "A golden obelisk crowned with the sacred symbol of Tanit — the supreme deity of Carthage, whose crescent and disc watched over every citizen.",
    context: "Tanit and Baal Hammon were the chief deities of Carthage. Thousands of votive stelae were offered at the Tophet sanctuary. Tanit's symbol — a triangle with raised arms and crescent head — became the enduring icon of Punic civilisation.",
  },
  {
    id: "tanit-stele-r4", zone: "r4", type: "wall",
    category: "religion", origin: "Punic",
    name: "Great Stele of Tanit",
    description: "A carved limestone votive stele bearing the iconic symbol of Tanit — triangle body, circle head, crescent arms — the supreme goddess of Carthage.",
    context: "The Tophet sanctuary of Carthage yielded thousands of such stelae. Tanit was the patron deity of the city and her symbol appears on coins, pottery, and funerary monuments across the Punic world.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Stele_with_Tanit_symbol_from_Carthage.jpg/800px-Stele_with_Tanit_symbol_from_Carthage.jpg",
    wall: "back", offset: -5, heightFactor: 0.4, w: 2.4, h: 3.2,
  },
  {
    id: "neptune-mosaic-r4", zone: "r4", type: "wall",
    category: "architecture", origin: "Roman-Punic",
    name: "Triumph of Neptune — Bardo Museum",
    description: "One of the finest Roman mosaics in existence, depicting Neptune on a chariot drawn by sea-horses, surrounded by nereids.",
    context: "Discovered near Sousse, Tunisia, this masterpiece dates to the late 2nd century CE and is the centrepiece of the Bardo National Museum — home to the world's largest collection of Roman mosaics.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Mosaic_depicting_the_Triumph_of_Neptune_%28Bardo_National_Museum%29.jpg/1024px-Mosaic_depicting_the_Triumph_of_Neptune_%28Bardo_National_Museum%29.jpg",
    wall: "right", offset: 4, heightFactor: 0.42, w: 3.5, h: 2.5,
  },
  {
    id: "byrsa-model-r4", zone: "r4", type: "wall",
    category: "architecture", origin: "Punic",
    name: "Reconstruction of Byrsa Hill",
    description: "An archaeological reconstruction of Byrsa Hill at the city's peak — grid-pattern streets, multi-storey apartment blocks, and public squares representing one of the most advanced urban centres of the ancient world.",
    context: "At its height, Carthage housed nearly half a million people under an oligarchic republic governed by elite merchant families. French excavations confirmed apartment blocks up to six storeys high, paved streets, and a sophisticated sewage system.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Carthage_ruins.jpg/1024px-Carthage_ruins.jpg",
    wall: "left", offset: 4, heightFactor: 0.42, w: 3.0, h: 2.2,
  },
  {
    id: "gold-earrings-r4", zone: "r4", type: "case",
    category: "daily", origin: "Punic",
    name: "Punic Gold Earrings",
    description: "Pair of elaborate gold earrings with granulation, featuring crescent moon and disc motifs sacred to Tanit.",
    context: "Carthaginian jewellery combined Phoenician, Egyptian, and Greek influences into a distinctive Punic style. These earrings were found in a wealthy woman's tomb near the Tophet.",
    wall: "right", offset: -5,
  },
  {
    id: "punic-pottery-r4", zone: "r4", type: "case",
    category: "daily", origin: "Punic",
    name: "Punic Household Pottery",
    description: "A collection of everyday Carthaginian ceramics: cooking pots, oil lamps, and painted plates with geometric patterns.",
    context: "Punic pottery evolved from Phoenician prototypes but developed distinctive local forms. Red-slip ware and painted geometric designs are hallmarks of Carthaginian domestic production.",
    wall: "left", offset: -5,
  },

  // ══════════════════════════ ROOM 5 — Punic Wars (264–146 BC) ══════════════

  {
    id: "room-overview-r5", zone: "r5", type: "wall",
    posterImage: "./posters/room-overview-05.png",
    category: "military", origin: "Museum guide",
    name: "The Punic Wars",
    description: "Room overview: the life-and-death struggle between Carthage and Rome.",
    context: "Three wars reshaped the Mediterranean. Hannibal Barca brought elephants over the Alps, shattered legions at Cannae, and nearly broke the Republic — yet Rome's resilience and resources eventually prevailed.",
    wall: "back", offset: 6.5, heightFactor: 0.5, w: 2.45, h: 3.5,
    poster: {
      period: "264 — 146 BC (exhibit highlights ~264–201 BC campaigns)",
      rows: [
        ["Key idea", "Total war for western Mediterranean supremacy against the Roman Republic."],
        ["Famous leader", "Hannibal Barca — tactician of Trebia, Trasimene, and Cannae."],
        ["Iconic moment", "Alpine crossing with war elephants and a multinational army."],
        ["Decisive clash", "Battle of Cannae — Rome's worst single-day battlefield disaster."],
        ["Typical artifacts", "Arms and armour, siege imagery, maps, and naval motifs."],
      ],
      funFact: "Hannibal came closer than anyone to knocking Rome out of history.",
    },
  },
  {
    id: "hannibal-alps-r5", zone: "r5", type: "wall",
    category: "military", origin: "Punic",
    name: "Hannibal's Crossing of the Alps — 218 BC",
    description: "A dramatic reconstruction of Hannibal Barca's legendary winter crossing of the Alps in 218 BC — 37 war elephants, 38,000 soldiers, and an act of military genius that almost toppled Rome.",
    context: "Hannibal nearly defeated the Roman Republic entirely — the greatest threat Rome ever faced. Despite winning every major battle in Italy, he could not take Rome without siege equipment. Rome refused to surrender, and year by year, Carthage's strength eroded.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Carthage%2C_Tunisia_-_Antonine_baths.jpg/1024px-Carthage%2C_Tunisia_-_Antonine_baths.jpg",
    wall: "back", offset: 0, heightFactor: 0.45, w: 4.0, h: 2.8,
  },
  {
    id: "war-elephant-r5", zone: "r5", type: "centerpiece",
    category: "military", origin: "Punic / North African",
    name: "War Elephant — Hannibal's Secret Weapon",
    description: "A bronze figurine of a North African forest elephant bearing a fighting tower (howdah), the signature weapon of Carthaginian warfare.",
    context: "The now-extinct North African forest elephant was smaller than its Asian cousins but terrifying in battle. Hannibal's 37 elephants became legendary — though most perished crossing the Alps or from the Italian winter.",
  },
  {
    id: "punic-warship-r5", zone: "r5", type: "wall",
    category: "military", origin: "Punic",
    name: "Punic Warship — The Quinquereme",
    description: "A polychrome mosaic depicting a quinquereme with bronze ram, square sail, and rows of oars — a record of Carthaginian naval engineering.",
    context: "Carthage's warships dominated the sea lanes from Sicily to Gibraltar. In the First Punic War, Rome reverse-engineered a captured vessel to build their own fleet and used a boarding device called the corvus to neutralise Carthaginian naval superiority.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Punic_ship_on_mosaic.jpg/1024px-Punic_ship_on_mosaic.jpg",
    wall: "left", offset: -3, heightFactor: 0.45, w: 3.0, h: 2.0,
  },
  {
    id: "battle-cannae-r5", zone: "r5", type: "wall",
    category: "military", origin: "Roman / Punic",
    name: "Battle of Cannae — 216 BC",
    description: "A strategic map of Cannae, where Hannibal encircled and annihilated a Roman army of 70,000 men in a single afternoon.",
    context: "Cannae is still studied in military academies worldwide as the perfect tactical encirclement. An estimated 50,000 Romans died in a few hours — Rome's worst single-day defeat in history. Yet Rome refused to surrender.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Carthage_ruins.jpg/1024px-Carthage_ruins.jpg",
    wall: "right", offset: -3, heightFactor: 0.45, w: 3.0, h: 2.2,
  },

  // ══════════════════════════ ROOM 6 — Fall (146 BC) ════════════════════════

  {
    id: "room-overview-r6", zone: "r6", type: "wall",
    posterImage: "./posters/room-overview-06.png",
    category: "architecture", origin: "Museum guide",
    name: "The Fall of Carthage",
    description: "Room overview: the Third Punic War and the deliberate erasure of a city.",
    context: "After a three-year siege, Roman legions burned and demolished Carthage. Survivors were enslaved, sanctuaries smashed, and the site ploughed with salt in legend — a civilisation reduced to ash and memory.",
    wall: "back", offset: 5.5, heightFactor: 0.5, w: 2.4, h: 3.5,
    poster: {
      period: "149 — 146 BC (Third Punic War)",
      rows: [
        ["Key idea", "Systematic Roman destruction of the city and its institutions."],
        ["Decisive event", "Final siege, street fighting, and seventeen days of fire."],
        ["Outcome", "Urban annihilation; population killed or enslaved; territory annexed."],
        ["Material record", "Ruined columns, shattered stelae, and scorched earth layers."],
      ],
      funFact: "Legend says the fields were sown with salt so nothing would grow again.",
    },
  },
  {
    id: "byrsa-ruins-r6", zone: "r6", type: "wall",
    category: "architecture", origin: "Punic / Roman",
    name: "Ruins of Carthage — Byrsa Hill",
    description: "A panoramic view of Byrsa Hill after 146 BC — ruins where a city of half a million once stood, erased in seventeen days of fire by the Roman legions of Scipio Aemilianus.",
    context: "The Third Punic War ended with total annihilation. Rome did not merely defeat Carthage — it erased it. 50,000 survivors were sold into slavery. The buildings were demolished stone by stone. An entire civilisation was wiped from the earth.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Carthage_ruins.jpg/1024px-Carthage_ruins.jpg",
    wall: "back", offset: 0, heightFactor: 0.45, w: 4.0, h: 2.6,
  },
  {
    id: "broken-stele-r6", zone: "r6", type: "pedestal",
    category: "religion", origin: "Punic",
    name: "Shattered Votive Stele",
    description: "A broken limestone stele, deliberately smashed during the Roman sack of 146 BC. The lower half still shows the symbol of Tanit.",
    context: "The systematic destruction of Punic religious monuments was part of Rome's campaign to erase Carthaginian identity. Despite this, thousands of stelae survived buried under rubble for millennia.",
    wall: "left", offset: -2,
  },
  {
    id: "salt-earth-r6", zone: "r6", type: "case",
    category: "daily", origin: "Roman / Punic",
    name: "Earth from Carthage",
    description: "A sealed vessel containing soil from the site of ancient Carthage — earth that legend says was salted by Rome to ensure nothing would ever grow again.",
    context: "Modern historians doubt the salting legend, but the story persists as a powerful symbol of total destruction. In reality, the fertile land of Tunisia remained highly productive under Roman rule.",
    wall: "right", offset: -2,
  },
  {
    id: "last-inscription-r6", zone: "r6", type: "wall",
    category: "daily", origin: "Punic",
    name: "Last Punic Inscription",
    description: "One of the final known inscriptions in the Punic language, dating to the 2nd century CE — proof that the language survived four centuries after Carthage's fall.",
    context: "Saint Augustine, writing in the 5th century CE, noted that rural North Africans still spoke Punic. The language may have survived into the early Islamic period — a remarkable testament to Punic resilience.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Stele_with_Tanit_symbol_from_Carthage.jpg/800px-Stele_with_Tanit_symbol_from_Carthage.jpg",
    wall: "left", offset: 3, heightFactor: 0.45, w: 2.2, h: 2.6,
  },

  // ══════════════════════════ ROOM 7 — Legacy (44 BC+) ══════════════════════

  {
    id: "room-overview-r7", zone: "r7", type: "wall",
    posterImage: "./posters/room-overview-07.png",
    category: "architecture", origin: "Museum guide",
    name: "Roman Carthage & Legacy",
    description: "Room overview: rebirth as a Roman metropolis and long cultural afterlife.",
    context: "Colonia Julia Carthago rose atop Punic foundations. Baths, theatres, and basilicas made it one of Rome's largest African cities while Punic language and memory lingered for centuries — a bridge to modern Tunisia.",
    wall: "back", offset: 5.5, heightFactor: 0.5, w: 2.4, h: 3.5,
    poster: {
      period: "After 146 BC — Roman imperial centuries (exhibit to present memory)",
      rows: [
        ["Key idea", "Urban rebirth under Rome atop the ruins of Punic Carthage."],
        ["Imperial role", "Provincial capital, economic engine, and Christian intellectual centre."],
        ["Culture", "Hybrid Punic–Roman traditions in law, language, and daily life."],
        ["Legacy today", "Archaeological parks, mosaics, and Tunisian heritage tourism."],
        ["Typical artifacts", "Roman theatres, baths, mosaics, and civic inscriptions."],
      ],
      funFact: "Roman Carthage became one of the largest cities in the western Empire.",
    },
  },
  {
    id: "roman-theatre-r7", zone: "r7", type: "wall",
    category: "architecture", origin: "Roman-Punic",
    name: "Roman Theatre of Carthage",
    description: "Ruins of the semicircular Roman theatre of Carthage, built in the 2nd century CE directly over Punic foundations — a symbol of the city's extraordinary rebirth under Rome.",
    context: "Roman Carthage became one of the largest cities in the Empire and a major centre of early Christianity, law, and philosophy. Mixing Punic and Roman traditions, it shaped North African culture for over a millennium — and its influence reaches modern Tunisia to this day.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Roman_Theatre_at_Carthage%2C_Tunisia_-_panoramio.jpg/1024px-Roman_Theatre_at_Carthage%2C_Tunisia_-_panoramio.jpg",
    wall: "front", offset: 0, heightFactor: 0.45, w: 3.5, h: 2.3,
  },
  {
    id: "antonine-baths-r7", zone: "r7", type: "wall",
    category: "architecture", origin: "Roman-Punic",
    name: "Antonine Baths — Roman Carthage",
    description: "Monumental remains of the largest Roman bath complex ever built in Africa, overlooking the Gulf of Tunis.",
    context: "Constructed under Emperor Antoninus Pius (138–161 CE), the baths covered over 3.5 hectares. The site demonstrates how Roman Carthage became the second-largest city in the western Empire.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Carthage%2C_Tunisia_-_Antonine_baths.jpg/1024px-Carthage%2C_Tunisia_-_Antonine_baths.jpg",
    wall: "left", offset: 0, heightFactor: 0.42, w: 3.4, h: 2.4,
  },
  {
    id: "neptune-mosaic-r7", zone: "r7", type: "wall",
    category: "architecture", origin: "Roman-Punic",
    name: "Triumph of Neptune — Bardo Mosaic",
    description: "Fragment of the magnificent Neptune mosaic from the Bardo National Museum, a testament to Roman Carthage's extraordinary artistic achievements.",
    context: "The Bardo National Museum in Tunis houses the world's largest collection of Roman mosaics, many originating from ancient Carthage. These artworks reveal the hybrid Punic-Roman culture that flourished after 146 BC.",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Mosaic_depicting_the_Triumph_of_Neptune_%28Bardo_National_Museum%29.jpg/1024px-Mosaic_depicting_the_Triumph_of_Neptune_%28Bardo_National_Museum%29.jpg",
    wall: "right", offset: 0, heightFactor: 0.42, w: 3.5, h: 2.5,
  },
  {
    id: "legacy-coins-r7", zone: "r7", type: "case",
    category: "trade", origin: "Roman-Punic",
    name: "Coins of Roman Carthage",
    description: "Bronze and silver coins minted at Roman Carthage, bearing images of the Emperors alongside local North African iconography.",
    context: "Roman Carthage minted its own coinage for centuries, often combining imperial imagery with local symbols — a testament to the hybrid culture that defined the city in its second, glorious life.",
    wall: "right", offset: -5,
  },
];
