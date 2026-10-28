/**
 * Port for in-process domain event emission in the COMP bounded context.
 *
 * Use cases emit domain events through this port so that:
 *   1. The caller (application service) never imports Node's EventEmitter directly.
 *   2. Tests can spy on the port without touching the real emitter.
 *   3. The concrete adapter can be swapped (in-process → broker) without
 *      changing any use case.
 *
 * Used for the MetadataUpdated / LayoutUpdated events. messaging.enabled=false in this deployment — events
 * stay in-process; no Kafka / RabbitMQ integration is wired.
 *
 * No @nestjs/* or @prisma/client — pure TypeScript port.
 * No NestJS decorators in this file.
 */

/**
 * Outbound port for emitting named domain events with an arbitrary payload.
 *
 * Implementations must:
 *   - Call every listener registered for `eventName` synchronously (in-process).
 *   - Never throw: errors thrown by individual listeners MUST be caught and
 *     logged without propagating to the caller.
 *
 * @example
 *   emitter.emit('MetadataUpdated', { projetoId: '...', titulo: '...' });
 */
export interface DomainEventEmitter {
  /**
   * Emit a domain event.
   *
   * @param eventName - Logical name of the event (e.g. `'MetadataUpdated'`).
   * @param payload   - Arbitrary key/value data associated with the event.
   */
  emit(eventName: string, payload: Record<string, unknown>): void;
}
