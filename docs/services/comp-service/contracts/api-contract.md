# API Contract — comp-service (Composição)

Base path: `/api/v1/comp`.

Composition owns the editorial metadata, the layout configuration and the cover of each
project. Every resource is a singleton child of a project (one `Metadados` and one
`ConfiguracaoLayout` per `projetoId`), so routes are nested under
`/api/v1/comp/projetos/{projetoId}/...`.

A few ground rules shape the API:

- Composition never changes the imported manuscript. Page and image adjustments are stored as
  presentation parameters (layout overrides) that point at nodes of the manuscript content tree.
- The MVP persists the two parameter aggregates plus image-alignment overrides. Blank-page
  inserts (`tipo = em-branco`) are modelled but not writable yet; the API rejects them with
  `422 urn:cordele:comp:structural-edit-deferred`.
- The preview returns data (the read-only content tree plus the layout), never rendered HTML.
  Pagination and rendering happen on the client.
- The cover is optional: jpeg, png or webp, at most 10 MB, stored behind a file storage port
  and referenced by `capaUrl`.
- Defaults are lazy. A `GET` on an aggregate that was never saved returns a synthesized default
  (`200`, `materialized: false`); the row is created on the first `PUT`.

---

## 1. Conventions

- Media type: `application/json`; `multipart/form-data` for the cover upload.
- IDs: UUID v4, server-generated.
- Timestamps: RFC 3339 / ISO-8601 UTC (`atualizadoEm`).
- Errors: RFC 7807 `application/problem+json` (see §5).
- Idempotency: `PUT` metadados and `PUT` layout are idempotent upserts keyed by `projetoId`;
  re-sending the same body is a safe no-op that returns the current representation.
- Project binding: composition never creates projects or changes their status. A `projetoId`
  that does not exist in the active empresa yields `404`.

## 2. Authentication, authorization, tenancy

- Auth: OAuth2 Bearer JWT (`Authorization: Bearer <token>`). Unauthenticated requests get `401`.
- Scopes: `comp:read` (read metadata, layout, preview-context, batch metadata) and `comp:write`
  (upsert metadata, upload/delete cover, upsert layout, erasure).
- Tenant: the owning empresa comes from the JWT claim, never from the path, query or body. A
  `projetoId` that belongs to another empresa gets `404`, so cross-tenant existence is never
  revealed.

## 3. Headers

| Header | Direction | Notes |
|---|---|---|
| `Authorization: Bearer <jwt>` | request | required on every endpoint |
| `X-Correlation-Id` | request (optional) / response (always) | propagated to logs; generated if absent |
| `Content-Type: application/json` | request | metadata / layout upsert |
| `Content-Type: multipart/form-data` | request | cover upload only |
| `Content-Type: application/problem+json` | response | error responses |

---

## 4. Resources

### 4.1 `GET /api/v1/comp/projetos/{projetoId}/metadados`

Returns the project's `Metadados` (§6.1). If nothing was saved yet, returns a default
representation with `materialized: false` so the form can render.

Scope `comp:read`. Success `200 OK`. An unknown `projetoId` (or one from another empresa) returns
`404 urn:cordele:comp:projeto-not-found`.

### 4.2 `PUT /api/v1/comp/projetos/{projetoId}/metadados`

Creates or updates the project's `Metadados`, validates the required fields and the `idioma`
enum, persists and emits `MetadataUpdated`. Does not change the project status.

Scope `comp:write`. Request body:

```json
{ "titulo": "Romance das Cidades", "autor": "Eliana Moraes",
  "isbn": null, "idioma": "pt", "categoria": null }
```

- `titulo` and `autor` are required, non-blank, at most 300 characters.
- `idioma` is required and one of `pt`, `en`, `es`, `fr`.
- `isbn` and `categoria` are optional (no registry lookup).
- `capaUrl` is not set here, only by the cover endpoints. `editoraNome` is resolved server-side.

Success `200 OK` with the persisted `Metadados` (`materialized: true`). A missing or blank
`titulo`/`autor` or an invalid `idioma` returns `400 urn:cordele:comp:validation` and persists
nothing. Re-sending an identical body is a no-op.

### 4.3 `POST /api/v1/comp/projetos/{projetoId}/capa`

Uploads the cover, validates type and size, stores it through the file storage port, points
`capaUrl` at it (creating the `Metadados` row if needed) and emits `MetadataUpdated`. Replacing
a cover writes a new object and repoints `capaUrl`.

Scope `comp:write`. Multipart part `file`: `image/jpeg`, `image/png` or `image/webp`, at most
10 MB (10485760 bytes).

Success `201 Created` with `{ "capaUrl": "…", "atualizadoEm": "…" }`. Unsupported type returns
`415 urn:cordele:comp:unsupported-cover-format`; a file over 10 MB returns
`413 urn:cordele:comp:cover-too-large`. In both cases nothing is stored. The binary is never kept
in the database row.

