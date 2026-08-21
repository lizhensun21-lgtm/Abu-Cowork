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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> handleMalformedBody(
            HttpMessageNotReadableException exception,
            HttpServletRequest request) {
        return response(HttpStatus.BAD_REQUEST, ErrorCode.REQUEST_MALFORMED.name(),
                "Request body is malformed", List.of(), request);
    }

    @ExceptionHandler({MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class})
    public ResponseEntity<ApiErrorResponse> handleMalformedQuery(
            Exception exception,
            HttpServletRequest request) {
        return response(HttpStatus.BAD_REQUEST, ErrorCode.REQUEST_MALFORMED.name(),
                "Request query is malformed", List.of(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request) {
        List<FieldErrorDetail> fieldErrors = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new FieldErrorDetail(
                        error.getField(), fieldErrorCode(error.getCode()), safeMessage(error.getDefaultMessage())))
                .toList();
        return response(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED.name(),
                "Request validation failed", fieldErrors, request);
    }

    @ExceptionHandler(RequestValidationException.class)
    public ResponseEntity<ApiErrorResponse> handleRequestValidation(
            RequestValidationException exception,
            HttpServletRequest request) {
        return response(HttpStatus.UNPROCESSABLE_ENTITY, exception.code(),
                exception.getMessage(), exception.fieldErrors(), request);
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNotFound(
            ResourceNotFoundException exception,
            HttpServletRequest request) {
        return response(HttpStatus.NOT_FOUND, exception.code(), exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(StaleVersionException.class)
    public ResponseEntity<ApiErrorResponse> handleStaleVersion(
            StaleVersionException exception,
            HttpServletRequest request) {
        return response(HttpStatus.CONFLICT, exception.code(), exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(BusinessConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleBusinessConflict(
            BusinessConflictException exception,
            HttpServletRequest request) {
        return response(HttpStatus.CONFLICT, exception.code(), exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleDatabaseConstraint(
            DataIntegrityViolationException exception,
            HttpServletRequest request) {
        LOGGER.warn("Database constraint rejected a request", exception);
        return response(HttpStatus.CONFLICT, ErrorCode.BUSINESS_CONFLICT.name(),
                "Request conflicts with stored data", List.of(), request);
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiErrorResponse> handleDatabase(
            DataAccessException exception,
            HttpServletRequest request) {
        LOGGER.error("Database request failed", exception);
        return response(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.DATABASE_UNAVAILABLE.name(),
                "Database is unavailable", List.of(), request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(
            Exception exception,
            HttpServletRequest request) {
        LOGGER.error("Unexpected request failure", exception);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR.name(),
                "Internal server error", List.of(), request);
    }

    private ResponseEntity<ApiErrorResponse> response(
            HttpStatus status,
            String code,
            String message,
            List<FieldErrorDetail> fieldErrors,
            HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ApiErrorResponse(
                code, message, fieldErrors, TraceIdFilter.getTraceId(request)));
    }

    private String fieldErrorCode(String validationCode) {
        if (validationCode == null) {
            return "INVALID";
        }
        return switch (validationCode) {
            case "NotBlank", "NotEmpty", "NotNull" -> "REQUIRED";
            case "Size" -> "INVALID_SIZE";
            case "Pattern", "Email" -> "INVALID_FORMAT";
            case "Min", "Max", "Positive", "PositiveOrZero", "Negative", "NegativeOrZero" ->
                    "OUT_OF_RANGE";
            default -> "INVALID";
        };
    }

    private String safeMessage(String message) {
        return message == null ? "Field value is invalid" : message;
    }
}
