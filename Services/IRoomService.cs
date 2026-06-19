using OborotLite.Models;

namespace OborotLite.Services;

public interface IRoomService
{
    IEnumerable<Room> GetAll();
    Room? GetById(int id);
    Room Create(string name);
    Room? Rename(int roomId, string name);
    Room? Delete(int roomId);
    Track? AddTrack(int roomId, string title, string artist);
    Track? AddFileTrack(int roomId, string title, string artist, string fileUrl, int? durationSec);
    Track? Vote(int trackId, int delta);
    Track? RemoveTrack(int trackId);
}
