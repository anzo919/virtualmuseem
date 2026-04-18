/**
 * Central quiz data keyed by destination room id (the era beyond each locked passage).
 * Aligns with PASSAGES: p1_2 → r2, p2_3 → r3, … p6_7 → r7.
 */

import { ROOMS } from "./config.js";

/** @typedef {{ question: string, options: [string, string, string], answer: number }} MiniGameEntry */

/** @type {Record<string, MiniGameEntry>} */
export const MINI_GAMES = {
  r2: {
    question: "In its rise as a commercial power, what chiefly drove Carthage’s early wealth?",
    options: ["Mediterranean trade and fleets", "Industrial coal exports", "Roman subsidies"],
    answer: 0,
  },
  r3: {
    question: "Which island became the main theatre of wars between Carthage and Greek colonies?",
    options: ["Sicily", "Iceland", "Ireland"],
    answer: 0,
  },
  r4: {
    question: "At its height, about how many people lived in Carthage (order of magnitude)?",
    options: ["Roughly half a million", "About five thousand", "Under one hundred"],
    answer: 0,
  },
  r5: {
    question: "Which Carthaginian general famously crossed the Alps with war elephants?",
    options: ["Hannibal Barca", "Scipio Africanus", "Julius Caesar"],
    answer: 0,
  },
  r6: {
    question: "Which Roman senator ended speeches with “Carthago delenda est” (Carthage must be destroyed)?",
    options: ["Cato the Elder", "Cicero", "Augustus"],
    answer: 0,
  },
  r7: {
    question: "After 146 BC, how did Roman rule reshape the site of Carthage?",
    options: ["Rome rebuilt it as a major colonial city", "It remained abandoned forever", "It became a Viking port"],
    answer: 0,
  },
};

/**
 * @param {string} roomId
 * @returns {{ title: string, eraLine: string, entry: MiniGameEntry } | null}
 */
export function getMiniGameForRoom(roomId) {
  const entry = MINI_GAMES[roomId];
  const room = ROOMS[roomId];
  if (!entry || !room) return null;
  const title = room.name;
  const eraLine = `${room.year} — ${room.subtitle}`;
  return { title, eraLine, entry };
}
