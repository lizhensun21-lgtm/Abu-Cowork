package com.abu.server.foundation;

import java.time.Instant;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
interface ConventionFixtureMapper {
    @Insert("""
            INSERT INTO abu.f1b_convention_fixture(id, value, created_at, updated_at, version)
            VALUES(#{id}, #{value}, #{createdAt}, #{updatedAt}, 0)
            """)
    int insert(
            @Param("id") UUID id,
            @Param("value") String value,
            @Param("createdAt") Instant createdAt,
            @Param("updatedAt") Instant updatedAt);

    @Select("""
            SELECT id, value, created_at, updated_at, version
            FROM abu.f1b_convention_fixture
            WHERE id = #{id}
            """)
    ConventionFixtureRecord find(@Param("id") UUID id);

    @Update("""
            UPDATE abu.f1b_convention_fixture
            SET value = #{value},
                updated_at = #{updatedAt},
                version = version + 1
            WHERE id = #{id}
              AND version = #{expectedVersion}
            """)
    int update(
            @Param("id") UUID id,
            @Param("value") String value,
            @Param("updatedAt") Instant updatedAt,
            @Param("expectedVersion") long expectedVersion);
}
