using OborotLite.Middleware;
using OborotLite.Models;
using OborotLite.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IRoomService>(sp =>
    new RoomService(sp.GetRequiredService<IWebHostEnvironment>()));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler(handler =>
    {
        handler.Run(async context =>
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("""{"error":"Внутренняя ошибка сервера"}""");
        });
    });
}

app.UseStatusCodePages(async statusCodeContext =>
{
    var response = statusCodeContext.HttpContext.Response;
    if (response.StatusCode == StatusCodes.Status404NotFound && !response.HasStarted)
    {
        response.ContentType = "application/json";
        await response.WriteAsync("""{"error":"Маршрут не найден"}""");
    }
});

app.UseRequestLogging();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/rooms", GetRooms);
app.MapPost("/api/rooms", CreateRoom);
app.MapGet("/api/rooms/{id:int}", GetRoom);
app.MapPatch("/api/rooms/{id:int}", RenameRoom);
app.MapPost("/api/rooms/{id:int}/tracks", AddTrack);
app.MapPost("/api/rooms/{id:int}/upload", UploadTrack).DisableAntiforgery();
app.MapPost("/api/tracks/{id:int}/vote", VoteTrack);
app.MapDelete("/api/rooms/{id:int}", DeleteRoom);
app.MapDelete("/api/tracks/{id:int}", RemoveTrack);

app.Run();

static IResult GetRooms(IRoomService rooms)
{
    var list = rooms.GetAll()
        .Select(r => new { r.Id, r.Name, TrackCount = r.Tracks.Count })
        .ToList();
    return Results.Ok(list);
}

static IResult CreateRoom(CreateRoomRequest request, IRoomService rooms)
{
    if (string.IsNullOrWhiteSpace(request.Name))
        return Results.BadRequest(new { error = "Название комнаты обязательно" });

    var room = rooms.Create(request.Name.Trim());
    return Results.Created($"/api/rooms/{room.Id}", room);
}

static IResult RenameRoom(int id, RenameRoomRequest request, IRoomService rooms)
{
    if (string.IsNullOrWhiteSpace(request.Name))
        return Results.BadRequest(new { error = "Название не может быть пустым" });

    var room = rooms.Rename(id, request.Name.Trim());
    return room is null
        ? Results.NotFound(new { error = $"Комната {id} не найдена" })
        : Results.Ok(new { id = room.Id, name = room.Name });
}

static IResult GetRoom(int id, IRoomService rooms)
{
    var room = rooms.GetById(id);
    return room is null
        ? Results.NotFound(new { error = $"Комната {id} не найдена" })
        : Results.Ok(room);
}

static IResult AddTrack(int id, AddTrackRequest request, IRoomService rooms)
{
    if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Artist))
        return Results.BadRequest(new { error = "Название и артист обязательны" });

    var track = rooms.AddTrack(id, request.Title.Trim(), request.Artist.Trim());
    return track is null
        ? Results.NotFound(new { error = $"Комната {id} не найдена" })
        : Results.Created($"/api/rooms/{id}", track);
}

static async Task<IResult> UploadTrack(int id, IFormFile? file, IRoomService rooms, IWebHostEnvironment env)
{
    string[] allowedAudioExtensions = { ".mp3", ".wav", ".ogg", ".m4a", ".flac" };
    const long maxUploadBytes = 25 * 1024 * 1024;

    if (file is null || file.Length == 0)
        return Results.BadRequest(new { error = "Файл не выбран" });

    var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
    if (!allowedAudioExtensions.Contains(ext))
        return Results.BadRequest(new { error = $"Формат {ext} не поддерживается. Разрешены: {string.Join(", ", allowedAudioExtensions)}" });

    if (file.Length > maxUploadBytes)
        return Results.BadRequest(new { error = "Файл слишком большой (максимум 25 МБ)" });

    var uploadsDir = Path.Combine(env.WebRootPath, "music");
    Directory.CreateDirectory(uploadsDir);
    var safeFileName = $"{Guid.NewGuid():N}{ext}";
    var fullPath = Path.Combine(uploadsDir, safeFileName);

    await using (var stream = System.IO.File.Create(fullPath))
    {
        await file.CopyToAsync(stream);
    }

    var title = Path.GetFileNameWithoutExtension(file.FileName).Replace('_', ' ').Replace('-', ' ').Trim();
    var artist = "Неизвестный артист";
    int? durationSec = null;

    try
    {
        using var tagFile = TagLib.File.Create(fullPath);
        if (!string.IsNullOrWhiteSpace(tagFile.Tag.Title))
            title = tagFile.Tag.Title;

        if (tagFile.Tag.Performers.Length > 0)
            artist = string.Join(", ", tagFile.Tag.Performers);
        else if (!string.IsNullOrWhiteSpace(tagFile.Tag.FirstAlbumArtist))
            artist = tagFile.Tag.FirstAlbumArtist;

        if (tagFile.Properties.Duration.TotalSeconds > 0)
            durationSec = (int)tagFile.Properties.Duration.TotalSeconds;
    }
    catch { }

    var fileUrl = $"/music/{safeFileName}";
    var track = rooms.AddFileTrack(id, title, artist, fileUrl, durationSec);

    if (track is null)
    {
        System.IO.File.Delete(fullPath);
        return Results.NotFound(new { error = $"Комната {id} не найдена" });
    }

    return Results.Created($"/api/rooms/{id}", track);
}

static IResult VoteTrack(int id, VoteRequest request, IRoomService rooms)
{
    var delta = request.Direction?.ToLowerInvariant() switch
    {
        "up" => 1,
        "down" => -1,
        _ => 0,
    };
    if (delta == 0)
        return Results.BadRequest(new { error = "direction должен быть 'up' или 'down'" });

    var track = rooms.Vote(id, delta);
    return track is null
        ? Results.NotFound(new { error = $"Трек {id} не найден" })
        : Results.Ok(track);
}

static IResult DeleteRoom(int id, IRoomService rooms, IWebHostEnvironment env)
{
    var room = rooms.Delete(id);
    if (room is null)
        return Results.NotFound(new { error = $"Комната {id} не найдена" });

    foreach (var track in room.Tracks.Where(t => !string.IsNullOrEmpty(t.FileUrl)))
    {
        var path = Path.Combine(env.WebRootPath, track.FileUrl!.TrimStart('/'));
        if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
    }

    return Results.NoContent();
}

static IResult RemoveTrack(int id, IRoomService rooms, IWebHostEnvironment env)
{
    var removed = rooms.RemoveTrack(id);
    if (removed is null)
        return Results.NotFound(new { error = $"Трек {id} не найден" });

    if (!string.IsNullOrEmpty(removed.FileUrl))
    {
        var path = Path.Combine(env.WebRootPath, removed.FileUrl.TrimStart('/'));
        if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
    }

    return Results.NoContent();
}

record CreateRoomRequest(string Name);
record RenameRoomRequest(string Name);
record AddTrackRequest(string Title, string Artist);
record VoteRequest(string Direction);
