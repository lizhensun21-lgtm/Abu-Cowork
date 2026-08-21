package com.abu.server.common.query;

import java.util.Objects;

public record SortSpec(String field, SortDirection direction) {
    public SortSpec {
        field = Objects.requireNonNull(field, "field");
        direction = Objects.requireNonNull(direction, "direction");
    }
}
