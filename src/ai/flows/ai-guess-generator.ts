
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
  clueWord: z.string().describe('The clue word given by the human player. If "FIND_GREEN_AGENT_SUDDEN_DEATH", it means AI is in sudden death and should pick one of its own green words.'),
  clueNumber: z.number().describe('The number associated with the clue. For "FIND_GREEN_AGENT_SUDDEN_DEATH", this will be 1.'),
  gridWords: z
    .array(z.string())
    .length(25)
    .describe('The 5x5 grid of words visible on the board.'),
  aiGreenWords: z
    .array(z.string())
    .describe("The words that are green (targets) for the AI player from its perspective and are not yet revealed. For Sudden Death, these are the AI's primary targets. For normal play, this is for AI's general awareness but not the primary target when guessing the human's clue."),
  aiAssassinWords: z
    .array(z.string())
    .describe("The words that are assassins for the AI player from its perspective and are not yet revealed. The AI must be very cautious about guessing these, especially in Sudden Death where hitting one is an instant loss."),
  revealedWords: z
    .array(z.string())
    .describe("A list of words that have already been revealed on the board."),
});
export type GenerateGuessInput = z.infer<typeof GenerateGuessInputSchema>;

const GenerateGuessOutputSchema = z.object({
  guessedWords: z
    .array(z.string())
    .describe(
      'An ordered list of words (from the grid) the AI chooses to guess. Should not include already revealed words. For Sudden Death, this should be exactly one word if a guess is made.'
    ),
  reasoning: z
    .string()
    .optional()
    .describe('The AI reasoning behind the chosen guesses or decision to pass. Explain why if passing, especially if no words match the clue or if the risk of hitting an AI assassin is too high.'),
});
export type GenerateGuessOutput = z.infer<typeof GenerateGuessOutputSchema>;

export async function generateAiGuess(
  input: GenerateGuessInput
): Promise<GenerateGuessOutput> {
  return generateAiGuessFlow(input);
}

const generateGuessPrompt = ai.definePrompt({
  name: 'generateAiGuessPrompt',
  input: {schema: z.object({ 
    ...GenerateGuessInputSchema.shape,
    isSuddenDeathScenario: z.boolean(),
  })},
  output: {schema: GenerateGuessOutputSchema},
  prompt: `You are an AI playing Codenames Duet.

{{#if isSuddenDeathScenario}}
You are in a SUDDEN DEATH round. You MUST select exactly ONE word from your 'aiGreenWords' list to guess. If none of your green words are left, or if all your remaining green words are too risky (e.g., also your assassin), you may pass by providing an empty 'guessedWords' array and a reason for passing. Hitting one of your 'aiAssassinWords' or a bystander in sudden death results in an immediate loss for your team. Choose very carefully.
{{else}}
Your human partner has given you a clue.
Clue Word: {{clueWord}}
Clue Number: {{clueNumber}}

Your goal is to identify words on the board that your human partner is hinting at with their clue. The words you guess will be evaluated against *your human partner's* key card.
You can suggest up to {{clueNumber}} words if the clue number is greater than 0. If all your guesses for this clue turn out to be green for your partner, you are allowed one extra bonus guess (making it {{clueNumber}}+1 words in total for this clue). If the clue number is 0, you can guess exactly 1 word.
{{/if}}

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

From YOUR PERSPECTIVE (AI player), these are your ASSASSIN words that are NOT YET REVEALED.
{{#if isSuddenDeathScenario}}
In Sudden Death, guessing one of these means your team LOSES. Be extremely careful.
{{else}}
Be extremely cautious with these words. It's possible your human partner is trying to get you to guess a word that is one of their GREEN words but an ASSASSIN for you. This is a high-risk, high-reward situation. If their clue *very strongly* points to one of your assassin words, and you have few other good options, you may consider it as a very risky guess.
{{/if}}
{{#if aiAssassinWords.length}}
  {{#each aiAssassinWords}}
    {{this}}{{#unless @last}}, {{/unless}}
  {{/each}}
{{else}}
  None
{{/if}}

For your general awareness, from YOUR PERSPECTIVE (AI player), these are your GREEN (target) words that are NOT YET REVEALED:
{{#if aiGreenWords.length}}
  {{#each aiGreenWords}}
    {{this}}{{#unless @last}}, {{/unless}}
  {{/each}}
{{else}}
  None remaining
{{/if}}

{{#if isSuddenDeathScenario}}
In Sudden Death: Select ONE word from 'aiGreenWords' that is not revealed. If multiple options, pick the safest one (not one of your assassins if possible). If no safe green words, or no green words left, pass with empty 'guessedWords' and provide reasoning.
{{else}}
Your main goal is to guess your partner's targets based on their clue. Do not prioritize guessing your own green words unless they also strongly match the clue.
Carefully analyze the clue ('{{clueWord}}' for {{clueNumber}}) and the available unrevealed words.
Choose an ordered list of words from the gridWords that you want to guess.
Your list should contain words that best match the clue your partner gave.
If a word that strongly matches the clue is an ASSASSIN from YOUR perspective (listed above), you must carefully weigh the risk. Only select it if the clue is exceptionally strong for that word and other options are weak. Prioritize safer guesses if good alternatives exist.
Do not guess any words from the 'revealedWords' list.
The number of words in your 'guessedWords' list should be between 1 and (clueNumber + 1) if clueNumber > 0, or exactly 1 if clueNumber is 0. Be strategic about the number of words you list.
{{/if}}

Respond with the 'guessedWords' array and your 'reasoning'. If you think no words match the clue (for normal play), or no safe green word can be chosen (for sudden death), or the risk of hitting one of YOUR assassins is too high given the options, provide an empty 'guessedWords' array and explain your reasoning for passing.
`,
});

const generateAiGuessFlow = ai.defineFlow(
  {
    name: 'generateAiGuessFlow',
    inputSchema: GenerateGuessInputSchema, // Flow input remains the same
    outputSchema: GenerateGuessOutputSchema,
  },
  async (input) => {
    const unrevealedGrid = input.gridWords.filter(w => !input.revealedWords.includes(w));
    
    const baseInputForPrompt = {
      ...input,
      aiGreenWords: input.aiGreenWords.filter(w => unrevealedGrid.includes(w)),
      aiAssassinWords: input.aiAssassinWords.filter(w => unrevealedGrid.includes(w)),
    };

    const enrichedInputForPrompt = {
        ...baseInputForPrompt,
        isSuddenDeathScenario: baseInputForPrompt.clueWord === "FIND_GREEN_AGENT_SUDDEN_DEATH",
    };

    const {output} = await generateGuessPrompt(enrichedInputForPrompt);
    
    if (!output) {
      console.error('AI guess prompt did not return a valid output.');
      return {
        guessedWords: [],
        reasoning: 'AI model failed to generate a structured response, so it passes the turn.',
      };
    }
    
    if (output.guessedWords) {
        output.guessedWords = output.guessedWords.filter(gw => input.gridWords.includes(gw) && !input.revealedWords.includes(gw));
        if (enrichedInputForPrompt.isSuddenDeathScenario && output.guessedWords.length > 1) {
            output.guessedWords = output.guessedWords.slice(0,1);
        }
    }
    return output;
  }
);

