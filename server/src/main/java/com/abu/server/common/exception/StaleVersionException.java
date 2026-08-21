package com.abu.server.common.exception;

import com.abu.server.common.api.ErrorCode;

public class StaleVersionException extends CodedApiException {
    public StaleVersionException(String message) {
        super(ErrorCode.STALE_VERSION, message);
    }
}
