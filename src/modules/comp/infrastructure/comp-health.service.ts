/**
 * @deprecated Use `../../comp-health.service` directly.
 *
 * This re-export exists only to preserve backward compatibility for
 * `infrastructure/health/health.controller.ts` while the HealthModule
 * migration to importing CompModule is finalised.
 *
 * Boundary fix: the real implementation has been moved to
 * `modules/comp/comp-health.service.ts` so it no longer imports PrismaService
 * directly from `infrastructure/persistence/`.
 */
export { CompHealthService, type HealthCheckResult } from '../comp-health.service';
