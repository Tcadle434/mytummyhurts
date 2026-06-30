// Loaded as the FIRST import in main.ts so .env is populated in process.env
// before any engine module (which reads OPENAI_* config at module load) is
// evaluated. NestJS ConfigModule also loads .env, but module-init order makes
// this explicit early load the reliable one for top-level config reads.
import { config } from 'dotenv';

config();
