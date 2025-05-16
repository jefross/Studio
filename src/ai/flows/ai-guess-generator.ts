'use server';
/**
 * @fileOverview An AI agent that makes guesses in Codenames Duet.
 *
 * - generateAiGuess - A function that generates guesses for a given clue.
 * - GenerateGuessInput - The input type for the generateAiGuess function.
 * - GenerateGuessOutput - The return type for the generateAiGuess function.
 */

import {getAI, ai} from '@/ai/genkit';
import {z} from 'genkit';
import { WordTheme } from '@/lib/words';

const GenerateGuessInputSchema = z.object({
  clueWord: z.string().describe('The clue word given by the human player. If "FIND_GREEN_AGENT_SUDDEN_DEATH", it means AI is in sudden death and should pick one word it believes is a Green agent for its HUMAN PARTNER.'),
  clueNumber: z.number().describe('The number associated with the clue. For "FIND_GREEN_AGENT_SUDDEN_DEATH", this will be 1.'),
  gridWords: z
    .array(z.string())
    .length(25)
    .describe('The 5x5 grid of words visible on the board.'),
  aiGreenWords: z // AI's own green words (for its awareness/context, not primary target unless specified)
    .array(z.string())
    .describe("The words that are green (targets) for the AI player from its perspective and are not yet revealed. In normal play, this is for AI's general awareness. In SUDDEN DEATH, the AI should NOT pick from this list, but try to pick for its human partner."),
  aiAssassinWords: z // AI's own assassin words (to avoid at all costs)
    .array(z.string())
    .describe("The words that are assassins for the AI player from its perspective and are not yet revealed. The AI must be very cautious about guessing these, especially if one of its own assassins is selected, as it results in an immediate loss."),
  revealedWords: z
    .array(z.string())
    .describe("A list of words that have already been revealed on the board."),
  theme: z
    .enum(['standard', 'simpsons', 'marvel', 'harry-potter', 'disney', 'video-games', 'star-wars'])
    .describe('The theme of the word set being used in the game.')
    .optional()
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
    .describe('The AI reasoning behind the chosen guesses or decision to pass. Explain why if passing, especially if no words match the clue or if the risk of hitting an AI assassin is too high (for normal play) or if no safe guess for the partner can be made (for sudden death).'),
});
export type GenerateGuessOutput = z.infer<typeof GenerateGuessOutputSchema>;

export async function generateAiGuess(
  input: GenerateGuessInput
): Promise<GenerateGuessOutput> {
  try {
    // Get the AI instance with the current API key
    const aiInstance = getAI();
    return generateAiGuessFlow(input, aiInstance);
  } catch (error: any) {
    console.error('Error generating AI guess:', error);
    
    // If the error is about missing API key, pass it through
    if (error.message?.includes('API key')) {
      throw error;
    }
    
    // Otherwise provide a fallback response
    return {
      guessedWords: [],
      reasoning: `Failed to generate guess: ${error.message}`
    };
  }
}