### 4.4 `DELETE /api/v1/comp/projetos/{projetoId}/capa`

Clears `capaUrl`, removes the stored file and emits `MetadataUpdated`. Idempotent: `204` also
when there is no cover.

Scope `comp:write`. Success `204 No Content`.

### 4.5 `GET /api/v1/comp/projetos/{projetoId}/layout`

Returns the project's `ConfiguracaoLayout` (§6.2): typography, margins, heading sizes and
image-alignment overrides. Returns a default (`materialized: false`) if nothing was saved yet.

Scope `comp:read`. Success `200 OK`. An unknown `projetoId` returns `404`.

### 4.6 `PUT /api/v1/comp/projetos/{projetoId}/layout`

Creates or updates the project's `ConfiguracaoLayout` with typography within bounds (§7.2),
heading sizes, side margin and the full set of image-alignment overrides. Every override's
`referenciaNo` is checked against the current manuscript content tree. Persists and emits
`LayoutUpdated`.

Scope `comp:write`. Request body: see §6.2. Success `200 OK` with the persisted layout
(`materialized: true`).

- Any typography value out of bounds returns `400 urn:cordele:comp:validation` and persists nothing.
- An override that references a node not present in the current content tree returns
  `422 urn:cordele:comp:override-ref-not-found` and persists nothing.
- An override with `tipo = em-branco` returns `422 urn:cordele:comp:structural-edit-deferred`.
- The manuscript content tree is never modified.

### 4.7 `GET /api/v1/comp/projetos/{projetoId}/preview-context`

Returns the read-only manuscript content tree, the project's `ConfiguracaoLayout` and its
overrides as one data payload for the client renderer (§6.4). Persists nothing. Overrides whose
`referenciaNo` no longer resolves are returned with `stale: true` and are left out of what the
publication service honours.

Scope `comp:read`. Success `200 OK`. If the project has no imported manuscript yet, returns
`409 urn:cordele:comp:manuscript-missing`.

### 4.8 `POST /api/v1/comp/metadata/batch`

Batch author lookup used by the project service for library cards. It lives in its own
controller because it has no single `projetoId` in the path.

Scope `comp:read`. Request body:

```json
{ "projetoIds": ["<uuid>", "..."] }
```

Response `200 OK`, one item per project that has a persisted `Metadados` row:

```json
[{ "projetoId": "<uuid>", "autor": "Eliana Moraes" }]
```

- Projects without a row are omitted (a missing entry means "no metadata", different from an
  entry with `autor: null`). Unknown IDs are omitted.
- `projetoIds: []` returns `[]` without touching the database.
- One query regardless of list size.
- At most 50 IDs per request; 51 or more returns `400` with type `urn:cordele:comp:validation`.
  Callers must split larger lists.

### 4.9 `DELETE /api/v1/comp/projetos/{projetoId}/erasure` — erasure (LGPD)

Called by the project service as part of its LGPD project deletion. Removes everything
composition holds for the project: the `Metadados` row, the `ConfiguracaoLayout` row with all its
overrides, and the stored cover file.

Scope `comp:write`. Success `204 No Content`. Idempotent: calling it again for a project that has
nothing left (or never had anything) also returns `204`.

---

## 5. Errors (RFC 7807)

All errors use `application/problem+json`. `type` is a stable URN; `traceId` mirrors
`X-Correlation-Id`. Bodies carry `type`, `title`, `status`, `detail`, `instance` and `traceId`.

| `type` (URN) | HTTP | When |
|---|---|---|
| `urn:cordele:comp:validation` | 400 | missing/blank titulo or autor, bad idioma, out-of-bounds layout value, malformed request |
| `urn:cordele:comp:unauthorized` | 401 | missing/invalid token |
| `urn:cordele:comp:forbidden` | 403 | valid token lacking the required scope |
| `urn:cordele:comp:projeto-not-found` | 404 | projetoId not in the active empresa |
| `urn:cordele:comp:manuscript-missing` | 409 | preview requested but no manuscript imported yet |
| `urn:cordele:comp:cover-too-large` | 413 | cover image > 10 MB |
| `urn:cordele:comp:unsupported-cover-format` | 415 | cover is not jpeg/png/webp |
| `urn:cordele:comp:override-ref-not-found` | 422 | override referenciaNo not in the current content tree |
| `urn:cordele:comp:structural-edit-deferred` | 422 | tipo=em-branco (blank-page insert), not supported yet |

Example:

