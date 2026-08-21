package com.abu.server.foundation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.abu.server.common.exception.StaleVersionException;
import com.abu.server.health.HealthResponse;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@ActiveProfiles({"test", "dev"})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(ServerFoundationIntegrationTest.ConventionTestConfiguration.class)
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
    private ConventionFixtureService conventionService;
    @Autowired
    private TestRestTemplate restTemplate;
    @LocalServerPort
    private int port;

    @BeforeEach
    void createTestOnlyFixture() {
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS f1a_test_fixture (id UUID PRIMARY KEY, value TEXT NOT NULL)");
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS abu.f1b_convention_fixture (
                    id UUID PRIMARY KEY,
                    value TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL,
                    version BIGINT NOT NULL DEFAULT 0
                )
                """);
        jdbcTemplate.execute("TRUNCATE TABLE f1a_test_fixture");
        jdbcTemplate.execute("TRUNCATE TABLE abu.f1b_convention_fixture");
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
    void developmentCorsAllowsCurrentElectronAndViteOrigins() {
        assertAllowedOrigin("null");
        assertAllowedOrigin("http://127.0.0.1:5173");
        assertAllowedOrigin("http://localhost:5173");
    }

    @Test
    void developmentCorsDoesNotAllowArbitraryOrigins() {
        HttpHeaders headers = new HttpHeaders();
        headers.setOrigin("https://untrusted.example");

        ResponseEntity<String> response = restTemplate.exchange(
                "http://127.0.0.1:" + port + "/api/v1/health",
                HttpMethod.GET,
                new HttpEntity<>(headers),
                String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getHeaders().getAccessControlAllowOrigin()).isNull();
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

    @Test
    void serviceOwnedTransactionCommitsWithCommonAuditFields() {
        UUID id = UUID.randomUUID();

        ConventionFixtureRecord record = conventionService.create(id, "created");
        ConventionFixtureRecord committed = conventionService.find(id);

        assertThat(record).isEqualTo(committed);
        assertThat(committed.id()).isEqualTo(id);
        assertThat(committed.createdAt()).isNotNull();
        assertThat(committed.updatedAt()).isNotNull();
        assertThat(committed.version()).isZero();
    }

    @Test
    void serviceExceptionRollsBackEveryMapperWrite() {
        UUID id = UUID.randomUUID();
        conventionService.create(id, "before");

        assertThatThrownBy(() -> conventionService.updateThenFail(id, "should-roll-back", 0))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("test-only rollback trigger");

        ConventionFixtureRecord record = conventionService.find(id);
        assertThat(record.value()).isEqualTo("before");
        assertThat(record.version()).isZero();
    }

    @Test
    void optimisticUpdateIncrementsVersionAndRejectsStaleVersion() {
        UUID id = UUID.randomUUID();
        conventionService.create(id, "v0");

        ConventionFixtureRecord updated = conventionService.update(id, "v1", 0);

        assertThat(updated.value()).isEqualTo("v1");
        assertThat(updated.version()).isEqualTo(1);
        assertThat(updated.updatedAt()).isAfterOrEqualTo(updated.createdAt());
        assertThatThrownBy(() -> conventionService.update(id, "stale", 0))
                .isInstanceOf(StaleVersionException.class);
        assertThat(conventionService.find(id)).isEqualTo(updated);
    }

    private void assertAllowedOrigin(String origin) {
        HttpHeaders headers = new HttpHeaders();
        headers.setOrigin(origin);
        headers.setAccessControlRequestMethod(HttpMethod.GET);
        headers.setAccessControlRequestHeaders(java.util.List.of("X-Trace-Id"));

        ResponseEntity<String> response = restTemplate.exchange(
                "http://127.0.0.1:" + port + "/api/v1/health",
                HttpMethod.OPTIONS,
                new HttpEntity<>(headers),
                String.class);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getAccessControlAllowOrigin()).isEqualTo(origin);
        assertThat(response.getHeaders().getAccessControlAllowMethods()).contains(HttpMethod.GET);
        assertThat(response.getHeaders().getAccessControlAllowHeaders()).contains("X-Trace-Id");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ConventionTestConfiguration {
        @Bean
        ConventionFixtureService conventionFixtureService(ConventionFixtureMapper mapper) {
            return new ConventionFixtureService(mapper);
        }
    }
}
