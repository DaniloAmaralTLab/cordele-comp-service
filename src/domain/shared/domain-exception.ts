/**
 * Base class for domain rule violations in the COMP bounded context.
 *
 * Carries a machine-readable `code` and an HTTP `status` so the infrastructure
 * layer (ProblemJsonFilter) can map it to RFC 7807 without coupling
 * business rules to HTTP semantics.
 *
 * Pure TypeScript — no @nestjs/* or @prisma/client imports.
 */
export class DomainException extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'DomainException';
    // Restore the prototype chain (required for instanceof checks in transpiled ES5).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
