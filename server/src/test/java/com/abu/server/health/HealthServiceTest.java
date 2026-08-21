package com.abu.server.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.SQLException;
import java.util.Optional;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class HealthServiceTest {
    @Test
    void healthEndpointReportsDatabaseDownWithoutCrashing() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        when(dataSource.getConnection()).thenThrow(new SQLException("database offline"));
        HealthService healthService = new HealthService(dataSource, Optional.empty());

        HealthResponse response = healthService.health();

        assertThat(response.status()).isEqualTo("DEGRADED");
        assertThat(response.database()).isEqualTo("DOWN");
        assertThat(response.version()).isNotBlank();

        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new HealthController(healthService)).build();
        mockMvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DEGRADED"))
                .andExpect(jsonPath("$.database").value("DOWN"))
                .andExpect(jsonPath("$.version").isNotEmpty());
    }
}
