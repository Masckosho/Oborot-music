using System.Text.Json;
using OborotLite.Models;

namespace OborotLite.Services;

public class RoomService : IRoomService
{
    private readonly object _lock = new();
    private readonly List<Room> _rooms = new();
    private int _nextRoomId = 1;
    private int _nextTrackId = 1;

    private readonly string _dataFile;

    private static readonly JsonSerializerOptions _json = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
    };

    public RoomService(IWebHostEnvironment env)
    {
        _dataFile = Path.Combine(env.ContentRootPath, "data.json");
        Load();

        if (!_rooms.Any())
        {
            var demo = new Room { Id = _nextRoomId++, Name = "Кухонные посиделки" };
            demo.Tracks.Add(new Track { Id = _nextTrackId++, Title = "Slow River", Artist = "Hana Vu", Votes = 3 });
            demo.Tracks.Add(new Track { Id = _nextTrackId++, Title = "Pastoral", Artist = "Mk.gee", Votes = 1 });
            _rooms.Add(demo);
            Save();
        }
    }

    public IEnumerable<Room> GetAll()
    {
        lock (_lock) return _rooms.ToList();
    }

    public Room? GetById(int id)
    {
        lock (_lock)
        {
            var room = _rooms.FirstOrDefault(r => r.Id == id);
            if (room is null) return null;

            return new Room
            {
                Id = room.Id,
                Name = room.Name,
                Tracks = room.Tracks.OrderByDescending(t => t.Votes).ToList(),
            };
        }
    }

    public Room Create(string name)
    {
        lock (_lock)
        {
            var room = new Room { Id = _nextRoomId++, Name = name };
            _rooms.Add(room);
            Save();
            return room;
        }
    }

    public Room? Rename(int roomId, string name)
    {
        lock (_lock)
        {
            var room = _rooms.FirstOrDefault(r => r.Id == roomId);
            if (room is null) return null;

            room.Name = name;
            Save();
            return room;
        }
    }

    public Room? Delete(int roomId)
    {
        lock (_lock)
        {
            var room = _rooms.FirstOrDefault(r => r.Id == roomId);
            if (room is null) return null;

            _rooms.Remove(room);
            Save();
            return room;
        }
    }

    public Track? AddTrack(int roomId, string title, string artist)
    {
        lock (_lock)
        {
            var room = _rooms.FirstOrDefault(r => r.Id == roomId);
            if (room is null) return null;

            var track = new Track { Id = _nextTrackId++, Title = title, Artist = artist };
            room.Tracks.Add(track);
            Save();
            return track;
        }
    }

    public Track? AddFileTrack(int roomId, string title, string artist, string fileUrl, int? durationSec)
    {
        lock (_lock)
        {
            var room = _rooms.FirstOrDefault(r => r.Id == roomId);
            if (room is null) return null;

            var track = new Track
            {
                Id = _nextTrackId++,
                Title = title,
                Artist = artist,
                FileUrl = fileUrl,
                DurationSec = durationSec,
            };
            room.Tracks.Add(track);
            Save();
            return track;
        }
    }

    public Track? Vote(int trackId, int delta)
    {
        lock (_lock)
        {
            var track = _rooms.SelectMany(r => r.Tracks).FirstOrDefault(t => t.Id == trackId);
            if (track is null) return null;

            track.Votes += delta;
            Save();
            return track;
        }
    }

    public Track? RemoveTrack(int trackId)
    {
        lock (_lock)
        {
            foreach (var room in _rooms)
            {
                var track = room.Tracks.FirstOrDefault(t => t.Id == trackId);
                if (track is null) continue;

                room.Tracks.Remove(track);
                Save();
                return track;
            }
            return null;
        }
    }

    private void Load()
    {
        if (!File.Exists(_dataFile)) return;

        try
        {
            var json = File.ReadAllText(_dataFile);
            var state = JsonSerializer.Deserialize<SavedState>(json, _json);
            if (state is null) return;

            _rooms.AddRange(state.Rooms);
            _nextRoomId  = state.NextRoomId;
            _nextTrackId = state.NextTrackId;
        }
        catch { }
    }

    private void Save()
    {
        var state = new SavedState
        {
            Rooms        = _rooms,
            NextRoomId   = _nextRoomId,
            NextTrackId  = _nextTrackId,
        };
        File.WriteAllText(_dataFile, JsonSerializer.Serialize(state, _json));
    }

    private class SavedState
    {
        public List<Room> Rooms       { get; set; } = new();
        public int NextRoomId         { get; set; } = 1;
        public int NextTrackId        { get; set; } = 1;
    }
}
