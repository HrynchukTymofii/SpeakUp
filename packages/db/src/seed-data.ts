/**
 * Seed content (SPEC §5): the courses (a shared "basics" course + one per goal track), their
 * lessons and recorded exercises, the standalone `baseline` and funnel speaking checks, and the
 * standalone practice exercises (quick drills, "speak like a legend", challenges), and the
 * default web funnel `main`.
 *
 * Plain data, no DB access — so it can be unit-tested (seed-data.test.ts) and reviewed
 * like copy. MVP has no admin CMS; content changes = edit this file + `pnpm db:seed`.
 *
 * Lesson bodies follow one shape the app turns into lesson steps: `## Why it matters`
 * (explanation), `## Example`, `## Try this` (steps). Keep each section short — they are read
 * on a phone, one card at a time.
 *
 * Content rule: the methods are classic public-speaking practice; the wording here is our own.
 */

import {
  DEFAULT_FUNNEL_DEFINITION,
  DEFAULT_FUNNEL_NAME,
  DEFAULT_FUNNEL_REVISION,
  DEFAULT_FUNNEL_SLUG,
} from "@speakup/shared";

type ExerciseType = "read_aloud" | "free_speech";

export interface SeedExercise {
  slug: string;
  type: ExerciseType;
  prompt: string;
  referenceText?: string; // required for read_aloud
  maxDurationSec: number;
  order: number;
}

export interface SeedLesson {
  slug: string;
  title: string;
  order: number;
  isFree: boolean;
  body: string; // markdown
  exercises: SeedExercise[];
}

export interface SeedCourse {
  slug: string;
  title: string;
  summary: string;
  order: number;
  lessons: SeedLesson[];
}

/** Baseline: ~70 words, max 45 s (the funnel's anonymous-recording cap, SPEC §9). */
export const baselineExercise: SeedExercise = {
  slug: "baseline",
  type: "read_aloud",
  prompt: "Read this paragraph out loud at your natural pace.",
  referenceText:
    "Good communication is a skill, not a talent. When we speak clearly, we slow down, " +
    "we pause between ideas, and we choose simple words. Our listeners stay with us because " +
    "they never have to guess what we mean. Today I am reading this short paragraph out loud, " +
    "so I can hear my own voice. Next week, I will read it again and notice how much my " +
    "speaking has changed.",
  maxDurationSec: 45,
  order: 0,
};

/**
 * The funnel's speaking check, one per goal (`check-<goal>`, see `speakingCheckSlug` in
 * packages/shared). Impromptu on purpose: reading a text aloud is easy and hides the real
 * problems; answering without a script shows hesitations, fillers, a flat voice, rambling.
 * Max 45 s (the anonymous-recording cap, SPEC §9).
 */
const check = (goal: string, prompt: string): SeedExercise => ({
  slug: `check-${goal}`,
  type: "free_speech",
  prompt,
  maxDurationSec: 45,
  order: 0,
});

export const speakingChecks: SeedExercise[] = [
  check(
    "general",
    "Tell me about yourself: who you are, what you do, and one thing you’re proud of. About 30 seconds.",
  ),
  check(
    "job-interviews",
    "The interviewer says: “So, tell me about yourself.” Answer as you would in a real interview. About 30 seconds.",
  ),
  check(
    "pitching",
    "You have 30 seconds with an investor. Pitch something you’re working on — or an idea you believe in: the problem, your solution, and what you’re asking for.",
  ),
  check(
    "presentations",
    "Open a talk: in about 30 seconds, tell the audience what you’ll talk about and why it matters to them. Pick any topic you know well.",
  ),
  check(
    "meetings",
    "Your manager asks for a quick update in a meeting. In about 30 seconds: what you’re working on, how it’s going, and what you need.",
  ),
  check(
    "conversations",
    "You just met someone at a friend’s party and they ask: “So, what’s your story?” Answer naturally. About 30 seconds.",
  ),
  check(
    "clarity",
    "Describe your typical day, from morning to evening, so a stranger could picture it. About 30 seconds.",
  ),
];

// ---------------------------------------------------------------------------------------------
// Helpers: keep the content below readable.

