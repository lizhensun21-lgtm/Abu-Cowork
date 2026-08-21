package com.abu.server.common.config;

import org.apache.ibatis.annotations.Mapper;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan(basePackages = "com.abu.server", annotationClass = Mapper.class)
public class MyBatisConfig {
}
