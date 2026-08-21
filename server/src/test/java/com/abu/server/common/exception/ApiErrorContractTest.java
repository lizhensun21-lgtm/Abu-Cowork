package com.abu.server.common.exception;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.blankOrNullString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.abu.server.common.validation.TraceIdFilter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

class ApiErrorContractTest {
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new TestOnlyController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(new TraceIdFilter())
                .build();
    }

    @Test
    void validationErrorHasStableShapeAndTraceId() throws Exception {
        mockMvc.perform(post("/api/v1/f1a-test/validate")
                        .header(TraceIdFilter.HEADER_NAME, "client-trace-123")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(header().string(TraceIdFilter.HEADER_NAME, "client-trace-123"))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").isString())
                .andExpect(jsonPath("$.fieldErrors", hasSize(1)))
                .andExpect(jsonPath("$.traceId").value("client-trace-123"));
    }

    @Test
    void databaseErrorUsesStableCodeAndGeneratedTraceId() throws Exception {
        mockMvc.perform(get("/api/v1/f1a-test/database-error"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(header().string(TraceIdFilter.HEADER_NAME, not(blankOrNullString())))
                .andExpect(jsonPath("$.code").value("DATABASE_UNAVAILABLE"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(0)))
                .andExpect(jsonPath("$.traceId", not(blankOrNullString())));
    }

    @Test
    void unexpectedErrorUsesInternalErrorCode() throws Exception {
        mockMvc.perform(get("/api/v1/f1a-test/internal-error"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.traceId", not(blankOrNullString())));
    }

    @RestController
    @RequestMapping("/api/v1/f1a-test")
    private static class TestOnlyController {
        @PostMapping("/validate")
        void validate(@Valid @RequestBody ValidationBody body) {
        }

        @GetMapping("/database-error")
        void databaseError() {
            throw new DataAccessResourceFailureException("test-only failure");
        }

        @GetMapping("/internal-error")
        void internalError() {
            throw new IllegalStateException("test-only failure");
        }
    }

    private record ValidationBody(@NotBlank String name) {
    }
}
