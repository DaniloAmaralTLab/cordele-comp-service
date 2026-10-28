# API Contract — imp-service (Importação)

Base path: `/api/v1/imp`.

The import service turns an uploaded DOCX/Markdown file into an immutable `Manuscrito` with a
structured content tree. Parsing happens inside the upload request: the `POST` returns the fully
parsed manuscript, and the `GET` routes are plain reads (reload, deep link), not status polling.

---

## 1. Conventions

- Media type: `application/json` for responses; `multipart/form-data` for the upload.
- IDs: UUID v4, server-generated.
- Timestamps: RFC 3339 / ISO-8601 UTC (`criadoEm`).
- Errors: RFC 7807 `application/problem+json` (see §5).
- Manuscripts are immutable: each upload creates a new one.

## 2. Authentication, authorization, tenancy

- Auth: OAuth2 Bearer JWT (`Authorization: Bearer <token>`). Unauthenticated requests get `401`.
- Scopes: `imp:write` (upload), `imp:read` (read manuscripts and content tree).
- Tenant: the owning empresa comes from the JWT claim, never from the path, query or body. A
  `manuscritoId` or `projetoId` from another empresa returns `404`.

## 3. Headers

| Header | Direction | Notes |
|---|---|---|
| `Authorization: Bearer <jwt>` | request | required on every endpoint |
| `X-Correlation-Id` | request (optional) / response (always) | propagated to logs; generated if absent |
| `Content-Type: multipart/form-data` | request | upload only |
| `Content-Type: application/problem+json` | response | error responses |

---

## 4. Resources

### 4.1 `POST /api/v1/imp/manuscripts` — upload and parse

Uploads a DOCX/Markdown file, parses it, persists the manuscript and returns it in the same
response.

Scope `imp:write`. Multipart parts:

| Part | Type | Required | Notes |
|---|---|---|---|
| `file` | binary | yes | `.docx` or `.md`; at most 50 MB (52428800 bytes) |
| `projetoId` | text (UUID) | one of the two | attach to an existing project |
| `projetoTitulo` | text | one of the two | create the project and upload in one step |

Success `201 Created` with `ManuscritoDetail` (§6.1) and `Location: /api/v1/imp/manuscripts/{id}`.
Regions the parser cannot structure are kept verbatim as unparsed segments; the upload still
succeeds and reports `trechosNaoParseados`.

### 4.2 `GET /api/v1/imp/manuscripts/{manuscritoId}` — read one manuscript

Scope `imp:read`. Success `200 OK` with `ManuscritoDetail` (§6.1). Unknown id in the active
empresa: `404`.

### 4.3 `GET /api/v1/imp/manuscripts/{manuscritoId}/estrutura` — content tree only

Returns only the content tree (it may be large).

Scope `imp:read`. Success `200 OK` with `ContentTree` (§6.2). Unknown id: `404`.

### 4.4 `GET /api/v1/imp/projetos/{projetoId}/manuscritos` — import history

Lists the manuscripts imported into a project, newest first (possibly empty).

Scope `imp:read`. Success `200 OK` with `ManuscritoSummary[]` (§6.4). Unknown project or one
from another empresa: `404`.

---

## 5. Errors (RFC 7807)

| `type` (URN) | HTTP | When |
|---|---|---|
| `urn:cordele:imp:unsupported-format` | 415 | file is not docx/markdown |
| `urn:cordele:imp:file-too-large` | 413 | file > 50 MB |
| `urn:cordele:imp:invalid-project-binding` | 400 | neither or both of projetoId, projetoTitulo |
| `urn:cordele:imp:projeto-not-found` | 422 | projetoId does not exist in the active empresa |
| `urn:cordele:imp:parse-failed` | 422 | file unreadable / irrecoverable parse error |
| `urn:cordele:imp:validation` | 400 | malformed request |
| `urn:cordele:imp:unauthorized` | 401 | missing/invalid token |
| `urn:cordele:imp:forbidden` | 403 | valid token lacking the required scope |
| `urn:cordele:imp:not-found` | 404 | manuscritoId/projetoId not in active empresa |

