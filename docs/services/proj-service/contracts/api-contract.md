# API Contract — proj-service (Projetos), excerpt

Base path: `/api/v1/proj`. Only the route composition depends on is listed here.

Auth: OAuth2 Bearer JWT (`Authorization: Bearer <token>`) is required; missing or invalid token
returns `401`. The empresa comes from the token, so a project from another empresa is reported
as not found. Errors use RFC 7807 `application/problem+json`.

## `GET /api/v1/proj/projetos/{id}` — read one project

Success `200 OK`:

```json
{
  "id": "uuid",
  "nome": "Romance das Cidades",
  "status": "em_composicao",
  "empresaId": "uuid",
  "criadoEm": "2026-08-24T14:31:46Z",
  "atualizadoEm": "2026-08-25T09:12:00Z"
}
```

Unknown id (or one from another empresa): `404` with type `urn:cordele:proj:not-found`.
