
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
    .describe("The words that are green (targets) for the AI player from its perspective and are not yet revealed."),
  aiAssassinWords: z
    .array(z.string())
    .describe("The words that are assassins for the AI player from its perspective and are not yet revealed."),
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

Your goal is to guess words on the board that match this clue.
You can guess up to {{clueNumber}} words if they are your green words. If {{clueNumber}} is 0, you can guess 1 word. If {{clueNumber}} is greater than 0, you can make one extra guess (total {{clueNumber}}+1 guesses) if all previous guesses for this clue were green words for you.

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

From YOUR PERSPECTIVE, these are your TARGET (GREEN) words that are NOT YET REVEALED (you want to guess these if they match the clue):
{{#if aiGreenWords.length}}
  {{#each aiGreenWords}}
    {{this}}{{#unless @last}}, {{/unless}}
  {{/each}}
{{else}}
  None remaining
{{/if}}

From YOUR PERSPECTIVE, these are ASSASSIN words that are NOT YET REVEALED (you MUST AVOID guessing these):
{{#if aiAssassinWords.length}}
  {{#each aiAssassinWords}}
    {{this}}{{#unless @last}}, {{/unless}}
  {{/each}}
{{else}}
  None
{{/if}}

Carefully analyze the clue ('{{clueWord}}' for {{clueNumber}}) and the available unrevealed words.
Choose an ordered list of words from the gridWords that you want to guess.
Your list should contain words that best match the clue.
Prioritize guessing your green words.
ABSOLUTELY AVOID your assassin words.
Do not guess any words from the 'revealedWords' list.
The number of words in your 'guessedWords' list should be between 1 and (clueNumber + 1) if clueNumber > 0, or exactly 1 if clueNumber is 0. Be strategic about the number of words.

Respond with the 'guessedWords' array and your 'reasoning'. If you think no words match or you decide to pass, provide an empty 'guessedWords' array and explain your reasoning for passing.
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
