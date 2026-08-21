package com.abu.server.common.exception;

import com.abu.server.common.api.ErrorCode;
import java.util.Objects;
import java.util.regex.Pattern;

public abstract class CodedApiException extends RuntimeException {
    private static final Pattern CODE_PATTERN = Pattern.compile("[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*");

    private final String code;

    protected CodedApiException(ErrorCode code, String message) {
        this(code.name(), message);
    }

    protected CodedApiException(String code, String message) {
        super(Objects.requireNonNull(message, "message"));
        if (!CODE_PATTERN.matcher(Objects.requireNonNull(code, "code")).matches()) {
            throw new IllegalArgumentException("API error code must use UPPER_SNAKE_CASE: " + code);
        }
        this.code = code;
    }

    public String code() {
        return code;
    }
}
