package com.abu.server.foundation;

import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
interface FoundationFixtureMapper {
    @Insert("INSERT INTO f1a_test_fixture(id, value) VALUES(#{id}, #{value})")
    void insert(@Param("id") UUID id, @Param("value") String value);

    @Select("SELECT EXISTS(SELECT 1 FROM f1a_test_fixture WHERE id = #{id})")
    boolean exists(@Param("id") UUID id);
}
