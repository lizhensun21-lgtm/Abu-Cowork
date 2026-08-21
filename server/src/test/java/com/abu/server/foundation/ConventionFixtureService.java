package com.abu.server.foundation;

import com.abu.server.common.exception.StaleVersionException;
import java.time.Instant;
import java.util.UUID;
import org.springframework.transaction.annotation.Transactional;

public class ConventionFixtureService {
    private final ConventionFixtureMapper mapper;

    public ConventionFixtureService(ConventionFixtureMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional
    public ConventionFixtureRecord create(UUID id, String value) {
        Instant now = Instant.now();
        mapper.insert(id, value, now, now);
        return require(id);
    }

    @Transactional
    public ConventionFixtureRecord update(UUID id, String value, long expectedVersion) {
        if (mapper.update(id, value, Instant.now(), expectedVersion) == 0) {
            throw new StaleVersionException("Fixture was changed by another transaction");
        }
        return require(id);
    }

    @Transactional
    public void updateThenFail(UUID id, String value, long expectedVersion) {
        if (mapper.update(id, value, Instant.now(), expectedVersion) == 0) {
            throw new StaleVersionException("Fixture was changed by another transaction");
        }
        throw new IllegalStateException("test-only rollback trigger");
    }

    @Transactional(readOnly = true)
    public ConventionFixtureRecord find(UUID id) {
        return require(id);
    }

    private ConventionFixtureRecord require(UUID id) {
        ConventionFixtureRecord record = mapper.find(id);
        if (record == null) {
            throw new IllegalStateException("Test fixture was not found: " + id);
        }
        return record;
    }
}
