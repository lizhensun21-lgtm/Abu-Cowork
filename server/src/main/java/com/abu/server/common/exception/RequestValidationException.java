package com.abu.server.common.exception;

import com.abu.server.common.api.ApiErrorResponse.FieldErrorDetail;
import com.abu.server.common.api.ErrorCode;
import java.util.List;

public class RequestValidationException extends CodedApiException {
    private final List<FieldErrorDetail> fieldErrors;

    public RequestValidationException(List<FieldErrorDetail> fieldErrors) {
        super(ErrorCode.VALIDATION_FAILED, "Request validation failed");
        this.fieldErrors = List.copyOf(fieldErrors);
    }

    public List<FieldErrorDetail> fieldErrors() {
        return fieldErrors;
    }
}
