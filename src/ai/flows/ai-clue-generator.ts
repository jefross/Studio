// This is an AI-powered clue generator for the Codenames Duet game.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

/**
 * @fileOverview An AI agent that generates clues for Codenames Duet.
 *
 * - generateClue - A function that generates a clue.
 * - GenerateClueInput - The input type for the generateClue function.
 * - GenerateClueOutput - The return type for the generateClue function.
 */

const GenerateClueInputSchema = z.object({
  grid: z
    .array(z.string())
    .length(25)
    .describe('The 5x5 grid of words visible to the clue giver.'),
  greenWords: z
    .array(z.string())
    .describe('The words that are green for the clue receiver.'),
  assassinWords: z
    .array(z.string())
    .describe('The words that are assassins for the clue receiver.'),
  timerTokens: z.number().describe('The number of timer tokens remaining.'),
});
export type GenerateClueInput = z.infer<typeof GenerateClueInputSchema>;

const GenerateClueOutputSchema = z.object({
  clueWord: z.string().describe('The generated clue word.'),
  clueNumber: z.number().describe('The number of words the clue relates to.'),
  reasoning: z.string().optional().describe('The AI reasoning behind the clue.'),
});
export type GenerateClueOutput = z.infer<typeof GenerateClueOutputSchema>;

export async function generateClue(input: GenerateClueInput): Promise<GenerateClueOutput> {
  return generateClueFlow(input);
}

const generateCluePrompt = ai.definePrompt({
  name: 'generateCluePrompt',
  input: {schema: GenerateClueInputSchema},
  output: {schema: GenerateClueOutputSchema},
  prompt: `You are an expert Codenames Duet player. Your goal is to provide a clue that will help your partner guess the green words on their key card, while avoiding the assassin words. You are provided with the current board state, the green words, the assassin words, and the number of timer tokens remaining.

Here is the board:
{{#each grid}}
  {{this}}{{#unless @last}}, {{/unless}}
{{/each}}

Here are the green words:
{{#each greenWords}}
  {{this}}{{#unless @last}}, {{/unless}}
{{/each}}

Here are the assassin words:
{{#each assassinWords}}
  {{this}}{{#unless @last}}, {{/unless}}
{{/each}}

You have {{timerTokens}} timer tokens remaining.

Generate a clue word and a number. The clue word must not be any word visible on the table or a part of a visible compound word. The number indicates how many words on the table relate to the clue word. The clue should maximize the number of green words guessed while avoiding assassin words.

Respond with the clue word, the number, and your reasoning.`,
});

const generateClueFlow = ai.defineFlow(
  {
    name: 'generateClueFlow',
    inputSchema: GenerateClueInputSchema,
    outputSchema: GenerateClueOutputSchema,
  },
  async input => {
    const {output} = await generateCluePrompt(input);
    return output!;
  }
);
