package com.abu.server.common.api;

import java.util.List;
import java.util.Objects;

public record PageResponse<T>(List<T> items, int page, int size, long total) {
    public PageResponse {
        items = List.copyOf(Objects.requireNonNull(items, "items"));
        if (page < 1) {
            throw new IllegalArgumentException("page must be at least 1");
        }
        if (size < 1) {
            throw new IllegalArgumentException("size must be at least 1");
        }
        if (total < 0) {
            throw new IllegalArgumentException("total must not be negative");
        }
    }
}
