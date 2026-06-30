// vitest setup: load .env so integration tests reach the local stack.
import { config } from 'dotenv';

config();

// Keep the suite HERMETIC and free: force the deterministic fallback extraction
// even when a real OPENAI_API_KEY is present in .env. Live extraction is verified
// separately (the probe / `npm run eval` with --env-file). Embedding-dependent
// tests inject a fake embedder, so this is safe.
delete process.env.OPENAI_API_KEY;
