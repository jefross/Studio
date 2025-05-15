
'use server';
/**
 * @fileOverview An AI agent that makes guesses in Codenames Duet.
 *
 * - generateAiGuess - A function that generates guesses for a given clue.
 * - GenerateGuessInput - The input type for the generateAiGuess function.
 * - GenerateGuessOutput - The return type for the generateAiGuess function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateGuessInputSchema = z.object({
  clueWord: z.string().describe('The clue word given by the human player.'),
  clueNumber: z.number().describe('The number associated with the clue.'),
  gridWords: z
    .array(z.string())
    .length(25)
    .describe('The 5x5 grid of words visible on the board.'),
  aiGreenWords: z
    .array(z.string())
    .describe("The words that are green (targets) for the AI player from its perspective and are not yet revealed. This is for the AI's general knowledge but not the primary target when guessing the human's clue."),
  aiAssassinWords: z
    .array(z.string())
    .describe("The words that are assassins for the AI player from its perspective and are not yet revealed. The AI must be very cautious about guessing these."),
  revealedWords: z
    .array(z.string())
    .describe("A list of words that have already been revealed on the board."),
});
export type GenerateGuessInput = z.infer<typeof GenerateGuessInputSchema>;

const GenerateGuessOutputSchema = z.object({
  guessedWords: z
    .array(z.string())
    .describe(
      'An ordered list of words (from the grid) the AI chooses to guess. Should not include already revealed words.'
    ),
  reasoning: z
    .string()
    .optional()
    .describe('The AI reasoning behind the chosen guesses or decision to pass.'),
});
export type GenerateGuessOutput = z.infer<typeof GenerateGuessOutputSchema>;

export async function generateAiGuess(
  input: GenerateGuessInput
): Promise<GenerateGuessOutput> {
  return generateAiGuessFlow(input);
}

const generateGuessPrompt = ai.definePrompt({
  name: 'generateAiGuessPrompt',
  input: {schema: GenerateGuessInputSchema},
  output: {schema: GenerateGuessOutputSchema},
  prompt: `You are an AI playing Codenames Duet. Your human partner has given you a clue.
Clue Word: {{clueWord}}
Clue Number: {{clueNumber}}

Your goal is to identify words on the board that your human partner is hinting at with their clue. The words you guess will be evaluated against *your human partner's* key card.
You can suggest up to {{clueNumber}} words if the clue number is greater than 0. If all your guesses for this clue turn out to be green for your partner, you are allowed one extra bonus guess (making it {{clueNumber}}+1 words in total for this clue). If the clue number is 0, you can guess exactly 1 word.

These are ALL the words currently on the board:
{{#each gridWords}}
  {{this}}{{#unless @last}}, {{/unless}}
{{/each}}

These words have ALREADY BEEN REVEALED and you CANNOT guess them:
{{#if revealedWords.length}}
  {{#each revealedWords}}
    {{this}}{{#unless @last}}, {{/unless}}
  {{/each}}
{{else}}
  None
{{/if}}

From YOUR PERSPECTIVE (AI player), these are your ASSASSIN words that are NOT YET REVEALED. Be extremely cautious with these words, as revealing one will end the game for your team.
{{#if aiAssassinWords.length}}
  {{#each aiAssassinWords}}
    {{this}}{{#unless @last}}, {{/unless}}
  {{/each}}
{{else}}
  None
{{/if}}
It's possible your human partner is trying to get you to guess a word that is one of their GREEN words but an ASSASSIN for you. This is a high-risk, high-reward situation. If their clue *very strongly* points to one of your assassin words, and you have few other good options, you may consider it as a very risky guess.

For your general awareness, from YOUR PERSPECTIVE (AI player), these are your GREEN (target) words that are NOT YET REVEALED:
{{#if aiGreenWords.length}}
  {{#each aiGreenWords}}
    {{this}}{{#unless @last}}, {{/unless}}
  {{/each}}
{{else}}
  None remaining
{{/if}}
Your main goal is to guess your partner's targets based on their clue. Do not prioritize guessing your own green words unless they also strongly match the clue.

Carefully analyze the clue ('{{clueWord}}' for {{clueNumber}}) and the available unrevealed words.
Choose an ordered list of words from the gridWords that you want to guess.
Your list should contain words that best match the clue your partner gave.
If a word that strongly matches the clue is an ASSASSIN from YOUR perspective (listed above), you must carefully weigh the risk. Only select it if the clue is exceptionally strong for that word and other options are weak. Prioritize safer guesses if good alternatives exist.
Do not guess any words from the 'revealedWords' list.
The number of words in your 'guessedWords' list should be between 1 and (clueNumber + 1) if clueNumber > 0, or exactly 1 if clueNumber is 0. Be strategic about the number of words you list.

Respond with the 'guessedWords' array and your 'reasoning'. If you think no words match the clue, or the risk of hitting one of YOUR assassins is too high given the options (even considering the possibility of it being a human's green word), provide an empty 'guessedWords' array and explain your reasoning for passing.
`,
});

const generateAiGuessFlow = ai.defineFlow(
  {
    name: 'generateAiGuessFlow',
    inputSchema: GenerateGuessInputSchema,
    outputSchema: GenerateGuessOutputSchema,
  },
  async (input) => {
    // Filter out revealed words from aiGreenWords and aiAssassinWords to be safe,
    // though the prompt also tells the AI to ignore revealedWords.
    const unrevealedGrid = input.gridWords.filter(w => !input.revealedWords.includes(w));
    const finalInput = {
      ...input,
      aiGreenWords: input.aiGreenWords.filter(w => unrevealedGrid.includes(w)),
      aiAssassinWords: input.aiAssassinWords.filter(w => unrevealedGrid.includes(w)),
    };

    const {output} = await generateGuessPrompt(finalInput);
    // Ensure guessedWords are from the original grid and not already revealed
    if (output && output.guessedWords) {
        output.guessedWords = output.guessedWords.filter(gw => input.gridWords.includes(gw) && !input.revealedWords.includes(gw));
    }
    return output!;
  }
);

