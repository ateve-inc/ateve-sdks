package ai.ateve;

/** Golden wire fixtures, mirroring the examples in docs/sdk/openapi.yaml. */
final class Fixtures {

    private Fixtures() {
    }

    static final String GOLDEN_RESPONSE =
            "{"
            + "\"id\":\"srch_01J9ZK3V6XQ8\","
            + "\"created\":1783776000,"
            + "\"latency_ms\":412,"
            + "\"query\":{\"original\":\"climate policy analysis\",\"effective\":\"climate policy analysis 2026\",\"auto_tuned\":{\"freshness_boost\":true}},"
            + "\"answer\":{\"content\":\"Recent climate policy has focused on...\",\"citations\":["
            + "{\"url\":\"https://reuters.com/article/abc\",\"title\":\"New climate framework announced\",\"start_index\":0,\"end_index\":42,\"quote\":\"Recent climate policy has focused on\"}]},"
            + "\"results\":[{"
            + "\"id\":\"res_001\","
            + "\"title\":\"New climate framework announced\","
            + "\"url\":\"https://reuters.com/article/abc\","
            + "\"display_url\":\"reuters.com/article/abc\","
            + "\"site_name\":\"Reuters\","
            + "\"language\":\"en\","
            + "\"published_at\":\"2026-06-12T08:30:00.000Z\","
            + "\"score\":0.94,"
            + "\"snippet\":\"The framework introduces...\","
            + "\"summary\":\"A one-paragraph summary of the article.\","
            + "\"highlights\":[\"framework introduces\",\"carbon pricing\"],"
            + "\"favicon\":\"https://reuters.com/favicon.ico\","
            + "\"images\":[{\"url\":\"https://reuters.com/img/1.jpg\",\"width\":1200,\"height\":800,\"alt\":\"Press conference\"}],"
            + "\"is_safe\":true}],"
            + "\"news\":[],"
            + "\"images\":[],"
            + "\"videos\":[],"
            + "\"total_estimated_matches\":128000,"
            + "\"usage\":{\"credits\":3,\"breakdown\":{\"search\":1,\"rerank\":1,\"answer\":1}}"
            + "}";

    static final String ERROR_401 =
            "{\"id\":\"req_01J9ZK3V6XQ9\",\"error\":{"
            + "\"code\":\"missing_api_key\","
            + "\"message\":\"Authorization header must be 'Bearer <api_key>'\","
            + "\"type\":\"authentication_error\"}}";

    static final String ERROR_429 =
            "{\"id\":\"req_01J9ZK3V6XQB\",\"error\":{"
            + "\"code\":\"rate_limit_exceeded\","
            + "\"message\":\"Rate limit exceeded (qps). Retry after 1s.\","
            + "\"type\":\"rate_limit_error\"}}";

    static final String ERROR_400 =
            "{\"id\":\"req_01J9ZK3V6XQ8\",\"error\":{"
            + "\"code\":\"invalid_date_range\","
            + "\"message\":\"date_range must be a preset or YYYY-MM-DD[..YYYY-MM-DD]\","
            + "\"param\":\"date_range\","
            + "\"type\":\"invalid_request_error\"}}";
}
