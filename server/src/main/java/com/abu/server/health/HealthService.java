package com.abu.server.health;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Optional;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.info.BuildProperties;
import org.springframework.stereotype.Service;

@Service
public class HealthService {
    private static final Logger LOGGER = LoggerFactory.getLogger(HealthService.class);
    private final DataSource dataSource;
    private final Optional<BuildProperties> buildProperties;

    public HealthService(DataSource dataSource, Optional<BuildProperties> buildProperties) {
        this.dataSource = dataSource;
        this.buildProperties = buildProperties;
    }

    public HealthResponse health() {
        String database = databaseIsAvailable() ? "UP" : "DOWN";
        String status = "UP".equals(database) ? "UP" : "DEGRADED";
        String version = buildProperties.map(BuildProperties::getVersion).orElse("development");
        return new HealthResponse(status, database, version);
    }

    private boolean databaseIsAvailable() {
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid(2);
        } catch (SQLException exception) {
            LOGGER.warn("Database health check failed: {}", exception.getMessage());
            return false;
        }
    }
}
