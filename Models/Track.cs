namespace OborotLite.Models;

public class Track
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Artist { get; set; } = "";
    public int Votes { get; set; }

    // Заполняются при загрузке аудиофайла (см. /api/rooms/{id}/upload)
    public string? FileUrl { get; set; }
    public int? DurationSec { get; set; }
}
