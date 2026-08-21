package com.abu.server.common.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.abu.server.common.exception.RequestValidationException;
import java.util.Set;
import org.junit.jupiter.api.Test;

class ApiQueryConventionTest {
    @Test
    void paginationUsesOneBasedDefaultsAndCalculatesOffset() {
        PageQuery defaults = PageQuery.from(null, null);
        PageQuery explicit = PageQuery.from(3, 25);

        assertThat(defaults.page()).isEqualTo(1);
        assertThat(defaults.size()).isEqualTo(50);
        assertThat(defaults.offset()).isZero();
        assertThat(explicit.offset()).isEqualTo(50);
    }

    @Test
    void paginationAcceptsMaximumSizeAndRejectsInvalidRanges() {
        assertThat(PageQuery.from(1, 200).size()).isEqualTo(200);

        assertValidationField(() -> PageQuery.from(0, 50), "page", "OUT_OF_RANGE");
        assertValidationField(() -> PageQuery.from(1, 0), "size", "OUT_OF_RANGE");
        assertValidationField(() -> PageQuery.from(1, 201), "size", "OUT_OF_RANGE");
    }

    @Test
    void sortRequiresFeatureWhitelistAndKnownDirection() {
        SortSpec spec = SortQueryParser.parse("updatedAt,desc", Set.of("name", "updatedAt"))
                .orElseThrow();

        assertThat(spec.field()).isEqualTo("updatedAt");
        assertThat(spec.direction()).isEqualTo(SortDirection.DESC);
        assertThat(SortQueryParser.parse(null, Set.of("updatedAt"))).isEmpty();
        assertValidationField(
                () -> SortQueryParser.parse("database_column,asc", Set.of("updatedAt")),
                "sort", "INVALID_SORT");
        assertValidationField(
                () -> SortQueryParser.parse("updatedAt,sideways", Set.of("updatedAt")),
                "sort", "INVALID_SORT");
    }

    private void assertValidationField(Runnable operation, String field, String code) {
        assertThatThrownBy(operation::run)
                .isInstanceOfSatisfying(RequestValidationException.class, exception -> {
                    assertThat(exception.fieldErrors()).hasSize(1);
                    assertThat(exception.fieldErrors().getFirst().field()).isEqualTo(field);
                    assertThat(exception.fieldErrors().getFirst().code()).isEqualTo(code);
                });
    }
}
