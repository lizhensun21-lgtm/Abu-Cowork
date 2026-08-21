package com.abu.server.common.validation;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {
    public static final String HEADER_NAME = "X-Trace-Id";
    public static final String REQUEST_ATTRIBUTE = TraceIdFilter.class.getName() + ".traceId";
    private static final Pattern SAFE_TRACE_ID = Pattern.compile("[A-Za-z0-9._-]{1,128}");

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        String supplied = request.getHeader(HEADER_NAME);
        String traceId = supplied != null && SAFE_TRACE_ID.matcher(supplied).matches()
                ? supplied
                : UUID.randomUUID().toString();
        request.setAttribute(REQUEST_ATTRIBUTE, traceId);
        response.setHeader(HEADER_NAME, traceId);
        try (MDC.MDCCloseable ignored = MDC.putCloseable("traceId", traceId)) {
            filterChain.doFilter(request, response);
        }
    }

    public static String getTraceId(HttpServletRequest request) {
        Object traceId = request.getAttribute(REQUEST_ATTRIBUTE);
        return traceId instanceof String value ? value : UUID.randomUUID().toString();
    }
}
