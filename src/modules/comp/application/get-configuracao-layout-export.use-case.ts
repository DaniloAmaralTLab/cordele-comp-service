import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ConfiguracaoLayoutRepositoryPort } from '../ports/configuracao-layout-repository.port';
import type { ManuscriptContentPort } from '../ports/manuscript-content.port';
import { COMP_LAYOUT_REPO, COMP_MANUSCRIPT_CONTENT_PORT } from '../comp.tokens';

/**
 * DTO for a single non-stale layout override returned by GetConfiguracaoLayoutExportUseCase.
 *
 * Shape matches api-contract §6.3 / §6.2 overrides array, minus `stale`
 * (PUB only receives the non-stale set — §6.5).
 */
export interface LayoutOverrideRead {
  readonly id: string;
  readonly referenciaNo: string;
  readonly tipo: string;
  readonly alinhamento: string | null;
  readonly ordem: number;
}

/**
 * DTO returned by GetConfiguracaoLayoutExportUseCase (in-process export port for PUB).
 *
 * Shape matches api-contract §7.3 (parameters the ePub stylesheet honours):
 *   - Typography / margins: fonteCorpoFamilia, fonteCorpoTamanho, espacamentoLinha,
 *     margemLateral, h1Tamanho, h2Tamanho, h3Tamanho.
 *   - Per-image presentation: overrides (non-stale imagem only).
 *
 * Excludes `materialized` and `stale` per §6.5 — PUB only reads honoured parameters.
 *
 * Defined in modules/ — not a Prisma model.
 */
export interface LayoutRead {
  readonly projetoId: string;
  readonly fonteCorpoFamilia: string;
  readonly fonteCorpoTamanho: number;
  readonly espacamentoLinha: number;
  readonly margemLateral: number;
  readonly h1Tamanho: number;
  readonly h2Tamanho: number;
  readonly h3Tamanho: number;
  readonly overrides: readonly LayoutOverrideRead[];
  readonly atualizadoEm: Date;
}

/**
 * In-process export use case for ConfiguracaoLayout.
 *
 * Called by PUB at ePub export time — NOT the HTTP controller path.
 * The HTTP path uses `GetLayoutViewUseCase` (lazy default). This use case:
 *   - Returns `null` when no composition exists for the project.
 *   - Filters out stale overrides by calling `ManuscriptContentPort.nodeExists`
 *     for each override's `referenciaNo`.
 *   - Returns only the honoured parameter set — no extra fields exposed.
 *
 * Wiring: provided by CompModule under a token; DI token in comp.tokens.ts.
 *
 * Does not import infrastructure/ directly.
 * Resides in modules/ — @nestjs/common decorators are permitted here.
 */
@Injectable()
export class GetConfiguracaoLayoutExportUseCase {
  private readonly logger = new Logger(GetConfiguracaoLayoutExportUseCase.name);

  constructor(
    @Inject(COMP_LAYOUT_REPO)
    private readonly layoutRepo: ConfiguracaoLayoutRepositoryPort,
    @Inject(COMP_MANUSCRIPT_CONTENT_PORT)
    private readonly manuscriptContent: ManuscriptContentPort,
  ) {}

  /**
   * Returns the honoured (non-stale) `ConfiguracaoLayout` as a `LayoutRead` DTO,
   * or `null` when no row has been materialized yet for the given project.
   *
   * Stale override detection: for each override, `ManuscriptContentPort.nodeExists`
   * is called. Overrides returning `false` are excluded from the response.
   *
   * Never throws for an absent aggregate or missing manuscript nodes (null-safe).
   */
  async get(projetoId: string): Promise<LayoutRead | null> {
    this.logger.debug(`GetConfiguracaoLayoutExport projetoId=${projetoId}`);

    const layout = await this.layoutRepo.findByProjetoId(projetoId);

    if (!layout) {
      this.logger.debug(
        `GetConfiguracaoLayoutExport: no row found for projetoId=${projetoId} — returning null`,
      );
      return null;
    }

    // Filter stale overrides: exclude any override whose referenciaNo no longer
    // resolves in the current IMP content tree (api-contract §6.5).
    const nonStaleOverrides: LayoutOverrideRead[] = [];
    for (const override of layout.overrides) {
      const exists = await this.manuscriptContent.nodeExists(projetoId, override.referenciaNo);
      if (exists) {
        nonStaleOverrides.push({
          id: override.id,
          referenciaNo: override.referenciaNo,
          tipo: override.tipo,
          alinhamento: override.alinhamento,
          ordem: override.ordem,
        });
      } else {
        this.logger.debug(
          `GetConfiguracaoLayoutExport: override referenciaNo=${override.referenciaNo} is stale — excluded`,
        );
      }
    }

    // Map to §7.3 honoured parameter set only — no extra fields.
    const read: LayoutRead = {
      projetoId: layout.projetoId,
      fonteCorpoFamilia: layout.fonte_corpo_familia,
      fonteCorpoTamanho: layout.fonte_corpo_tamanho,
      espacamentoLinha: layout.espacamento_linha,
      margemLateral: layout.margem_lateral,
      h1Tamanho: layout.h1_tamanho,
      h2Tamanho: layout.h2_tamanho,
      h3Tamanho: layout.h3_tamanho,
      overrides: nonStaleOverrides,
      atualizadoEm: layout.atualizadoEm,
    };

    return read;
  }
}
