import { Injectable, Logger } from '@nestjs/common';

/**
 * Application service for the COMP bounded context.
 *
 * Structural placeholder retained for module wiring.
 * Real use cases live in separate `*.use-case.ts` files,
 * each injected by its DI token from `comp.tokens.ts`.
 *
 * The controller injects use cases by token directly — this service
 * is no longer the single orchestrator; it will be removed or repurposed
 * as a thin coordinator later if needed.
 */
@Injectable()
export class CompService {
  private readonly logger = new Logger(CompService.name);

  constructor() {
    this.logger.log('CompService initialised');
  }
}