/**
 * Joins lesson lines into markdown. Markdown merges consecutive lines into one paragraph, so a
 * prose line directly followed by another ("Vague: …" / "Sharp: …") gets a blank line between;
 * list items (`- …`) stay together as one list.
 */
const md = (...lines: string[]) =>
  lines.reduce((out, line, i) => {
    if (i === 0) return line;
    const prev = lines[i - 1] ?? "";
    const bothProse = prev !== "" && line !== "" && !line.startsWith("- ");
    return out + (bothProse ? "\n\n" : "\n") + line;
  }, "");

const read = (
  slug: string,
  order: number,
  prompt: string,
  referenceText: string,
  maxDurationSec = 60,
): SeedExercise => ({ slug, type: "read_aloud", prompt, referenceText, maxDurationSec, order });

const speak = (slug: string, order: number, prompt: string, maxDurationSec = 60): SeedExercise => ({
  slug,
  type: "free_speech",
  prompt,
  maxDurationSec,
  order,
});

// ---------------------------------------------------------------------------------------------
// Course 1 — Speaking basics (everyone). Each lesson fixes one problem the analysis measures.

const basics: SeedCourse = {
  // Slug kept from the first course: existing attempts and links point at it.
  slug: "speak-with-confidence",
  title: "Speaking basics",
  summary:
    "The delivery habits every speaker needs: warm voice, calm pace, real pauses, stressed key words, strong endings, no filler.",
  order: 1,
  lessons: [
    {
      slug: "warm-up-your-voice",
      title: "Warm up your voice",
      order: 1,
      isFree: true,
      body: md(
        "## Why it matters",
        "",
        "A cold voice sounds flat and a little mumbled. Two minutes of warm-up wakes up your breath, lips and tongue, so your very first sentence already sounds like you on a good day.",
        "",
        "## Example",
        "",
        "Before a video call, Maya stands up, hums from her lowest note to her highest three times, then reads one tongue twister slowly, fast, and slowly again. Her first “Hi everyone” comes out clear and warm instead of croaky.",
        "",
        "## Try this",
        "",
        "- Stand tall, drop your shoulders, breathe low into your belly.",
        "- Hum “mmm” from low to high, three times. Feel the buzz in your lips.",
        "- Over-articulate: move your lips and jaw more than feels normal.",
        "- Read a tongue twister slow → fast → slow. Every sound stays clear.",
      ),
      exercises: [
        read(
          "warm-up-twisters",
          1,
          "Read this three times in one take: slowly, then fast, then slowly again. Keep every sound crisp.",
          "Red lorry, yellow lorry. A proper copper coffee pot. Unique New York, you know you need unique New York.",
          60,
        ),
        read(
          "warm-up-announcer",
          2,
          "Read it like a radio announcer: big energy, wide mouth, hit every word in capitals.",
          "Good morning, everyone! The doors are OPEN, the coffee is HOT, and the best part of the day starts RIGHT NOW. Take a seat, take a breath, and let’s BEGIN.",
          45,
        ),
      ],
    },
    {
      slug: "find-your-pace",
      title: "Find your pace",
      order: 2,
      isFree: true,
      body: md(
        "## Why it matters",
        "",
        "Nerves make us speed up. Fast speech is hard to follow and sounds less sure of itself. A comfortable conversational range is roughly **130–160 words per minute**.",
        "",
        "## Example",
        "",
        "Rushed: “Thanks-for-joining-I-have-three-updates-first-we’re-on-schedule…”",
        "Calm: “Thanks for joining. I have three updates. First — we’re on schedule.”",
        "Same words. The second one sounds like the speaker is in charge.",
        "",
        "## Try this",
        "",
        "- Breathe out before your first word.",
        "- Finish each sentence fully before starting the next.",
        "- Slightly stretch the important words.",
      ),
      exercises: [
        read(
          "find-your-pace-read",
          1,
          "Read this out loud. Aim for a calm, steady pace.",
          "Thank you all for joining today. I want to share three quick updates. First, the " +
            "project is on schedule. Second, we found a simpler way to test our ideas with real " +
            "customers. Third, we need two volunteers to help with next week's demo. I will " +
            "explain each point, and then we can take your questions.",
        ),
        speak(
          "find-your-pace-intro",
          2,
          "Introduce yourself as if you were at the start of a job interview. Keep it to about 45 seconds.",
        ),
      ],
    },
    {
      slug: "power-of-the-pause",
      title: "The power of the pause",
      order: 3,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "A pause is not a mistake. It gives listeners a moment to take in what you said, gives you time to think, and makes the next words land harder. Pause at every full stop, and briefly at commas.",
        "",
        "## Example",
        "",
        "“Here is the problem. (pause) Customers love the product. (pause) But most of them never finish setting it up.”",
        "The pauses turn three sentences into three ideas.",
        "",
        "## Try this",
        "",
        "- Full stop = a full beat of silence. Comma = a short breath.",
        "- Pause *before* your most important point, not after it.",
        "- Look at your listener during the pause — wait for a nod.",
      ),
      exercises: [
        read(
          "power-of-the-pause-read",
          1,
          "Read this out loud. Take a clear pause at each full stop.",
          "Here is the problem. Our customers love the product, but many of them never finish " +
            "setting it up. Why does that happen? Because the first step asks for too much. So " +
            "here is my proposal. We cut the first step in half, and we measure what changes.",
        ),
        speak(
          "power-of-the-pause-answer",
          2,
          "What is one thing you would change about the city you live in? Answer in short sentences and take a full beat of silence after each one.",
          45,
        ),
      ],
    },
    {
      slug: "cut-the-filler",
      title: "Silence beats “um”",
      order: 4,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "“Um”, “uh”, “like” and “you know” fill silence while we think. A few are normal; many make a speaker sound unsure, even when they know the topic well. The fix is simple: replace the sound with silence.",
        "",
        "## Example",
        "",
        "With fillers: “So, um, the main thing is, like, we need more, uh, time.”",
        "With silence: “The main thing is… we need more time.”",
        "The silent version sounds thoughtful, not lost.",
        "",
        "## Try this",
        "",
        "- Notice your favourite filler — awareness alone reduces it.",
        "- When you feel one coming, close your mouth and pause instead.",
        "- Plan your first and last sentence; the middle gets easier.",
      ),
      exercises: [
        speak(
          "cut-the-filler-explain",
          1,
          "Explain what you do at work (or study) to a friend who knows nothing about it. About 60 seconds.",
          75,
        ),
        speak(
          "cut-the-filler-opinion",
          2,
          "Give your opinion on this question and one reason for it: is it better to work from home or from an office? About 45 seconds.",
        ),
      ],
    },
    {
      slug: "hit-the-key-word",
      title: "Hit the key word",
      order: 5,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "When every word gets the same weight, the voice goes flat and listeners stop hearing what matters. In every phrase, one word carries the meaning. Make it stand out: a touch louder, a little higher, or a tiny pause just before it.",
        "",
        "## Example",
        "",
        "“I didn’t say she *stole* the money.” → maybe she borrowed it.",
        "“I didn’t say *she* stole the money.” → someone else did.",
        "Same sentence, different meaning — only the stressed word changed.",
        "",
        "## Try this",
        "",
        "- Use short phrases: 1–7 words each.",
        "- Pick one key word per phrase and give it weight.",
        "- Mix it up: sometimes louder, sometimes slower, sometimes a pause before it.",
      ),
      exercises: [
        read(
          "hit-the-key-word-meaning",
          1,
          "Read each sentence and stress the word in capitals. Hear how the meaning changes.",
          "I didn't say she STOLE the money. I didn't say SHE stole the money. I didn't say she stole the MONEY.",
          45,
        ),
        read(
          "hit-the-key-word-short",
          2,
          "Short phrases, one key word each. Give the key word weight and pause after every full stop.",
          "We tested it. Twice. It works. Not most of the time. Every time. And that changes everything for our customers.",
          45,
        ),
        speak(
          "hit-the-key-word-meal",
          3,
          "Describe the best meal you have ever had. In every sentence, pick one word and hit it hard.",
        ),
      ],
    },
    {
      slug: "change-the-pace",
      title: "Slow down, speed up",
      order: 6,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "A steady, unchanging speed is like a song with one note. Slowing down signals “this matters”; speeding up adds energy. Changing pace on purpose keeps people listening — and stops you from talking for too long without a breath.",
        "",
        "## Example",
        "",
        "“Here is the secret. (slow) We wake up, check email, rush to meetings, eat at our desks, rush home (fast) … but one quiet hour (slow again) can change your week.”",
        "",
        "## Try this",
        "",
        "- To grab attention: slow down, separate words, leave big pauses.",
        "- To add energy: speed up and use longer phrases.",
        "- Never speak more than ~12 seconds without a pause.",
      ),
      exercises: [
        read(
          "change-the-pace-read",
          1,
          "Read the first two sentences slowly, the long list fast, and the last sentence slowly again.",
          "Here is the secret. Are you ready? We wake up early, we answer emails, we sit in meetings, we eat at our desks, we rush home, and we do it all again tomorrow. But one quiet hour, just one, can change your whole week.",
          60,
        ),
        speak(
          "change-the-pace-story",
          2,
          "Tell a short story about a time you were late for something. Speed up when things go wrong, then slow right down for the ending.",
          75,
        ),
      ],
    },
    {
      slug: "finish-strong",
      title: "Finish strong",
      order: 7,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "Many speakers start a sentence strong and let it fade, so the last words — often the important ones — get lost. Keep your voice up until the very last word, then stop cleanly.",
        "",
        "## Example",
        "",
        "Fading: “We will launch on Friday…” (Friday is a mumble)",
        "Strong: “We will launch on *Friday*.” (full voice, full stop, silence)",
        "",
        "## Try this",
        "",
        "- Take a breath before a sentence so you have air for its end.",
        "- Aim your voice at the last word, as if throwing it to the back row.",
        "- End with a full stop in your voice: down in pitch, not in volume.",
      ),
      exercises: [
        read(
          "finish-strong-read",
          1,
          "Keep your voice up to the very last word of every sentence. Land each ending like a full stop, not a fade.",
          "The plan is simple. We start on Monday. Everyone gets one clear task. By Friday, we will know if it works.",
          45,
        ),
        speak(
          "finish-strong-reasons",
          2,
          "Give three reasons why everyone should learn to cook. End each reason on a strong, final word.",
        ),
      ],
    },
    {
      slug: "say-it-like-you-mean-it",
      title: "Say it like you mean it",
      order: 8,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "“I think”, “kind of”, “maybe”, “I guess”, “sort of”, “just” — these soften every claim until nothing sounds certain. Listeners trust speakers who commit. Your voice, posture and words should all say the same thing: I mean this.",
        "",
        "## Example",
        "",
        "Hedged: “I think maybe we could kind of try a new supplier?”",
        "Committed: “Let’s try a new supplier. Here’s why.”",
        "",
        "## Try this",
        "",
        "- Delete “I think” — if you say it, you obviously think it.",
        "- Replace “maybe we could” with “let’s”.",
        "- End statements going down in pitch, not up like a question.",
      ),
      exercises: [
        speak(
          "say-it-recommend",
          1,
          "Recommend a film, book or show to a friend. No “I think”, no “maybe” — say it like a fact.",
          45,
        ),
        speak(
          "say-it-decide",
          2,
          "Your team must choose between a trip to the mountains or to the sea. Pick one and defend it with full conviction.",
        ),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Course 2 — Be interesting in conversation.

const conversation: SeedCourse = {
  slug: "be-interesting",
  title: "Be interesting in conversation",
  summary:
    "Have a story ready, listen for what’s behind the words, and answer in a way that makes people lean in.",
  order: 2,
  lessons: [
    {
      slug: "your-story",
      title: "Build your story",
      order: 1,
      isFree: true,
      body: md(
        "## Why it matters",
        "",
        "People forget facts and remember stories. One short personal story you know by heart is the best tool you can bring to any conversation, interview or first date. It has to be *yours* — written by you, in your words.",
        "",
        "## Example",
        "",
        "“Last year I got lost in Lisbon at midnight with a dead phone. A baker who was just opening up drew me a map on a paper bag. I still have that bag — it reminds me that asking for help is a superpower.”",
        "Hook, what happened, why it matters. Under 30 seconds.",
        "",
        "## Try this",
        "",
        "- Write it yourself: a hook, what happened, why it matters to you.",
        "- Keep it under 60 seconds; cut every detail that isn’t needed.",
        "- Tell it out loud every day for a week — then use it for real.",
      ),
      exercises: [
        speak(
          "your-story-first-telling",
          1,
          "Tell your story out loud for the first time. Hook in the first sentence, end with why it matters to you.",
          90,
        ),
        speak(
          "your-story-short",
          2,
          "Tell the same story again — this time in 30 seconds. Keep the hook and the ending, cut the rest.",
          45,
        ),
      ],
    },
    {
      slug: "listen-and-guess",
      title: "Listen, then make a bold guess",
      order: 2,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "Questions keep a conversation alive, but they rarely make it memorable. A playful, kind guess about the other person shows you really listened and thought about *them*. People love being figured out — and love correcting a wrong guess even more.",
        "",
        "## Example",
        "",
        "They say: “I’m at the gym at six every morning.”",
        "Plain: “Oh nice, which gym?”",
        "Bold: “So you’re one of those people who has their whole life sorted before breakfast?”",
        "",
        "## Try this",
        "",
        "- Listen for the detail behind the words: a reason, a trait, a secret.",
        "- Say your guess as a statement, not a question.",
        "- Keep it light and kind — then let them correct you.",
      ),
      exercises: [
        speak(
          "listen-guess-japan",
          1,
          "They say: “I just got back from three weeks in Japan.” Reply with a bold, friendly guess about them — not a question.",
          30,
        ),
        speak(
          "listen-guess-quit",
          2,
          "They say: “I quit my job last month.” Reply with a bold, friendly guess about why — not a question.",
          30,
        ),
        speak(
          "listen-guess-dancing",
          3,
          "They say: “I go dancing every weekend.” Reply with a bold, friendly guess about who they are.",
          30,
        ),
      ],
    },
    {
      slug: "keep-it-going",
      title: "Keep the conversation going",
      order: 3,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "Short answers end conversations. Long monologues end them too. The sweet spot: answer, add one detail that invites a follow-up, then hand the conversation back.",
        "",
        "## Example",
        "",
        "“What do you do?” → “I design hospital signs — the ones that stop you getting lost at 3 a.m. Weirdly, I’ve become obsessed with arrows. What about you?”",
        "",
        "## Try this",
        "",
        "- Answer in one sentence.",
        "- Add one surprising or personal detail — a hook for their next question.",
        "- Hand it back: a question or a guess about them.",
      ),
      exercises: [
        speak(
          "keep-it-going-job",
          1,
          "They ask: “So what do you do?” Answer in three sentences: what you do, one surprising detail, then hand the conversation back.",
          45,
        ),
        speak(
          "keep-it-going-weekend",
          2,
          "They ask: “How was your weekend?” Tell one small moment well, then hand it back with a question.",
          45,
        ),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Course 3 — Pitch preparation.

const pitching: SeedCourse = {
  slug: "pitch-prep",
  title: "Pitch preparation",
  summary: "From one sharp sentence to a 30-second pitch with a clear ask.",
  order: 3,
  lessons: [
    {
      slug: "problem-in-one-sentence",
      title: "The problem in one sentence",
      order: 1,
      isFree: true,
      body: md(
        "## Why it matters",
        "",
        "If you can’t say the problem in one sentence, nobody will remember it. Investors hear dozens of pitches a week; the ones that stick name a painful problem in plain words.",
        "",
        "## Example",
        "",
        "Vague: “We leverage data to optimise bakery operations.”",
        "Sharp: “Small cafés throw away a fifth of their pastries every day because they guess how much to bake.”",
        "",
        "## Try this",
        "",
        "- Say who has the problem and what it costs them.",
        "- No jargon: would your grandmother understand it?",
        "- Add one number that makes it hurt.",
      ),
      exercises: [
        speak(
          "problem-sentence-first",
          1,
          "Say the problem your idea solves (or an idea you love) in one sentence. Then stop.",
          20,
        ),
        speak(
          "problem-sentence-number",
          2,
          "Say the same problem again — this time with one number that makes it hurt.",
          30,
        ),
      ],
    },
    {
      slug: "thirty-second-pitch",
      title: "The 30-second pitch",
      order: 2,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "Thirty seconds is often all you get — in a lift, at an event, at the start of a meeting. A clear shape makes it easy to say and easy to remember: problem → solution → proof → ask.",
        "",
        "## Example",
        "",
        "“Cafés throw away a fifth of their pastries every day. We built an app that tells them exactly how much to bake, from their own sales and the weather. Twelve cafés use it; waste dropped by a third. We’re raising €200k to reach a hundred cafés — can I send you the deck?”",
        "",
        "## Try this",
        "",
        "- One sentence each: problem, solution, proof.",
        "- Proof = a number, a customer, a result.",
        "- Always end with a clear ask.",
      ),
      exercises: [
        speak(
          "pitch-thirty",
          1,
          "Pitch your idea (or one you love) in 30 seconds: problem, solution, one proof, and the ask.",
          45,
        ),
        speak(
          "pitch-thirty-question",
          2,
          "Same pitch, but open with a question to the investor that makes them feel the problem.",
          45,
        ),
      ],
    },
    {
      slug: "convince-me",
      title: "Convince me it matters",
      order: 3,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "Persuasion is a muscle, and you can train it on anything. If you can make socks sound important, your own product will be easy. The trick is the same: raise the stakes, make it about the listener, ask for action.",
        "",
        "## Example",
        "",
        "“Think about the last time you were truly cold. Where did it start? Your feet. Socks are the first line of defence of a body that loses heat from the ground up. Tonight, throw out every sock with a hole — your future self will thank you.”",
        "",
        "## Try this",
        "",
        "- Start with the listener’s experience (“Think about the last time…”).",
        "- Raise the stakes: why does it matter more than they think?",
        "- End with one thing they should do today.",
      ),
      exercises: [
        speak(
          "convince-socks",
          1,
          "Convince me that socks are the most important invention in history.",
          45,
        ),
        speak(
          "convince-houseplant",
          2,
          "Convince me that everyone should own a houseplant. End with something I should do today.",
          45,
        ),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Course 4 — Presentation preparation.

const presentations: SeedCourse = {
  slug: "presentation-prep",
  title: "Presentation preparation",
  summary: "Open with attention, build one idea on three points, close with a call to action.",
  order: 4,
  lessons: [
    {
      slug: "demand-attention",
      title: "Demand attention",
      order: 1,
      isFree: true,
      body: md(
        "## Why it matters",
        "",
        "Attention is highest in the first ten seconds and drops from there. Don’t waste it on “Hi, my name is… today I’ll talk about…”. Pause, look at the room, and open with something about *them*.",
        "",
        "## Example",
        "",
        "Weak: “Hi, I’m Anna, and today I’ll talk about sleep.”",
        "Strong: “(pause, look around) How many hours did you sleep last night? (pause) If it’s under seven — this talk is about you.”",
        "",
        "## Try this",
        "",
        "- Silence and eye contact before your first word.",
        "- Open with a question, a surprising fact or a tiny story.",
        "- Say “you” more than “I”.",
      ),
      exercises: [
        speak(
          "attention-saving",
          1,
          "Open a talk about saving money. Your first sentence must be a question or a surprise for the audience.",
          30,
        ),
        speak(
          "attention-your-job",
          2,
          "Open a talk about your job so the audience feels it’s about them, not you.",
          30,
        ),
      ],
    },
    {
      slug: "one-idea-three-points",
      title: "One idea, three points",
      order: 2,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "Audiences remember one idea, not ten. Plan backwards: what should people *do* after your talk? What single idea gets them there? Which three points prove it?",
        "",
        "## Example",
        "",
        "Goal: people take the stairs. Idea: the stairs are the easiest workout you already have. Points: 1) two minutes a day adds up, 2) no gym, no cost, 3) you arrive with more energy. Then an opening and a closing.",
        "",
        "## Try this",
        "",
        "- Write the goal and the one idea before anything else.",
        "- Three points, each with an example or a story.",
        "- Say “first”, “second”, “third” out loud — it helps people follow.",
      ),
      exercises: [
        speak(
          "three-points-language",
          1,
          "Give a 1-minute talk: “Why everyone should learn a second language.” One main idea, three points, one example each.",
          90,
        ),
        speak(
          "three-points-own",
          2,
          "Give a 1-minute talk on a topic you know well, with the same structure. Say “first”, “second”, “third” out loud.",
          90,
        ),
      ],
    },
    {
      slug: "call-to-action",
      title: "End with a call to action",
      order: 3,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "“So… yeah, that’s it” wastes the moment people remember best: the end. A strong close sums up in one sentence and asks for one concrete action.",
        "",
        "## Example",
        "",
        "“So: seven hours of sleep makes you sharper, kinder and healthier. Tonight, put your phone in another room at ten. Try it for a week — and tell me what changed.”",
        "",
        "## Try this",
        "",
        "- Sum up the main idea in one sentence.",
        "- Ask for one specific action, with a time: tonight, this week, after this talk.",
        "- Finish with a strong last word, then silence. No “that’s it”.",
      ),
      exercises: [
        speak(
          "cta-sleep",
          1,
          "Close a talk about sleep: sum it up in one sentence, then ask the audience to do one specific thing tonight.",
          45,
        ),
        speak(
          "cta-hobby",
          2,
          "Close a talk about your favourite hobby with a one-sentence summary and a clear call to action.",
          45,
        ),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Course 5 — Job interviews.

const interviews: SeedCourse = {
  slug: "job-interviews",
  title: "Job interviews",
  summary: "Answer the classic questions with structure, proof and calm confidence.",
  order: 5,
  lessons: [
    {
      slug: "tell-me-about-yourself",
      title: "“Tell me about yourself”",
      order: 1,
      isFree: true,
      body: md(
        "## Why it matters",
        "",
        "It’s the first question in almost every interview, and it sets the tone. It is not your life story — it’s a 60-second trailer that ends with why you’re in this room.",
        "",
        "## Example",
        "",
        "“I’m a support lead at a travel startup, where I run a team of six. Before that I spent three years on the phones myself, so I know what a bad day feels like. Next, I want to build support from scratch — which is exactly what this role is.”",
        "",
        "## Try this",
        "",
        "- Now: what you do today, in one sentence.",
        "- Before: one experience that proves you’re good at it.",
        "- Next: why this role is the logical next step.",
      ),
      exercises: [
        speak(
          "about-yourself-now",
          1,
          "The interviewer says: “Tell me about yourself.” Answer in about 60 seconds: now, before, next.",
          75,
        ),
        speak(
          "about-yourself-switch",
          2,
          "Same question, but for a dream job in a different field from your current one. Connect the dots for them.",
          75,
        ),
      ],
    },
    {
      slug: "why-hire-you",
      title: "“Why should we hire you?”",
      order: 2,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "Everyone says they’re hard-working. Claims are cheap; proof is memorable. Give one strength, prove it with a short story and a number, then say what it means for *them*.",
        "",
        "## Example",
        "",
        "“I fix messy processes. At my last job, refunds took nine days; I rebuilt the flow and got it to two. You mentioned onboarding is slow — I’d start there.”",
        "",
        "## Try this",
        "",
        "- One strength, not five.",
        "- Proof: a situation, what you did, the result (with a number).",
        "- Link it to their needs. No hedging — you mean it.",
      ),
      exercises: [
        speak(
          "hire-you-strength",
          1,
          "“Why should we hire you?” Give one strength and prove it with a short story and a result.",
        ),
        speak(
          "hire-you-weakness",
          2,
          "“What’s your biggest weakness?” Name a real one, show what you do about it — without hedging.",
        ),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Course 6 — Meetings and updates.

const meetings: SeedCourse = {
  slug: "meetings",
  title: "Meetings and updates",
  summary: "Short, clear updates and proposals that get a decision.",
  order: 6,
  lessons: [
    {
      slug: "status-update",
      title: "The 30-second update",
      order: 1,
      isFree: true,
      body: md(
        "## Why it matters",
        "",
        "Rambling updates make meetings long and make you look unsure. A fixed shape — done, next, need — makes you the person everyone wants to hear from.",
        "",
        "## Example",
        "",
        "“Done: the new pricing page is live. Next: I’m testing two headlines this week. Need: ten minutes with design on Thursday.”",
        "",
        "## Try this",
        "",
        "- Done: one result, not a list of tasks.",
        "- Next: what happens this week.",
        "- Need: one clear ask, or “nothing — all good”.",
      ),
      exercises: [
        speak(
          "update-normal",
          1,
          "Give a 30-second update on what you’re working on: done, next, need.",
          45,
        ),
        speak(
          "update-late",
          2,
          "Your project is two weeks late. Give the update honestly and calmly, with a clear next step.",
          45,
        ),
      ],
    },
    {
      slug: "propose-an-idea",
      title: "Propose an idea",
      order: 2,
      isFree: false,
      body: md(
        "## Why it matters",
        "",
        "Good ideas die in meetings when they come out as a vague “maybe we could…”. A proposal with a shape — problem, idea, why it works, ask — gets a decision.",
        "",
        "## Example",
        "",
        "“Our Monday meeting runs ninety minutes and half of it is status. I propose we share status in writing on Friday and keep Monday to thirty minutes for decisions. Two teams already do this. Can we try it for a month?”",
        "",
        "## Try this",
        "",
        "- Problem first, so people want a solution.",
        "- One idea, said plainly — no “just” or “maybe”.",
        "- Make the ask small and specific: “try it for a month”.",
      ),
      exercises: [
        speak(
          "propose-four-day",
          1,
          "Propose a four-day work week to your manager: problem, idea, why it works, the ask.",
        ),
        speak(
          "propose-disagree",
          2,
          "A colleague wants to cancel the team offsite. Disagree politely: acknowledge their point, give your concern, offer an alternative.",
        ),
      ],
    },
  ],
};

export const courses: SeedCourse[] = [
  basics,
  conversation,
  pitching,
  presentations,
  interviews,
  meetings,
];

// ---------------------------------------------------------------------------------------------
// Standalone practice exercises (no lesson, open to every plan).
//
// Practice modes: ONE exercise per mode. The topic comes from the bank in @speakup/shared
// (`MODE_TOPICS`) and is stored on the attempt, so adding topics needs no new rows.
// Older per-topic drills (`drill-*`) and the first legends stay in existing databases (attempts
// reference them; the seed never deletes) but are no longer shown.

export const practiceExercises: SeedExercise[] = [
  speak(
    "mode-topic",
    1,
    "One-minute topic: talk about the topic for a full minute. No preparation, just start.",
    75,
  ),
  speak(
    "mode-questions",
    2,
    "Question storm: ask as many questions as you can about the topic in 45 seconds. Don’t answer them.",
    45,
  ),
  speak(
    "mode-convince",
    3,
    "Convince me: argue that the claim is true and that it matters, as persuasively as you can.",
    60,
  ),
  read(
    "mode-twister",
    4,
    "Tongue twister: say it three times in one take, clearly first, then faster.",
    // Replaced by the twister the user got (the attempt's topic); kept for the rule
    // "every read-aloud has reference text".
    "She sells seashells by the seashore.",
    30,
  ),
  speak(
    "challenge-your-story",
    40,
    "7-day story challenge: tell your story, the one you wrote yourself. Same story, every day, a little better each time.",
    90,
  ),
  // Speak like a legend: watch the opening of a famous talk (the video plays in the app), then
  // repeat it in your own voice. No transcripts here: the talks are copyrighted.
  speak(
    "legend-jobs-stanford",
    50,
    "Speak like Steve Jobs (Stanford, 2005): repeat his opening as closely as you can. Short sentences, calm pace, a real pause between ideas.",
    90,
  ),
  speak(
    "legend-sinek-why",
    51,
    "Speak like Simon Sinek (TED): repeat his opening. Start with the question, slow down on the key idea.",
    90,
  ),
  speak(
    "legend-hale-pitch",
    52,
    "Pitch like Y Combinator teaches (Kevin Hale): say what your idea does in one clear sentence, then who it’s for and why now.",
    90,
  ),
  speak(
    "legend-brown-story",
    53,
    "Speak like Brené Brown (TED): open with a short, honest story about yourself, with a bit of humor, that leads to your point.",
    90,
  ),
];

/**
 * The default web funnel (/f/main). Its definition is the copy apps/web bundles for /start, so
 * both start out identical. Seeded create-only: once the row exists a re-seed never overwrites
 * it, so a funnel edited in the database is not reset.
 */
export const defaultFunnel = {
  slug: DEFAULT_FUNNEL_SLUG,
  name: DEFAULT_FUNNEL_NAME,
  status: "live",
  version: DEFAULT_FUNNEL_REVISION,
  definition: DEFAULT_FUNNEL_DEFINITION,
} as const;
