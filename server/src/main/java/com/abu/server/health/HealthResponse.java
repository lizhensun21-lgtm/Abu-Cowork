package com.abu.server.health;

public record HealthResponse(String status, String database, String version) {
}
