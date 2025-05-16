import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

let apiKey: string | null = null;

// Function to initialize AI with the provided API key
export const initializeAI = (key: string) => {
  apiKey = key;
};

// Function to get the API instance with the current API key
export const getAI = () => {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined';
  
  // For client-side, use the stored API key from localStorage if available
  if (isBrowser) {
    try {
      const storedKey = window.localStorage.getItem('gemini-api-key');
      if (storedKey) {
        // Use the stored key directly instead of parsing it as JSON
        apiKey = storedKey;
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error);
    }
  }

  // Fallback to environment variable if no key is set
  const keyToUse = apiKey || process.env.GEMINI_API_KEY;

  if (!keyToUse) {
    throw new Error('No Gemini API key found. Please set one in the settings.');
  }

  return genkit({
    plugins: [googleAI({ apiKey: keyToUse })],
    model: 'googleai/gemini-2.0-flash',
  });
};

// For backward compatibility and server-side rendering
// Use environment variable key for initial rendering
export const ai = (() => {
  try {
    return genkit({
      plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY || 'placeholder-key-for-ssr' })],
      model: 'googleai/gemini-2.0-flash',
    });
  } catch (error) {
    console.error('Error initializing AI during SSR:', error);
    // Return a minimal mock for SSR
    return {
      definePrompt: () => ({ mock: true }),
      defineFlow: () => ({ mock: true })
    };
  }
})();
