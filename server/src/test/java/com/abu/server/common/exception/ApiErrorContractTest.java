package com.abu.server.common.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.blankOrNullString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.abu.server.common.validation.TraceIdFilter;
import com.abu.server.common.query.PageQuery;
import com.abu.server.common.query.SortQueryParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

class ApiErrorContractTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new TestOnlyController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(new TraceIdFilter())
                .build();
    }

    @Test
    void malformedJsonUsesBadRequestContract() throws Exception {
        mockMvc.perform(post("/api/v1/f1b-test/validate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value("REQUEST_MALFORMED"))
                .andExpect(jsonPath("$.message").isString())
                .andExpect(jsonPath("$.fieldErrors", hasSize(0)))
                .andExpect(jsonPath("$.traceId", not(blankOrNullString())));
    }

    @Test
    void malformedQueryUsesBadRequestContract() throws Exception {
        mockMvc.perform(get("/api/v1/f1b-test/query-number").queryParam("page", "not-a-number"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("REQUEST_MALFORMED"));
    }

    @Test
    void invalidPaginationAndSortUseValidationContract() throws Exception {
        mockMvc.perform(get("/api/v1/f1b-test/page").queryParam("page", "0"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("page"));
        mockMvc.perform(get("/api/v1/f1b-test/sort").queryParam("sort", "raw_sql,asc"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].code").value("INVALID_SORT"));
    }

    @Test
    void dtoValidationUsesUnprocessableEntityAndFieldCode() throws Exception {
        mockMvc.perform(post("/api/v1/f1b-test/validate")
                        .header(TraceIdFilter.HEADER_NAME, "client-trace-123")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(header().string(TraceIdFilter.HEADER_NAME, "client-trace-123"))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors", hasSize(1)))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("name"))
                .andExpect(jsonPath("$.fieldErrors[0].code").value("REQUIRED"))
                .andExpect(jsonPath("$.traceId").value("client-trace-123"));
    }

    @Test
    void notFoundUsesStableFeatureCode() throws Exception {
        mockMvc.perform(get("/api/v1/f1b-test/not-found"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TEST_RESOURCE_NOT_FOUND"));
    }

    @Test
    void businessAndStaleConflictsUseConflict() throws Exception {
        mockMvc.perform(get("/api/v1/f1b-test/conflict"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TEST_BUSINESS_CONFLICT"));
        mockMvc.perform(get("/api/v1/f1b-test/stale"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STALE_VERSION"));
    }

    @Test
    void databaseConstraintUsesGenericConflictWithoutLeakingSql() throws Exception {
        mockMvc.perform(get("/api/v1/f1b-test/constraint"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BUSINESS_CONFLICT"))
                .andExpect(jsonPath("$.message").value("Request conflicts with stored data"));
    }

    @Test
    void databaseUnavailableUsesServiceUnavailableAndMatchingTrace() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/f1b-test/database-error"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(header().string(TraceIdFilter.HEADER_NAME, not(blankOrNullString())))
                .andExpect(jsonPath("$.code").value("DATABASE_UNAVAILABLE"))
                .andReturn();

        String traceId = result.getResponse().getHeader(TraceIdFilter.HEADER_NAME);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsByteArray());
        assertThat(body.get("traceId").asText()).isEqualTo(traceId);
    }

    @Test
    void unexpectedErrorUsesInternalErrorCode() throws Exception {
        mockMvc.perform(get("/api/v1/f1b-test/internal-error"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.traceId", not(blankOrNullString())));
    }

    @Test
    void successfulResponseAlsoCarriesAcceptedOrGeneratedTraceHeader() throws Exception {
        mockMvc.perform(get("/api/v1/f1b-test/success")
                        .header(TraceIdFilter.HEADER_NAME, "accepted-trace"))
                .andExpect(status().isOk())
                .andExpect(header().string(TraceIdFilter.HEADER_NAME, "accepted-trace"));
        mockMvc.perform(get("/api/v1/f1b-test/success")
                        .header(TraceIdFilter.HEADER_NAME, "unsafe trace value"))
                .andExpect(status().isOk())
                .andExpect(header().string(TraceIdFilter.HEADER_NAME, not("unsafe trace value")))
                .andExpect(header().string(TraceIdFilter.HEADER_NAME, not(blankOrNullString())));
    }

    @RestController
    @RequestMapping("/api/v1/f1b-test")
    private static class TestOnlyController {
        @PostMapping("/validate")
        void validate(@Valid @RequestBody ValidationBody body) {
        }

        @GetMapping("/query-number")
        int queryNumber(@RequestParam int page) {
            return page;
        }

        @GetMapping("/page")
        PageQuery page(
                @RequestParam(required = false) Integer page,
                @RequestParam(required = false) Integer size) {
            return PageQuery.from(page, size);
        }

        @GetMapping("/sort")
        Object sort(@RequestParam(required = false) String sort) {
            return SortQueryParser.parse(sort, Set.of("updatedAt")).orElse(null);
        }

        @GetMapping("/not-found")
        void notFound() {
            throw new ResourceNotFoundException("TEST_RESOURCE_NOT_FOUND", "Fixture was not found");
        }

        @GetMapping("/conflict")
        void conflict() {
            throw new BusinessConflictException("TEST_BUSINESS_CONFLICT", "Fixture conflicts");
        }

        @GetMapping("/stale")
        void stale() {
            throw new StaleVersionException("Fixture version is stale");
        }

        @GetMapping("/constraint")
        void constraint() {
            throw new DataIntegrityViolationException("raw constraint f1b_unique_value");
        }

        @GetMapping("/database-error")
        void databaseError() {
            throw new DataAccessResourceFailureException("test-only failure");
        }

        @GetMapping("/internal-error")
        void internalError() {
            throw new IllegalStateException("test-only failure");
        }

        @GetMapping("/success")
        Map<String, String> success() {
            return Map.of("status", "ok");
        }
    }

    private record ValidationBody(@NotBlank String name) {
    }
}
