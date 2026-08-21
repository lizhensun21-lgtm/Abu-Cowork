package com.abu.server.common.api;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.BeanProperty;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.deser.ContextualDeserializer;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import java.io.IOException;

public final class PatchFieldDeserializer extends StdDeserializer<PatchField<?>>
        implements ContextualDeserializer {
    private final JavaType valueType;

    public PatchFieldDeserializer() {
        this(null);
    }

    private PatchFieldDeserializer(JavaType valueType) {
        super(PatchField.class);
        this.valueType = valueType;
    }

    @Override
    public PatchField<?> deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        JavaType targetType = valueType == null
                ? context.constructType(Object.class)
                : valueType;
        return PatchField.of(context.readValue(parser, targetType));
    }

    @Override
    public PatchField<?> getNullValue(DeserializationContext context) {
        return PatchField.of(null);
    }

    @Override
    public PatchField<?> getAbsentValue(DeserializationContext context) {
        return PatchField.absent();
    }

    @Override
    public JsonDeserializer<?> createContextual(DeserializationContext context, BeanProperty property) {
        JavaType contextualType = property == null ? context.getContextualType() : property.getType();
        JavaType containedType = contextualType == null
                ? context.constructType(Object.class)
                : contextualType.containedTypeOrUnknown(0);
        return new PatchFieldDeserializer(containedType);
    }
}
