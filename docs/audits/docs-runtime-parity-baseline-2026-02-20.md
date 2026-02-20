# Docs Runtime Parity Baseline (2026-02-20)

## Command Results

### hushh-webapp: verify:routes
    OK: route contracts verified

### hushh-webapp: verify:parity
    OK: Required Next.js proxy routes exist
    OK: TS plugin registration names present
    OK: iOS registration verification list contains all required plugin names
    OK: Android plugin registrations and @CapacitorPlugin names look consistent
    OK: HushhVault multi-wrapper parity: required methods present across TS/iOS/Android
    OK: HushhKeychain biometric parity: required methods present across TS/iOS/Android
    OK: Kai streaming parity: required methods present across TS/iOS/Android
    OK: WorldModel critical parity: required methods present across TS/iOS/Android
    
    Parity check PASSED

### hushh-webapp: verify:design-system
    
    OK: design system usage verified

### consent-protocol: pytest
    ============================= test session starts ==============================
    platform darwin -- Python 3.13.7, pytest-9.0.2, pluggy-1.6.0
    rootdir: /Users/kushaltrivedi/Documents/GitHub/hushh-research/consent-protocol
    configfile: pyproject.toml
    testpaths: tests
    plugins: anyio-4.12.1, langsmith-0.6.7, asyncio-1.3.0, cov-7.0.0
    asyncio: mode=Mode.AUTO, debug=False, asyncio_default_fixture_loop_scope=function, asyncio_default_test_loop_scope=function
    collected 205 items
    
    tests/agents/kai/test_renaissance_agent.py .............                 [  6%]
    tests/quality/test_architecture_compliance.py .................          [ 14%]
    tests/quality/test_byok_encryption.py .............                      [ 20%]
    tests/quality/test_kai_route_auth_compliance.py ..                       [ 21%]
    tests/quality/test_rate_limiting.py ...........                          [ 27%]
    tests/quality/test_revocation_persistence.py .......                     [ 30%]
    tests/services/test_portfolio_import_relevance.py ...                    [ 32%]
    tests/services/test_portfolio_import_service_rich_parser.py ..           [ 33%]
    tests/services/test_portfolio_parser.py .............                    [ 39%]
    tests/test_adk_a2a_compliance_script.py .                                [ 40%]
    tests/test_db_client_fail_fast.py ..                                     [ 40%]
    tests/test_eval_portfolio_stream_quality_script.py .                     [ 41%]
    tests/test_fetchers_provider_priority.py ...                             [ 42%]
    tests/test_granular_scopes.py ...................                        [ 52%]
    tests/test_hushh_adk_foundation.py ....                                  [ 54%]
    tests/test_kai_analyze.py ......                                         [ 57%]
    tests/test_kai_auth_matrix.py .........................................  [ 77%]
    tests/test_kai_llm_provider_contract.py .                                [ 77%]
    tests/test_kai_onboarding_optional.py ...                                [ 79%]
    tests/test_kai_optimize_realtime_contract.py ..                          [ 80%]
    tests/test_kai_portfolio_holdings_fallback.py ........                   [ 83%]
    tests/test_kai_stream_contract.py ..........                             [ 88%]
    tests/test_portfolio_stream_quality_rules.py .....                       [ 91%]
    tests/test_token.py .....                                                [ 93%]
    tests/test_trust.py ...                                                  [ 95%]
    tests/test_vault.py .....                                                [ 97%]
    tests/test_vault_keys_metadata.py .....                                  [100%]
    
    =============================== warnings summary ===============================
    tests/services/test_portfolio_parser.py::TestPortfolioParser::test_parse_generic_csv
    tests/services/test_portfolio_parser.py::TestPortfolioParser::test_parse_csv_with_currency_formatting
    tests/services/test_portfolio_parser.py::TestPortfolioParser::test_parse_csv_with_negative_values
    tests/services/test_portfolio_parser.py::TestPortfolioParser::test_identify_losers
    tests/services/test_portfolio_parser.py::TestPortfolioParser::test_get_portfolio_summary
    tests/services/test_portfolio_parser.py::TestPortfolioParser::test_empty_csv
    tests/services/test_portfolio_parser.py::TestPortfolioParser::test_csv_without_ticker_column
      /Users/kushaltrivedi/Documents/GitHub/hushh-research/consent-protocol/hushh_mcp/services/portfolio_parser.py:63: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
        self.parsed_at = datetime.utcnow()
    
    tests/test_kai_analyze.py::TestAnalyzeRequiresVaultOwnerToken::test_analyze_valid_token_succeeds
      /Users/kushaltrivedi/Documents/GitHub/hushh-research/consent-protocol/hushh_mcp/agents/kai/orchestrator.py:109: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
        start_time = datetime.utcnow()
    
    tests/test_trust.py::test_signature_tampering
      /Users/kushaltrivedi/Documents/GitHub/hushh-research/consent-protocol/tests/test_trust.py:40: PydanticDeprecatedSince20: The `copy` method is deprecated; use `model_copy` instead. See the docstring of `BaseModel.copy` for details about how to handle `include` and `exclude`. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
        tampered = link.copy(update={"signature": "bad_signature_here"})
    
    tests/test_vault.py::test_decryption_fails_with_tampered_data
      /Users/kushaltrivedi/Documents/GitHub/hushh-research/consent-protocol/tests/test_vault.py:71: PydanticDeprecatedSince20: The `copy` method is deprecated; use `model_copy` instead. See the docstring of `BaseModel.copy` for details about how to handle `include` and `exclude`. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
        corrupted = encrypted.copy(
    
    tests/test_vault.py::test_encrypted_payload_structure
      /Users/kushaltrivedi/Documents/GitHub/hushh-research/consent-protocol/tests/test_vault.py:86: PydanticDeprecatedSince20: The `dict` method is deprecated; use `model_dump` instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
        assert "ciphertext" in encrypted.dict()
    
    tests/test_vault.py::test_encrypted_payload_structure
      /Users/kushaltrivedi/Documents/GitHub/hushh-research/consent-protocol/tests/test_vault.py:87: PydanticDeprecatedSince20: The `dict` method is deprecated; use `model_dump` instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
        assert "iv" in encrypted.dict()
    
    tests/test_vault.py::test_encrypted_payload_structure
      /Users/kushaltrivedi/Documents/GitHub/hushh-research/consent-protocol/tests/test_vault.py:88: PydanticDeprecatedSince20: The `dict` method is deprecated; use `model_dump` instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
        assert "tag" in encrypted.dict()
    
    -- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
    ====================== 205 passed, 13 warnings in 22.57s =======================

## Canonical Route Inventory

### routes.ts
    /**
     * Central route contract for the web + Capacitor app.
     * Keep every app-level navigation target here to avoid drift.
     */
    
    export const ROUTES = {
      HOME: "/",
      LOGIN: "/login",
      LOGOUT: "/logout",
      PRIVACY: "/privacy",
      DOCS: "/docs",
      PROFILE: "/profile",
      CONSENTS: "/consents",
      AGENT_NAV: "/agent-nav",
      ONBOARDING_PREFERENCES_LEGACY: "/onboarding/preferences",
      KAI_HOME: "/kai",
      KAI_ONBOARDING: "/kai/onboarding",
      KAI_IMPORT: "/kai/import",
      KAI_DASHBOARD: "/kai/dashboard",
    } as const;
    
    export const LEGACY_ROUTE_FALLBACKS = {
      DASHBOARD_ROOT: "/dashboard",
      DASHBOARD_KAI: "/dashboard/kai",
      DASHBOARD_KAI_WILDCARD: "/dashboard/kai/:path*",
      DASHBOARD_DOMAIN_WILDCARD: "/dashboard/domain/:path*",
      DASHBOARD_AGENT_NAV: "/dashboard/agent-nav",
    } as const;
    
    export function isKaiOnboardingRoute(pathname: string): boolean {
      return (
        pathname === ROUTES.KAI_ONBOARDING ||
        pathname.startsWith(`${ROUTES.KAI_ONBOARDING}/`)
      );
    }
    
    export function isPublicRoute(pathname: string): boolean {
      return (
        pathname === ROUTES.HOME ||
        pathname === ROUTES.LOGIN ||
        pathname === ROUTES.ONBOARDING_PREFERENCES_LEGACY ||
        pathname === ROUTES.DOCS ||
        pathname === ROUTES.LOGOUT ||
        pathname === ROUTES.PRIVACY ||
        pathname === ROUTES.PROFILE
      );
    }

### app/**/page.tsx
- `hushh-webapp/app/agent-nav/page.tsx`
- `hushh-webapp/app/api-docs/page.tsx`
- `hushh-webapp/app/chat/page.tsx`
- `hushh-webapp/app/consents/page.tsx`
- `hushh-webapp/app/dashboard/agent-nav/page.tsx`
- `hushh-webapp/app/dashboard/domain/[...path]/page.tsx`
- `hushh-webapp/app/dashboard/kai/[...path]/page.tsx`
- `hushh-webapp/app/dashboard/kai/page.tsx`
- `hushh-webapp/app/dashboard/page.tsx`
- `hushh-webapp/app/kai/dashboard/analysis/page.tsx`
- `hushh-webapp/app/kai/dashboard/losers-analysis/page.tsx`
- `hushh-webapp/app/kai/dashboard/manage/page.tsx`
- `hushh-webapp/app/kai/dashboard/page.tsx`
- `hushh-webapp/app/kai/dashboard/portfolio-health/page.tsx`
- `hushh-webapp/app/kai/import/page.tsx`
- `hushh-webapp/app/kai/onboarding/page.tsx`
- `hushh-webapp/app/kai/page.tsx`
- `hushh-webapp/app/login/page.tsx`
- `hushh-webapp/app/logout/page.tsx`
- `hushh-webapp/app/onboarding/preferences/page.tsx`
- `hushh-webapp/app/page.tsx`
- `hushh-webapp/app/profile/page.tsx`

## Documentation Inventory

### docs/
- `docs/.DS_Store`
- `docs/audits/2026-02-16-regulatory-readiness-audit.md`
- `docs/audits/docs-runtime-parity-baseline-2026-02-20.md`
- `docs/audits/plugins-parity.md`
- `docs/guides/getting-started.md`
- `docs/guides/mobile.md`
- `docs/guides/native_streaming.md`
- `docs/guides/new-feature.md`
- `docs/guides/subtree-sync.md`
- `docs/project_context_map.md`
- `docs/readme.md`
- `docs/reference/api-contracts.md`
- `docs/reference/architecture.md`
- `docs/reference/cache-coherence.md`
- `docs/reference/ci.md`
- `docs/reference/data-provenance-ledger.md`
- `docs/reference/design-system.md`
- `docs/reference/env-and-secrets.md`
- `docs/reference/frontend-pattern-catalog.md`
- `docs/reference/kai-accuracy-contract.md`
- `docs/reference/kai-v6-execution-plan.md`
- `docs/reference/route_contracts.md`
- `docs/reference/streaming-contract.md`
- `docs/reference/streaming-implementation-guide.md`
- `docs/reference/vertex-ai-streaming-notes.md`
- `docs/vision/README.md`
- `docs/vision/kai/README.md`
- `docs/vision/kai/data/investor-master-list.md`
- `docs/vision/kai/data/investor_profiles_sample.json`

### consent-protocol/docs/
- `consent-protocol/docs/README.md`
- `consent-protocol/docs/app-review-mode-config.md`
- `consent-protocol/docs/manifesto.md`
- `consent-protocol/docs/mcp-setup.md`
- `consent-protocol/docs/monorepo-integration.md`
- `consent-protocol/docs/reference/agent-development.md`
- `consent-protocol/docs/reference/consent-protocol.md`
- `consent-protocol/docs/reference/env-vars.md`
- `consent-protocol/docs/reference/fcm-notifications.md`
- `consent-protocol/docs/reference/kai-agents.md`
- `consent-protocol/docs/reference/world-model.md`

### hushh-webapp/docs/
- `hushh-webapp/docs/kai-analysis-layout-and-review-mode.md`
- `hushh-webapp/docs/plugin-api-reference.md`
