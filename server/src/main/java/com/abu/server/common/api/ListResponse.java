package com.abu.server.common.api;

import java.util.List;
import java.util.Objects;

public record ListResponse<T>(List<T> items) {
    public ListResponse {
        items = List.copyOf(Objects.requireNonNull(items, "items"));
    }
}
