package com.abu.server;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
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

    private record SerializationSample(LocalDate calendarDate, Instant savedAt, UUID id) {
    }
}
