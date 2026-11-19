namespace IstanbulTraffic.Domain.Incidents;

/// <summary>Centre of a geohash cell, so incident cells can be drawn on the same grid as traffic cells.</summary>
public static class Geohash
{
    private const string Alphabet = "0123456789bcdefghjkmnpqrstuvwxyz";

    public static (double Latitude, double Longitude) Center(string geohash)
    {
        double latLow = -90, latHigh = 90, lonLow = -180, lonHigh = 180;
        var longitudeBit = true;
        foreach (var character in geohash)
        {
            var value = Alphabet.IndexOf(char.ToLowerInvariant(character));
            if (value < 0)
            {
                throw new ArgumentException($"'{geohash}' is not a geohash.", nameof(geohash));
            }

            for (var mask = 16; mask > 0; mask >>= 1)
            {
                var set = (value & mask) != 0;
                if (longitudeBit)
                {
                    var middle = (lonLow + lonHigh) / 2;
                    if (set) lonLow = middle; else lonHigh = middle;
                }
                else
                {
                    var middle = (latLow + latHigh) / 2;
                    if (set) latLow = middle; else latHigh = middle;
                }

                longitudeBit = !longitudeBit;
            }
        }

        return ((latLow + latHigh) / 2, (lonLow + lonHigh) / 2);
    }
}
