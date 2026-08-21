package com.abu.server.foundation;

import java.time.Instant;
import java.util.UUID;

public record ConventionFixtureRecord(
        UUID id,
        String value,
        Instant createdAt,
        Instant updatedAt,
        long version) {
}
