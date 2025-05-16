// This is an AI-powered clue generator for the Codenames Duet game.

'use server';

import {getAI, ai} from '@/ai/genkit';
import {z} from 'genkit';
import { WordTheme } from '@/lib/words';

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
  theme: z
    .enum(['standard', 'simpsons', 'marvel', 'harry-potter', 'disney', 'video-games', 'star-wars'])
    .describe('The theme of the word set being used in the game.')
});
export type GenerateClueInput = z.infer<typeof GenerateClueInputSchema>;

const GenerateClueOutputSchema = z.object({
  clueWord: z.string().describe('The generated clue word.'),
  clueNumber: z.number().describe('The number of words the clue relates to.'),
  reasoning: z.string().optional().describe('The AI reasoning behind the clue.'),
});
export type GenerateClueOutput = z.infer<typeof GenerateClueOutputSchema>;

export async function generateClue(input: GenerateClueInput): Promise<GenerateClueOutput> {
  try {
    // Get the AI instance with the current API key
    const aiInstance = getAI();
    return generateClueFlow(input, aiInstance);
  } catch (error: any) {
    console.error('Error generating clue:', error);
    
    // If the error is about missing API key, pass it through
    if (error.message?.includes('API key')) {
      throw error;
    }
    
    // Otherwise provide a fallback response
    return {
      clueWord: "ERROR",
      clueNumber: 0,
      reasoning: `Failed to generate clue: ${error.message}`
    };
  }
}

const generateCluePrompt = (ai: any) => ai.definePrompt({
  name: 'generateCluePrompt',
  input: {schema: GenerateClueInputSchema},
  output: {schema: GenerateClueOutputSchema},
  prompt: `You are an expert Codenames Duet player. Your goal is to provide a clue that will help your partner guess the green words on their key card, while avoiding the assassin words. You are provided with the current board state, the green words, the assassin words, and the number of timer tokens remaining.

{{#if theme}}
The game is using a {{theme}} themed word set. All words on the board are related to this theme.

Theme information:
- simpsons theme: Words related to The Simpsons TV show, including characters, locations, catchphrases, and other elements from the series.
- marvel theme: Words related to the Marvel universe, including characters, places, objects, and concepts from Marvel comics and movies.
- harry-potter theme: Words related to the Harry Potter universe, including characters, spells, locations, and objects from the book and movie series.
- standard theme: A variety of general words not tied to any specific theme.
- disney theme: Words related to Disney animated films and characters, including Disney princesses, sidekicks, villains, and iconic Disney movie elements.
- video-games theme: Words related to video games, including popular characters, franchises, terminology, platforms, companies, and gaming concepts.
- star-wars theme: Words related to the Star Wars universe, including characters, planets, vehicles, terminology, and concepts from the franchise.

Your clue should be appropriate for the {{theme}} theme.
{{/if}}

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

const generateClueFlow = (input: GenerateClueInput, ai: any) => {
  // Handle the case where ai might be a mock for SSR
  if (ai.mock) {
    throw new Error('AI service is not available. Please check your API key settings.');
  }
  
  const flow = ai.defineFlow(
    {
      name: 'generateClueFlow',
      inputSchema: GenerateClueInputSchema,
      outputSchema: GenerateClueOutputSchema,
    },
    async (flowInput: GenerateClueInput) => {
      const prompt = generateCluePrompt(ai);
      const {output} = await prompt(flowInput);
      return output!;
    }
  );
  
  return flow(input);
};
