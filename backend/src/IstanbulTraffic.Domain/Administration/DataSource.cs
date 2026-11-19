namespace IstanbulTraffic.Domain.Administration;

/// <summary>An external data set the platform imports from.</summary>
public sealed class DataSource
{
    private DataSource()
    {
        Code = string.Empty;
        Name = string.Empty;
        Url = string.Empty;
        License = string.Empty;
    }

    public int Id { get; private set; }

    public string Code { get; private set; }

    public string Name { get; private set; }

    public string Url { get; private set; }

    public string License { get; private set; }

    public bool IsActive { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }
}
