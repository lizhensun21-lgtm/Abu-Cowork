package com.abu.server.common.query;

import com.abu.server.common.api.ApiErrorResponse.FieldErrorDetail;
import com.abu.server.common.exception.RequestValidationException;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

public final class SortQueryParser {
    private SortQueryParser() {
    }

    public static Optional<SortSpec> parse(String sort, Set<String> allowedFields) {
        if (sort == null || sort.isBlank()) {
            return Optional.empty();
        }
        String[] parts = sort.split(",", -1);
        if (parts.length != 2 || !allowedFields.contains(parts[0])) {
            throw invalidSort();
        }
        SortDirection direction;
        try {
            direction = SortDirection.valueOf(parts[1].toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw invalidSort();
        }
        return Optional.of(new SortSpec(parts[0], direction));
    }

    private static RequestValidationException invalidSort() {
        return new RequestValidationException(List.of(new FieldErrorDetail(
                "sort", "INVALID_SORT", "sort must use an allowed field and asc or desc direction")));
    }
}
