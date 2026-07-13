// vitest setup: load .env so integration tests reach the local stack.
import { config } from 'dotenv';

config();

// Keep the suite HERMETIC and free: force the deterministic fallback extraction
// even when a real OPENAI_API_KEY is present in .env. Pin an empty value instead
// of deleting it so a later ConfigModule.forRoot() cannot reload the key from
// .env and accidentally enter an LLM path. Live extraction is verified
// separately (the probe / `npm run eval` with --env-file). Embedding-dependent
// tests inject a fake embedder, so this is safe.
process.env.OPENAI_API_KEY = '';

// The demo fallbacks (and startup env validation) only tolerate a missing key
// when demo mode is explicitly enabled — which is exactly what the hermetic
// suite wants. Must be set before any engine module is imported.
process.env.DEMO_MODE = 'true';