Example:

```json
{
  "type": "urn:cordele:imp:not-found",
  "title": "Manuscript not found",
  "status": 404,
  "detail": "No manuscript 2f1c... in the active empresa.",
  "instance": "/api/v1/imp/manuscripts/2f1c...",
  "traceId": "8b1f...c2"
}
```

---

## 6. Schemas

### 6.1 `ManuscritoDetail`

```json
{
  "id": "uuid",
  "projetoId": "uuid",
  "nomeArquivo": "livro-de-cordel.docx",
  "formato": "docx",
  "status": "imported",
  "totalCapitulos": 12,
  "totalImagens": 5,
  "trechosNaoParseados": 2,
  "tamanhoBytes": 8421000,
  "estrutura": { "...": "ContentTree, see §6.2" },
  "criadoEm": "2026-08-24T14:31:46Z"
}
```

`formato` is `docx` or `markdown`. `status` is always `imported` today (`parsing` and
`import_failed` are reserved).

### 6.2 `ContentTree`

The shape of `estrutura`: an ordered list of chapters. Every node has an `id` that is unique
within the tree and an integer `order` (0-based, contiguous) among its siblings.

```json
{
  "schemaVersion": "1.0",
  "formato": "docx",
  "chapters": [
    {
      "id": "ch-1",
      "order": 0,
      "title": "Capítulo I — A partida",
      "blocks": [ /* chapter-level blocks before the first section */ ],
      "sections": [
        {
          "id": "sec-1-1",
          "order": 0,
          "title": "A carta",
          "blocks": [ /* Block[] */ ]
        }
      ]
    }
  ]
}
```

A `Block` is discriminated by `type`:

```json
// Paragraph — author text, preserved verbatim
{ "type": "paragraph", "id": "p-14", "order": 3,
  "text": "Era uma vez, no sertão...",
  "runs": [ { "text": "Era uma vez, no sertão...", "marks": ["italic"] } ] }

// Image — extracted (DOCX) or referenced (Markdown), stored by key
{ "type": "image", "id": "img-2", "order": 4,
  "storageKey": "emp_aetos/manuscritos/<id>/img-2.png",
  "mime": "image/png", "alt": "Mapa do sertão", "originalName": "mapa.png" }

// UnparsedSegment — preserved verbatim, never dropped
{ "type": "unparsed", "id": "u-1", "order": 7,
  "rawContent": "<w:tbl>...</w:tbl>",
  "reason": "complex_table",
  "sourceLocation": { "kind": "docx", "paragraphIndex": 212, "styleName": "TableGrid" } }
```

- Paragraph text is kept exactly as authored. `runs` is optional; when present, the
  concatenation of `runs[].text` equals `text`. Marks are `bold`, `italic`, `underline`,
  `strikethrough`, `code`, `superscript`, `subscript`.
- Anything the parser cannot structure becomes an unparsed node in document order, so the
  tree accounts for the whole source.

### 6.3 Unparsed-segment reasons

| `reason` | Meaning |
|---|---|
| `complex_table` | table structure beyond simple grids |
| `math_equation` | OMML / LaTeX / MathML equation |
| `nested_footnote` | nested or cross-referenced footnotes |
| `unknown_docx_style` | a DOCX style outside the known style map |
| `unsupported_markup` | Markdown/HTML construct outside the supported subset |
| `embedded_object` | OLE object, chart, SmartArt, embedded file |
| `other` | anything else (still carries rawContent) |

`sourceLocation` is `{ "kind": "docx", "paragraphIndex": 212, "styleName": "TableGrid" }` for DOCX
or `{ "kind": "markdown", "line": 88, "column": 1 }` for Markdown.

### 6.4 `ManuscritoSummary`

```json
{ "id": "uuid", "projetoId": "uuid", "nomeArquivo": "...", "formato": "docx",
  "status": "imported", "totalCapitulos": 12, "totalImagens": 5,
  "trechosNaoParseados": 2, "criadoEm": "2026-08-24T14:31:46Z" }
```
