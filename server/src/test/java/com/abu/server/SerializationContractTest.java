package com.abu.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.abu.server.common.api.ListResponse;
import com.abu.server.common.api.PageResponse;
import com.abu.server.common.api.PatchField;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;

@JsonTest
class SerializationContractTest {
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void serializesCalendarDatesUtcInstantsAndUuids() throws Exception {
        UUID id = UUID.fromString("7f83cb1e-70e9-4bfe-94e8-0a88af67992d");
        SerializationSample sample = new SerializationSample(
                LocalDate.of(2026, 8, 19), Instant.parse("2026-08-19T04:05:06Z"), id);

        JsonNode json = objectMapper.readTree(objectMapper.writeValueAsString(sample));

        assertThat(json.get("calendarDate").asText()).isEqualTo("2026-08-19");
        assertThat(json.get("savedAt").asText()).isEqualTo("2026-08-19T04:05:06Z");
        assertThat(json.get("id").asText()).isEqualTo(id.toString());
    }

    @Test
    void patchFieldDistinguishesAbsentExplicitNullAndValue() throws Exception {
        PatchSample absent = objectMapper.readValue("{}", PatchSample.class);
        PatchSample explicitNull = objectMapper.readValue("{\"displayName\":null}", PatchSample.class);
        PatchSample supplied = objectMapper.readValue("{\"displayName\":\"Abu\"}", PatchSample.class);

        assertThat(absent.displayName().provided()).isFalse();
        assertThat(explicitNull.displayName().provided()).isTrue();
        assertThat(explicitNull.displayName().value()).isNull();
        assertThat(supplied.displayName().provided()).isTrue();
        assertThat(supplied.displayName().value()).isEqualTo("Abu");
    }

    @Test
    void unknownRequestFieldsAreRejected() {
        assertThatThrownBy(() -> objectMapper.readValue(
                "{\"displayName\":\"Abu\",\"unexpected\":true}", PatchSample.class))
                .isInstanceOf(UnrecognizedPropertyException.class);
    }

    @Test
    void listAndPageResponsesUseStableEnvelopes() throws Exception {
        JsonNode list = objectMapper.readTree(objectMapper.writeValueAsString(
                new ListResponse<>(List.of("one"))));
        JsonNode page = objectMapper.readTree(objectMapper.writeValueAsString(
                new PageResponse<>(List.of("one"), 1, 50, 120)));

        assertThat(list.isArray()).isFalse();
        assertThat(list.get("items").isArray()).isTrue();
        assertThat(page.get("page").asInt()).isEqualTo(1);
        assertThat(page.get("size").asInt()).isEqualTo(50);
        assertThat(page.get("total").asLong()).isEqualTo(120);
    }

    @Test
    void machineReadableConventionSummaryMatchesLockedDefaults() throws Exception {
        try (InputStream resource = SerializationContractTest.class
                .getResourceAsStream("/api-conventions.json")) {
            assertThat(resource).isNotNull();
            JsonNode contract = objectMapper.readTree(resource);
            assertThat(contract.get("basePath").asText()).isEqualTo("/api/v1");
            assertThat(contract.at("/successResponses/page/defaultPage").asInt()).isEqualTo(1);
            assertThat(contract.at("/successResponses/page/defaultSize").asInt()).isEqualTo(50);
            assertThat(contract.at("/successResponses/page/maximumSize").asInt()).isEqualTo(200);
            assertThat(contract.at("/httpStatuses/validation").asInt()).isEqualTo(422);
            assertThat(contract.at("/concurrency/staleCode").asText()).isEqualTo("STALE_VERSION");
            assertThat(contract.at("/database/globalSoftDelete").asBoolean()).isFalse();
            assertThat(contract.get("openApi").asText()).isEqualTo("deferred");
        }
    }

    private record SerializationSample(LocalDate calendarDate, Instant savedAt, UUID id) {
    }

    private record PatchSample(PatchField<String> displayName) {
        private PatchSample {
            displayName = PatchField.orAbsent(displayName);
        }
    }
}
