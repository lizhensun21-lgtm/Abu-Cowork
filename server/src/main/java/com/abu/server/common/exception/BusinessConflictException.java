package com.abu.server.common.exception;

import com.abu.server.common.api.ErrorCode;

public class BusinessConflictException extends CodedApiException {
    public BusinessConflictException(String message) {
        super(ErrorCode.BUSINESS_CONFLICT, message);
    }

    public BusinessConflictException(String code, String message) {
        super(code, message);
    }
}