const generateGuessPrompt = (ai: any) => ai.definePrompt({
  name: 'generateAiGuessPrompt',
  input: {schema: z.object({ 
    ...GenerateGuessInputSchema.shape,
    isSuddenDeathScenario: z.boolean(),
  })},
  output: {schema: GenerateGuessOutputSchema},
  prompt: `You are an AI playing Codenames Duet. Your goal is to help your team find all 15 unique agents.

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

You should consider the {{theme}} theme when interpreting clues and making guesses.
{{/if}}

{{#if isSuddenDeathScenario}}
You are in a SUDDEN DEATH round. No more clues will be given by your human partner.
Your task is to select exactly ONE word from the 'gridWords' that you believe is a GREEN agent for your HUMAN PARTNER.
You DO NOT know your human partner's key card. Make your best strategic guess based on the unrevealed words.
It is critical to AVOID words that are ASSASSINS for YOU (listed in 'aiAssassinWords'). If you select one of your own assassins, your team LOSES.
If you select a word that is an Assassin or a Bystander for your HUMAN PARTNER, your team also LOSES.
If there are no unrevealed words, or you cannot identify a reasonably safe guess for your partner, you may pass by providing an empty 'guessedWords' array and a reason.
Your 'aiGreenWords' are listed for your general awareness only; do NOT try to pick your own green words in Sudden Death.
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
You must be extremely cautious with these words. It's possible your human partner is trying to get you to guess a word that is one of their GREEN words but an ASSASSIN for you. This is a high-risk, high-reward situation. If their clue *very strongly* points to one of your assassin words, and you have few other good options, you may consider it as a very risky guess. In Sudden Death, picking one of your own Assassins is an instant loss.
{{#if aiAssassinWords.length}}
  {{#each aiAssassinWords}}
    {{this}}{{#unless @last}}, {{/unless}}
  {{/each}}
{{else}}
  None
{{/if}}

For your general awareness, from YOUR PERSPECTIVE (AI player), these are your GREEN (target) words that are NOT YET REVEALED (do not prioritize these when guessing your partner's clue, and do NOT pick these in Sudden Death):
{{#if aiGreenWords.length}}
  {{#each aiGreenWords}}
    {{this}}{{#unless @last}}, {{/unless}}
  {{/each}}
{{else}}
  None remaining
{{/if}}

{{#if isSuddenDeathScenario}}
In Sudden Death: Select ONE unrevealed word from 'gridWords' that you believe is GREEN for your HUMAN PARTNER. Avoid your own 'aiAssassinWords' at all costs. If no suitable/safe guess can be made for your partner, pass with empty 'guessedWords' and provide reasoning.
{{else}}
Your main goal is to guess your partner's targets based on their clue. Do not prioritize guessing your own green words unless they also strongly match the clue.
Carefully analyze the clue ('{{clueWord}}' for {{clueNumber}}) and the available unrevealed words.
Choose an ordered list of words from the gridWords that you want to guess.
Your list should contain words that best match the clue your partner gave.
If a word that strongly matches the clue is an ASSASSIN from YOUR perspective (listed above), you must carefully weigh the risk. Only select it if the clue is exceptionally strong for that word and other options are weak. Prioritize safer guesses if good alternatives exist.
Do not guess any words from the 'revealedWords' list.
The number of words in your 'guessedWords' list should be between 1 and (clueNumber + 1) if clueNumber > 0, or exactly 1 if clueNumber is 0. Be strategic about the number of words you list.
{{/if}}

Respond with the 'guessedWords' array and your 'reasoning'. If you think no words match the clue (for normal play), or no safe selection for your partner can be chosen (for sudden death), or the risk of hitting one of YOUR assassins is too high given the options, provide an empty 'guessedWords' array and explain your reasoning for passing.
`,
});

const generateAiGuessFlow = (input: GenerateGuessInput, ai: any) => {
  // Handle the case where ai might be a mock for SSR
  if (ai.mock) {
    throw new Error('AI service is not available. Please check your API key settings.');
  }
  
  const flow = ai.defineFlow(
    {
      name: 'generateAiGuessFlow',
      inputSchema: GenerateGuessInputSchema, // Flow input remains the same
      outputSchema: GenerateGuessOutputSchema,
    },
    async (flowInput: GenerateGuessInput) => {
      const unrevealedGrid = flowInput.gridWords.filter(w => !flowInput.revealedWords.includes(w));
      
      const baseInputForPrompt = {
        ...flowInput,
        // Filter AI's own green/assassin words to only those still on the board and unrevealed.
        // This is for AI's self-awareness.
        aiGreenWords: flowInput.aiGreenWords.filter(w => unrevealedGrid.includes(w)),
        aiAssassinWords: flowInput.aiAssassinWords.filter(w => unrevealedGrid.includes(w)),
      };

      const enrichedInputForPrompt = {
          ...baseInputForPrompt,
          isSuddenDeathScenario: baseInputForPrompt.clueWord === "FIND_GREEN_AGENT_SUDDEN_DEATH",
      };

      const prompt = generateGuessPrompt(ai);
      const {output} = await prompt(enrichedInputForPrompt);
      
      if (!output) {
        console.error('AI guess prompt did not return a valid output.');
        return {
          guessedWords: [],
          reasoning: 'AI model failed to generate a structured response, so it passes the turn.',
        };
      }
      
      if (output.guessedWords) {
          // Filter AI's guesses to ensure they are valid (on grid, not revealed)
          output.guessedWords = output.guessedWords.filter((gw: string) => flowInput.gridWords.includes(gw) && !flowInput.revealedWords.includes(gw));
          // In Sudden Death, AI should only guess one word.
          if (enrichedInputForPrompt.isSuddenDeathScenario && output.guessedWords.length > 1) {
              output.guessedWords = output.guessedWords.slice(0,1);
          }
      }
      return output;
    }
  );
  
  return flow(input);
};

