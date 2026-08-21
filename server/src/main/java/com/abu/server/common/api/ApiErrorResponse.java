package com.abu.server.common.api;

import java.util.List;
import java.util.Objects;

public record ApiErrorResponse(
        String code,
        String message,
        List<FieldErrorDetail> fieldErrors,
        String traceId) {

    public ApiErrorResponse {
        code = Objects.requireNonNull(code, "code");
        message = Objects.requireNonNull(message, "message");
        fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
        traceId = Objects.requireNonNull(traceId, "traceId");
    }

    public record FieldErrorDetail(String field, String code, String message) {
        public FieldErrorDetail {
            field = Objects.requireNonNull(field, "field");
            code = Objects.requireNonNull(code, "code");
            message = Objects.requireNonNull(message, "message");
        }
    }
}
