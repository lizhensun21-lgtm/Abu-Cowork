package com.abu.server.common.exception;

import com.abu.server.common.api.ErrorCode;

public class ResourceNotFoundException extends CodedApiException {
    public ResourceNotFoundException(String message) {
        super(ErrorCode.RESOURCE_NOT_FOUND, message);
    }

    public ResourceNotFoundException(String code, String message) {
        super(code, message);
    }
}
