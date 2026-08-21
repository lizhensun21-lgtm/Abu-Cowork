package com.abu.server.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import com.abu.server.health.HealthResponse;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ServerFoundationIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("abu_pm_test")
            .withUsername("abu_pm_test")
            .withPassword("abu_pm_test_only");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private Flyway flyway;
    @Autowired
    private FoundationFixtureMapper mapper;
    @Autowired
    private TransactionTemplate transactionTemplate;
    @Autowired
    private TestRestTemplate restTemplate;
    @LocalServerPort
    private int port;

    @BeforeEach
    void createTestOnlyFixture() {
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS f1a_test_fixture (id UUID PRIMARY KEY, value TEXT NOT NULL)");
        jdbcTemplate.execute("TRUNCATE TABLE f1a_test_fixture");
    }

    @Test
    void contextPostgresFlywayAndHealthAreUp() {
        assertThat(jdbcTemplate.queryForObject("SELECT 1", Integer.class)).isEqualTo(1);
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("1");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE success", Integer.class)).isPositive();

        HealthResponse response = restTemplate.getForObject(
                "http://127.0.0.1:" + port + "/api/v1/health", HealthResponse.class);
        assertThat(response).isNotNull();
        assertThat(response.status()).isEqualTo("UP");
        assertThat(response.database()).isEqualTo("UP");
        assertThat(response.version()).isNotBlank();
    }

    @Test
    void myBatisUsesTheRealPostgresTransactionAndRollsBack() {
        UUID id = UUID.randomUUID();

        transactionTemplate.executeWithoutResult(status -> {
            mapper.insert(id, "rollback-check");
            assertThat(mapper.exists(id)).isTrue();
            status.setRollbackOnly();
        });

        assertThat(mapper.exists(id)).isFalse();
    }
}
