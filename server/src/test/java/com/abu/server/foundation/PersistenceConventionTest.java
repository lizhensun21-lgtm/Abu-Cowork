package com.abu.server.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.util.stream.Stream;
import org.apache.ibatis.annotations.Param;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

class PersistenceConventionTest {
    @Test
    void everyTestMapperParameterHasExplicitMyBatisName() {
        Stream.of(FoundationFixtureMapper.class, ConventionFixtureMapper.class)
                .flatMap(mapper -> Stream.of(mapper.getDeclaredMethods()))
                .flatMap(method -> Stream.of(method.getParameters()))
                .forEach(parameter -> assertThat(parameter.getAnnotation(Param.class))
                        .as("@Param on %s", describe(parameter))
                        .isNotNull());
    }

    @Test
    void serviceOwnsMutationAndReadTransactionBoundaries() throws Exception {
        assertMutation("create", java.util.UUID.class, String.class);
        assertMutation("update", java.util.UUID.class, String.class, long.class);
        assertMutation("updateThenFail", java.util.UUID.class, String.class, long.class);

        Transactional read = ConventionFixtureService.class
                .getMethod("find", java.util.UUID.class)
                .getAnnotation(Transactional.class);
        assertThat(read).isNotNull();
        assertThat(read.readOnly()).isTrue();
        assertThat(ConventionFixtureMapper.class.getAnnotation(Transactional.class)).isNull();
    }

    private void assertMutation(String name, Class<?>... parameterTypes) throws Exception {
        Transactional transaction = ConventionFixtureService.class
                .getMethod(name, parameterTypes)
                .getAnnotation(Transactional.class);
        assertThat(transaction).as("@Transactional on %s", name).isNotNull();
        assertThat(transaction.readOnly()).isFalse();
    }

    private String describe(Parameter parameter) {
        Method method = (Method) parameter.getDeclaringExecutable();
        return method.getDeclaringClass().getSimpleName() + "." + method.getName();
    }
}
