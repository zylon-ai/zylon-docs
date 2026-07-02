---
name: zylon-api-docs
description: Use when editing Zylon API documentation, endpoint pages, OpenAPI-derived docs, or developer manual pages that describe request parameters, query parameters, request bodies, responses, or endpoint navigation.
---

# Zylon API Docs

## Workflow

1. Check `api-reference/workspace.json` or the relevant OpenAPI source before changing endpoint parameters, request bodies, response fields, or supported actions.
2. Keep endpoint pages compact: examples may be visible, but parameter details must be inside accordions.
3. Update both English and Spanish pages when the section exists in both languages.
4. Remove deprecated pages from `docs.json`, overview cards, and internal links before deleting the file.
5. Validate with `python3 -m json.tool docs.json`, `git diff --check`, and a touched-page link scan.

## Endpoint Layout

Use accordions for endpoint detail blocks:

- Path/query parameters: `<Accordion title="Endpoint parameters">`
- Request bodies: include body fields in the same `Endpoint parameters` accordion unless the body is large enough to deserve a separate `<Accordion title="Request body">`.
- Responses: keep using `<Accordion title="Example response">`.

Each endpoint should expose parameters in a small table:

```md
<Accordion title="Endpoint parameters">
| Type | Name | Required | Notes |
| --- | --- | --- | --- |
| Path | `projectID` | Yes | Project identifier. |
| Query | `page_size` | No | Number of items per page. |
| Body | `name` | Yes | Display name. |
</Accordion>
```

For Spanish pages use `Parametros del endpoint` and `Si` for required fields to match the current ASCII-only style in the repo.

## Quality Rules

- Do not leave investigation/provenance wording from repo checks in user-facing docs.
- Do not document deprecated endpoints as active.
- Prefer product-facing names over internal implementation names unless the user explicitly asks for API-level detail.
- If an endpoint's query string appears in a curl example, the corresponding query parameters must be listed in an accordion nearby.
