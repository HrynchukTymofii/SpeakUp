/**
 * Practice modes: one exercise per mode, many topics per mode. The user taps a mode and gets a
 * random topic right away; topics they already answered don't come back until they've done
 * them all. The topic is stored on the attempt (`Attempt.topic`), so the analysis knows what
 * was asked and the API knows what was already answered.
 *
 * The banks are static for now; later they can be generated (and grown) by an LLM.
 */
export const PRACTICE_MODES = ["topic", "questions", "convince", "twister"] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

/** The seeded exercise behind each mode (type, time limit, instructions). */
export const MODE_EXERCISE_SLUG: Record<PracticeMode, string> = {
  topic: "mode-topic",
  questions: "mode-questions",
  convince: "mode-convince",
  twister: "mode-twister",
};

export function modeOfExerciseSlug(slug: string): PracticeMode | undefined {
  return PRACTICE_MODES.find((mode) => MODE_EXERCISE_SLUG[mode] === slug);
}

/** Longest topic a client may send (also the DB column's practical size). */
export const MAX_TOPIC_LENGTH = 300;

export const MODE_TOPICS: Record<PracticeMode, readonly string[]> = {
  topic: [
    "Your morning routine",
    "The best meal you've ever had",
    "A skill everyone should learn",
    "Your favorite place in your city",
    "A book or film that changed your mind",
    "What you would do with a free year",
    "The best advice you ever got",
    "A habit you're proud of",
    "Your first job",
    "Why people love coffee",
    "The perfect weekend",
    "A person who inspires you",
    "Something you changed your mind about",
    "Working from home vs the office",
    "The most useful app on your phone",
    "A trip that surprised you",
    "What makes a good teacher",
    "Your dream house",
    "A small thing that makes you happy",
    "The future of cars",
    "What you'd teach a 10-year-old",
    "Your favorite season and why",
    "A mistake that taught you something",
    "Cities vs the countryside",
    "The best gift you ever gave",
    "What success means to you",
    "A sport you'd like to try",
    "Social media: good or bad?",
    "Your hidden talent",
    "The best decision you made this year",
    "A tradition in your family",
    "What you would invent",
    "Why sleep matters",
    "The most interesting person you've met",
    "Music you can't stop listening to",
    "If you could live in any decade",
    "A goal for the next five years",
    "The best part of your job",
    "How you handle stress",
    "A place you'll never forget",
  ],
  questions: [
    "A new neighbor who just moved in",
    "Someone who just came back from Japan",
    "A chef at a restaurant",
    "A founder pitching you their startup",
    "Your new manager",
    "Someone who runs marathons",
    "A pilot",
    "A friend who just changed careers",
    "A teacher on their first day",
    "Someone who lives on a boat",
    "A candidate interviewing for your team",
    "A musician after a concert",
    "A doctor",
    "Someone who has never used a smartphone",
    "A person who speaks five languages",
    "A firefighter",
    "Your grandparents' first date",
    "A farmer",
    "A game designer",
    "Someone who just won the lottery",
    "An astronaut",
    "A barista",
    "A client with a vague request",
    "A professional photographer",
    "Someone planning a wedding",
  ],
  convince: [
    "Socks are the most important clothing",
    "Every office needs a nap room",
    "Pineapple belongs on pizza",
    "Mondays are the best day of the week",
    "Everyone should learn to juggle",
    "Pigeons are underrated",
    "Board games beat video games",
    "Breakfast for dinner should be a law",
    "Umbrellas are the greatest invention",
    "Cats should run companies",
    "Rain is the best weather",
    "Paper maps are better than GPS",
    "Every house needs a slide",
    "Spoons are better than forks",
    "Waiting in line is good for you",
    "Alarm clocks should be banned",
    "Elevators should play only jazz",
    "Hats should come back in fashion",
    "Every meeting should be done standing",
    "Houseplants deserve names",
    "Cold showers are a superpower",
    "Handwritten letters will save friendships",
    "Clouds are the best free entertainment",
    "Everyone should have a theme song",
  ],
  twister: [
    "She sells seashells by the seashore.",
    "Red lorry, yellow lorry, red lorry, yellow lorry.",
    "Unique New York, unique New York, you know you need unique New York.",
    "Peter Piper picked a peck of pickled peppers.",
    "How can a clam cram in a clean cream can?",
    "Six slippery snails slid slowly seaward.",
    "Fresh fried fish, fish fresh fried, fried fish fresh.",
    "A proper copper coffee pot.",
    "Truly rural, truly rural, truly rural.",
    "Which witch switched the Swiss wristwatches?",
    "Black background, brown background.",
    "I scream, you scream, we all scream for ice cream.",
    "Eleven benevolent elephants.",
    "Toy boat, toy boat, toy boat.",
    "Greek grapes, Greek grapes, Greek grapes.",
  ],
};

/**
 * Picks a random topic among the least-used ones of the bank: unused topics first, so nothing
 * repeats until the whole bank is done; then a new round starts. `skip` (the topic the user
 * just passed on) is avoided when there is any other choice.
 */
export function pickTopic(
  bank: readonly string[],
  used: ReadonlyMap<string, number>,
  skip?: string,
  random: () => number = Math.random,
): { topic: string; done: number; total: number } {
  const count = (topic: string) => used.get(topic) ?? 0;
  const candidates = bank.length > 1 && skip ? bank.filter((t) => t !== skip) : bank;
  const fewest = Math.min(...candidates.map(count));
  const pool = candidates.filter((t) => count(t) === fewest);
  const topic = pool[Math.floor(random() * pool.length)] ?? bank[0] ?? "";
  return { topic, done: bank.filter((t) => count(t) > 0).length, total: bank.length };
}
