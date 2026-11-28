package ai.ateve;

import ai.ateve.errors.ApiResponseException;
import ai.ateve.errors.InvalidRequestException;
import ai.ateve.errors.ServerException;
import ai.ateve.models.ChoiceAnswer;
import ai.ateve.models.ChoiceQuestion;
import ai.ateve.models.DecisionRequest;
import ai.ateve.models.DecisionResponse;
import ai.ateve.models.NoulAnswer;
import ai.ateve.models.NoulQuestion;
import ai.ateve.models.ScoreAnswer;
import ai.ateve.models.ScoreQuestion;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ContentApiTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String URL = "https://example.org/page?lang=中文";

    private static AteveClient client(MockApi api) {
        return AteveClient.builder().baseUrl(api.baseUrl()).apiKey("test").build();
    }

    private static DecisionRequest decision() {
        Map<String, Object> choiceCriteria = new LinkedHashMap<>();
        choiceCriteria.put("below", List.of("amount < 100", 100));
        choiceCriteria.put("equal", null);
        Map<String, Object> noulCriteria = new LinkedHashMap<>();
        noulCriteria.put("true", null);
        noulCriteria.put("false", "Amount is at least 100");
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("amount", 75);
        state.put("signals", Arrays.asList(true, null));
        DecisionRequest request = DecisionRequest.builder()
                .state(state)
                .questions(Map.of(
                        "category", ChoiceQuestion.builder()
                                .instructions(Map.of("task", "Compare amount with 100"))
                                .criteria(choiceCriteria)
                                .build(),
                        "quality", ScoreQuestion.builder()
                                .criteria(List.of("Low", Map.of("label", "Medium"), List.of("High", true)))
                                .build(),
                        "approved", NoulQuestion.builder().criteria(noulCriteria).build()))
                .build();
        state.clear();
        choiceCriteria.clear();
        noulCriteria.clear();
        return request;
    }

    @Test
    void fetchPreservesMarkdownAndUsesOnePost() throws Exception {
        try (MockApi api = new MockApi("/v1/fetch")) {
            String fixture = Fixtures.load("fetch-response.json");
            api.enqueue(200, fixture);
            var response = client(api).fetch(URL);
            assertEquals("", response.title());
            assertEquals(JSON.readTree(fixture).get("content").asText(), response.content());
            assertEquals(JSON.valueToTree(Map.of("url", URL)), JSON.readTree(api.receivedBodies.get(0)));
            assertEquals(List.of("POST"), api.receivedMethods);
            assertEquals(List.of("Bearer test"), api.receivedAuthHeaders);
        }
    }

    @Test
    void decodesMixedAnswersAndPreservesJsonValuesInRequest() throws Exception {
        try (MockApi api = new MockApi("/v1/systemone")) {
            api.enqueue(200, Fixtures.load("decision-response.json"));
            DecisionResponse response = client(api).decisions().decideAsync(decision()).get();
            assertEquals("ateve-jev-v1", response.model());
            ChoiceAnswer choice = assertInstanceOf(ChoiceAnswer.class, response.answers().get("category"));
            assertEquals("below", choice.choice());
            ScoreAnswer score = assertInstanceOf(ScoreAnswer.class, response.answers().get("quality"));
            assertEquals(1.85, score.score());
            assertEquals(List.of("High", true), score.legend().get("2"));
            NoulAnswer noul = assertInstanceOf(NoulAnswer.class, response.answers().get("approved"));
            assertEquals(0.98, noul.noul());
            assertEquals(1077, response.usage().inputTokens());
            assertEquals(0, response.usage().outputTokens());
            assertEquals(JSON.readTree(Fixtures.load("decision-request.json")),
                    JSON.readTree(api.receivedBodies.get(0)));
            assertEquals(List.of("POST"), api.receivedMethods);
        }
    }

    @Test
    void listsModelAliasesWithAnAuthenticatedGet() throws Exception {
        try (MockApi api = new MockApi("/v1/models")) {
            api.enqueue(200, Fixtures.load("models-response.json"));
            var models = client(api).decisions().listModels().models();
            assertEquals("jev-latest", models.get(1).name());
            assertEquals("2026-10-02", models.get(1).releaseDate());
            assertEquals(List.of("GET"), api.receivedMethods);
            assertEquals(List.of(""), api.receivedBodies);
            assertEquals(List.of("Bearer test"), api.receivedAuthHeaders);
        }
    }

    @Test
    void preservesFetchErrorAndDecisionRetryMetadata() throws Exception {
        try (MockApi fetch = new MockApi("/v1/fetch"); MockApi jev = new MockApi("/v1/systemone")) {
            fetch.enqueue(403, "{\"error\":{\"code\":\"fetch_forbidden\",\"message\":\"Rejected\"}}",
                    Map.of("X-Request-Id", "req_fetch"));
            jev.enqueue(400, "{\"id\":\"req_budget\",\"error\":{\"code\":\"token_budget_exceeded\","
                    + "\"details\":{\"limit_tokens\":100}}}");
            jev.enqueue(502, "{\"error\":{\"code\":\"service_unavailable\"}}", Map.of("Retry-After", "4"));
            jev.enqueue(200, "{\"model\":\"ateve-jev-v1\",\"answers\":{\"q\":{\"type\":\"noul\"}},"
                    + "\"usage\":{\"input_tokens\":10,\"output_tokens\":0}}");

            InvalidRequestException rejected = assertThrows(InvalidRequestException.class,
                    () -> client(fetch).fetch(URL));
            assertEquals("fetch_forbidden", rejected.code());
            assertEquals("req_fetch", rejected.requestId());
            assertEquals("Rejected", rejected.getMessage());
            AteveClient client = client(jev);
            InvalidRequestException budget = assertThrows(InvalidRequestException.class,
                    () -> client.decisions().decide(decision()));
            assertEquals("token_budget_exceeded", budget.code());
            assertEquals("req_budget", budget.requestId());
            assertEquals(Map.of("limit_tokens", 100), budget.details());
            ServerException unavailable = assertThrows(ServerException.class,
                    () -> client.decisions().decide(decision()));
            assertEquals(4L, unavailable.retryAfterSeconds());
            assertThrows(ApiResponseException.class, () -> client.decisions().decide(decision()));
            assertEquals(1, fetch.hits());
            assertEquals(3, jev.hits());
        }
    }
}
