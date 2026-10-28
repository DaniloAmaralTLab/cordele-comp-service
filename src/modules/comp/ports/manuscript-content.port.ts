/**
 * A single node in the manuscript content tree (IMP representation, read-only).
 * COMP never writes to this structure.
 */
export interface ContentNode {
  readonly nodeId: string;
  readonly tipo: string;
  readonly children?: ReadonlyArray<ContentNode>;
}

/**
 * Read-only content tree for a project's manuscript.
 * Returned by ManuscriptContentPort.getContentTree.
 *
 * Matches api-contract §6.4 / .
 */
export interface ContentTreeDto {
  readonly manuscritoId: string;
  readonly estrutura: ReadonlyArray<ContentNode>;
}

/**
 * Outbound port for reading the manuscript content tree (read-only IMP boundary).
 *
 * COMP uses this to validate override node references:
 *   - UpdateLayoutUseCase: validates that each override's referenciaNo exists;
 *     marks stale those that don't.
 *   - GetLayoutPreviewUseCase: returns 409 when tree is null; validates existing
 *     overrides and includes the tree in the response.
 *
 * The port returns null when no manuscript exists for the project yet.
 * Callers must handle null (no manuscript → stale/error depending on use case).
 *
 * Current adapter: ManuscriptContentStubAdapter (stub used while there is no
 * integration with the import service).
 *
 * Pure TypeScript interface — no @nestjs/* or @prisma/client imports.
 */
export interface ManuscriptContentPort {
  /**
   * Returns the current content tree for the project, or null when none exists.
   * Never throws for a missing manuscript — callers distinguish null from an error.
   */
  getContentTree(projetoId: string): Promise<ContentTreeDto | null>;

  /**
   * Returns true when the manuscript node identified by referenciaNo exists in the
   * current content tree; false when the node is absent (stale override).
   * Never throws for a missing node — callers handle false by marking the override stale.
   */
  nodeExists(projetoId: string, referenciaNo: string): Promise<boolean>;
}

/**
 * Utility: collect all nodeIds from a content tree into a Set for O(1) lookup.
 * Traverses the full tree depth-first.
 */
export function collectNodeIds(nodes: ReadonlyArray<ContentNode>): Set<string> {
  const ids = new Set<string>();

  function walk(ns: ReadonlyArray<ContentNode>): void {
    for (const n of ns) {
      ids.add(n.nodeId);
      if (n.children && n.children.length > 0) {
        walk(n.children);
      }
    }
  }

  walk(nodes);
  return ids;
}
