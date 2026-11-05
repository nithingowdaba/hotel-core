# Frontend dependency audit notes

Audit run against the pinned frontend lockfile on 2026-11-05:

```text
2 moderate vulnerabilities, 0 high, 0 critical
Affected packages: react-router and react-router-dom 6.30.6
Patched version reported: react-router-dom 7.18.0 or later (npm suggests 7.18.5)
```

No patched React Router 6 release is available in the advisory metadata. The project requires `react-router-dom` v6, so it remains pinned to 6.30.6. Recheck the v6 release line before upgrading; otherwise plan a deliberate v7 migration with route-guard and customer-flow regression testing.

## Advisories

- [GHSA-wrjc-x8rr-h8h6 / CVE-2026-53669](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6): attacker-controlled paths passed to React Router `<Link>` or `useNavigate` can be reinterpreted as external navigations when backslashes are involved. The customer app uses `Link` and navigation APIs, but app-controlled destinations use fixed routes or numeric IDs from API records. The only free-form return path is `?next=`, which is passed through `safeNext` and rejects backslashes, protocol-relative paths, schemes, and encoded traversal patterns. We do not intentionally pass arbitrary user-entered URLs to navigation APIs. This reduces the relevant input path, but does not replace updating the router when a compatible patch is available.
- [GHSA-337j-9hxr-rhxg / CVE-2026-53666](https://github.com/advisories/GHSA-337j-9hxr-rhxg): constructor injection while deserializing errors during server-side rendering hydration. The advisory says it applies to Framework Mode and Data Mode applications doing manual SSR/hydration. This app is a client-rendered Vite SPA: it does not perform SSR or hydrate server-rendered React Router errors, so that affected feature is not used.
