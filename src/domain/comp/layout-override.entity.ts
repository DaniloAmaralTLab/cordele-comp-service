import { DomainException } from '../shared/domain-exception';

/**
 * OverrideTipo: supported types for a page-level override.
 *
 * The domain enum allows both values (forward-compatible).
 * The application layer rejects `em-branco` at write time with 422
 * — this domain entity rejects it too (MVP restriction matching existing
 * behaviour) so the enum stays forward-compatible at the DB/spec level while the
 * MVP enforces the restriction at the domain boundary.
 */
export type OverrideTipo = 'imagem' | 'em-branco';

/**
 * Alinhamento: valid alignment values for an image override.
 */
export type Alinhamento = 'full' | 'centralizado' | 'junto-esquerda' | 'junto-direita';

export interface LayoutOverrideProps {
  readonly id?: string;
  /** Manuscript content tree node reference (read-only node from the import service). */
  readonly referenciaNo: string;
  readonly tipo: OverrideTipo;
  readonly alinhamento?: Alinhamento | null;
  readonly ordem: number;
  /** Runtime flag: true when referenciaNo no longer resolves in the content tree. */
  readonly stale?: boolean;
}

/**
 * Entity representing a page-level presentation override for a manuscript node.
 *
 * References a manuscript node via `referenciaNo` without ever mutating it.
 * The MVP only permits `tipo='imagem'`; `'em-branco'` is
 * reserved and rejected at construction time.
 *
 * `stale=true` is set at runtime by UpdateLayoutUseCase / GetPreviewContextUseCase
 * when `referenciaNo` no longer exists in the current content tree. Stale overrides
 * are excluded from what PUB honours and flagged to the editor.
 *
 * Pure TypeScript — no @nestjs/* or @prisma/client imports.
 */
export class LayoutOverride {
  readonly id: string;
  readonly referenciaNo: string;
  readonly tipo: OverrideTipo;
  readonly alinhamento: Alinhamento | null;
  readonly ordem: number;
  readonly stale: boolean;

  constructor(props: LayoutOverrideProps) {
    // tipo='em-branco' is reserved and rejected in the MVP.
    if (props.tipo === 'em-branco') {
      throw new DomainException(
        'EM_BRANCO_NAO_SUPORTADO',
        422,
        "Override tipo='em-branco' is reserved and not supported in this version",
      );
    }
    if (props.tipo === 'imagem' && !props.alinhamento) {
      throw new DomainException(
        'ALINHAMENTO_OBRIGATORIO_PARA_IMAGEM',
        422,
        "Override tipo='imagem' requires alinhamento to be set",
      );
    }
    if (!props.referenciaNo?.trim()) {
      throw new Error('LayoutOverride: referenciaNo is required');
    }
    if (props.ordem < 0) {
      throw new Error('LayoutOverride: ordem must be >= 0');
    }
    this.id = props.id ?? '';
    this.referenciaNo = props.referenciaNo;
    this.tipo = props.tipo;
    this.alinhamento = props.alinhamento ?? null;
    this.ordem = props.ordem;
    this.stale = props.stale ?? false;
  }

  /** Returns a copy marked as stale (referenciaNo no longer resolves in the content tree). */
  markStale(): LayoutOverride {
    return new LayoutOverride({ ...this.toProps(), stale: true });
  }

  private toProps(): LayoutOverrideProps {
    return {
      id: this.id || undefined,
      referenciaNo: this.referenciaNo,
      tipo: this.tipo,
      alinhamento: this.alinhamento,
      ordem: this.ordem,
      stale: this.stale,
    };
  }
}