```json
{
  "type": "urn:cordele:comp:override-ref-not-found",
  "title": "Layout override references a manuscript node that no longer exists",
  "status": 422,
  "detail": "Override referenciaNo 'img-042' is not present in the current manuscript content tree.",
  "instance": "/api/v1/comp/projetos/2f1c.../layout",
  "traceId": "8b1f...c2"
}
```

---

## 6. Schemas

### 6.1 `Metadados`

```json
{
  "projetoId": "uuid",
  "titulo": "Romance das Cidades",
  "autor": "Eliana Moraes",
  "isbn": null,
  "idioma": "pt",
  "categoria": null,
  "capaUrl": "https://storage.../capa-romance.jpg | null",
  "editoraNome": "Editora Aetós | null",
  "atualizadoEm": "2026-08-25T14:31:46Z",
  "materialized": true
}
```

- `idioma` is one of `pt`, `en`, `es`, `fr` (default `pt`). `titulo` and `autor` are required.
- `capaUrl` is the storage reference, `null` when there is no cover.
- `materialized` is `false` on a default (never saved) representation.
- The publication service reads the same field set minus `materialized`.

### 6.2 `ConfiguracaoLayout`

```json
{
  "projetoId": "uuid",
  "fonteCorpoFamilia": "serif",
  "fonteCorpoTamanho": 12,
  "espacamentoLinha": 1.5,
  "margemLateral": 20,
  "h1Tamanho": 28,
  "h2Tamanho": 22,
  "h3Tamanho": 18,
  "overrides": [
    { "id": "uuid", "referenciaNo": "img-017", "tipo": "imagem",
      "alinhamento": "centralizado", "ordem": 1, "stale": false }
  ],
  "atualizadoEm": "2026-08-25T14:40:00Z",
  "materialized": true
}
```

- Typography bounds are in §7.2. In the MVP every override has `tipo = imagem`.
- On write (`PUT`) each override supplies `referenciaNo`, `tipo`, `alinhamento` and `ordem`
  (`id` is assigned by the server). On read, `stale` flags overrides whose `referenciaNo` no
  longer resolves in the current content tree.
- The publication service receives the same field set without `materialized`/`stale`, and only
  non-stale overrides.

### 6.3 `LayoutOverride` (child of `ConfiguracaoLayout`)

```json
{ "id": "uuid", "referenciaNo": "img-017", "tipo": "imagem",
  "alinhamento": "centralizado", "ordem": 1, "stale": false }
```

- `referenciaNo` is a read reference to a node in the import service's content tree.
- `tipo` is `imagem` or `em-branco`; `em-branco` is reserved and rejected on write.
- `alinhamento` is one of `full`, `centralizado`, `junto-esquerda`, `junto-direita`; nullable only
  for `em-branco`.
- `ordem` is the position in the page sequence (integer ≥ 0).
- No máximo um override por referenciaNo; duplicado → 422.

### 6.4 `PreviewContext`

```json
{
  "projetoId": "uuid",
  "manuscrito": {
    "manuscritoId": "uuid",
    "estrutura": [ "read-only content tree nodes (chapters, paragraphs, image nodes)" ]
  },
  "layout": { "…": "ConfiguracaoLayout §6.2 with only non-stale overrides" },
  "staleOverrides": [ "LayoutOverride[] whose referenciaNo no longer resolves" ]
}
```

`manuscrito.estrutura` comes from the import service and is never copied or modified.

---

## 7. Validation and bounds

### 7.1 Required metadata

`titulo`, `autor` and `idioma` are required; `isbn`, `categoria` and the cover are optional. An
`idioma` outside `pt`, `en`, `es`, `fr` is rejected with `400`.

### 7.2 Layout bounds

| Field | Type | Bound | Default |
|---|---|---|---|
| `fonteCorpoFamilia` | enum | `serif` \| `sans-serif` | `serif` |
| `fonteCorpoTamanho` | int (px) | 12 – 20 | 12 |
| `espacamentoLinha` | decimal | 1.2 – 2.0 | 1.5 |
| `margemLateral` | int (mm) | 10 – 40 | 20 |
| `h1Tamanho` | int (px) | 14 – 48 | 28 |
| `h2Tamanho` | int (px) | 14 – 48 | 22 |
| `h3Tamanho` | int (px) | 14 – 48 | 18 |

Any value outside its bound is rejected with `400`. Heading sizes must satisfy
`h1Tamanho ≥ h2Tamanho ≥ h3Tamanho`.

### 7.3 Parameters the ePub stylesheet honours

- Typography and margins: `fonteCorpoFamilia`, `fonteCorpoTamanho`, `espacamentoLinha`,
  `margemLateral`, `h1Tamanho`, `h2Tamanho`, `h3Tamanho`.
- Per image: `LayoutOverride.alinhamento` for `tipo = imagem`.
- Not honoured in the MVP: blank-page inserts, rendered snapshots, per-page pixel layout.
