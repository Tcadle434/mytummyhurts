import { SetMetadata } from '@nestjs/common';

import { IS_PUBLIC_KEY } from '../auth.constants';

// Opt a route out of the global JwtAuthGuard (auth endpoints, health probes).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
