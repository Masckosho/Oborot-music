namespace OborotLite.Models;

public class Room
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public List<Track> Tracks { get; set; } = new();
}
