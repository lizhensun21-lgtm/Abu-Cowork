package com.abu.server.common.query;

import com.abu.server.common.api.ApiErrorResponse.FieldErrorDetail;
import com.abu.server.common.exception.RequestValidationException;
import java.util.ArrayList;
import java.util.List;

public record PageQuery(int page, int size) {
    public static final int DEFAULT_PAGE = 1;
    public static final int DEFAULT_SIZE = 50;
    public static final int MAX_SIZE = 200;

    public static PageQuery from(Integer page, Integer size) {
        int resolvedPage = page == null ? DEFAULT_PAGE : page;
        int resolvedSize = size == null ? DEFAULT_SIZE : size;
        List<FieldErrorDetail> errors = new ArrayList<>();
        if (resolvedPage < 1) {
            errors.add(new FieldErrorDetail("page", "OUT_OF_RANGE", "page must be at least 1"));
        }
        if (resolvedSize < 1 || resolvedSize > MAX_SIZE) {
            errors.add(new FieldErrorDetail(
                    "size", "OUT_OF_RANGE", "size must be between 1 and " + MAX_SIZE));
        }
        if (!errors.isEmpty()) {
            throw new RequestValidationException(errors);
        }
        return new PageQuery(resolvedPage, resolvedSize);
    }

    public long offset() {
        return (long) (page - 1) * size;
    }
}
