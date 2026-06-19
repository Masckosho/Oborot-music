namespace OborotLite.Middleware;

public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var requestId = Guid.NewGuid().ToString("N")[..8];
        context.Response.Headers["X-Request-Id"] = requestId;
        var start = DateTime.UtcNow;

        await _next(context);

        var elapsedMs = (DateTime.UtcNow - start).TotalMilliseconds;
        _logger.LogInformation("[{RequestId}] {Method} {Path} -> {Status} ({Elapsed}ms)",
            requestId, context.Request.Method, context.Request.Path, context.Response.StatusCode, elapsedMs);
    }
}

public static class RequestLoggingExtensions
{
    public static IApplicationBuilder UseRequestLogging(this IApplicationBuilder app)
        => app.UseMiddleware<RequestLoggingMiddleware>();
}
