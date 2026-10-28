import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { CompModule } from '../../modules/comp/comp.module';

/**
 * Exposes the readiness health endpoint (`GET /api/v1/health`) and the
 * liveness endpoint (`GET /api/v1/health/live`).
 *
 * Imports `CompModule` which exports `CompHealthService` — this avoids
 * importing `CompHealthService` directly from `modules/` here (layer boundary
 * for the infrastructure → modules direction).
 *
 * `PrismaService` is provided globally by `DatabaseModule` (imported in
 * `AppModule`) — resolved transitively through `CompModule`'s
 * `CompHealthService` via `COMP_DATABASE_HEALTH_PORT`.
 *
 * Replaces the earlier terminus-based `HealthModule` with a plain NestJS module
 * using the simpler `CompHealthService` (no `@nestjs/terminus` required).
 */
@Module({
  imports: [CompModule],
  controllers: [HealthController],
})
export class HealthModule {}
