package com.abu.server.common.api;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

/**
 * A typed PATCH field that distinguishes an omitted property from an explicit
 * JSON null and from a supplied value.
 */
@JsonDeserialize(using = PatchFieldDeserializer.class)
public final class PatchField<T> {
    private static final PatchField<?> ABSENT = new PatchField<>(false, null);

    private final boolean provided;
    private final T value;

    private PatchField(boolean provided, T value) {
        this.provided = provided;
        this.value = value;
    }

    @SuppressWarnings("unchecked")
    public static <T> PatchField<T> absent() {
        return (PatchField<T>) ABSENT;
    }

    public static <T> PatchField<T> of(T value) {
        return new PatchField<>(true, value);
    }

    public static <T> PatchField<T> orAbsent(PatchField<T> field) {
        return field == null ? absent() : field;
    }

    public boolean provided() {
        return provided;
    }

    public T value() {
        if (!provided) {
            throw new IllegalStateException("An omitted PATCH field has no value");
        }
        return value;
    }
}
