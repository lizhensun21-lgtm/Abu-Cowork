package com.abu.server.common.exception;

import com.abu.server.common.api.ApiErrorResponse;
import com.abu.server.common.api.ApiErrorResponse.FieldErrorDetail;
import com.abu.server.common.api.ErrorCode;
import com.abu.server.common.validation.TraceIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request) {
        List<FieldErrorDetail> fieldErrors = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new FieldErrorDetail(error.getField(), error.getDefaultMessage()))
                .toList();
        return response(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED,
                "Request validation failed", fieldErrors, request);
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiErrorResponse> handleDatabase(
            DataAccessException exception,
            HttpServletRequest request) {
        LOGGER.error("Database request failed", exception);
        return response(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.DATABASE_UNAVAILABLE,
                "Database is unavailable", List.of(), request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(
            Exception exception,
            HttpServletRequest request) {
        LOGGER.error("Unexpected request failure", exception);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR,
                "Internal server error", List.of(), request);
    }

    private ResponseEntity<ApiErrorResponse> response(
            HttpStatus status,
            ErrorCode code,
            String message,
            List<FieldErrorDetail> fieldErrors,
            HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ApiErrorResponse(
                code.name(), message, fieldErrors, TraceIdFilter.getTraceId(request)));
    }
}
