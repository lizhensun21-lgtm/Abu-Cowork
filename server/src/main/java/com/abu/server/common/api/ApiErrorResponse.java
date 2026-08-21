package com.abu.server.common.api;

import java.util.List;

public record ApiErrorResponse(
        String code,
        String message,
        List<FieldErrorDetail> fieldErrors,
        String traceId) {

    public record FieldErrorDetail(String field, String message) {
    }
}
