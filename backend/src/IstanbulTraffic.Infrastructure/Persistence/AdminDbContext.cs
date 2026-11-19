using System.Text.RegularExpressions;
using IstanbulTraffic.Domain.Administration;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IstanbulTraffic.Infrastructure.Persistence;

/// <summary>EF Core owns the administration schema. Traffic facts stay in plain SQL.</summary>
public sealed partial class AdminDbContext(DbContextOptions<AdminDbContext> options) : DbContext(options)
{
    public const string Schema = "admin";
    public const string MigrationsTable = "__ef_migrations_history";

    public DbSet<DataSource> DataSources => Set<DataSource>();

    public DbSet<ImportRun> ImportRuns => Set<ImportRun>();

    public DbSet<QualityResult> QualityResults => Set<QualityResult>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.Entity<DataSource>(ConfigureDataSource);
        modelBuilder.Entity<ImportRun>(ConfigureImportRun);
        modelBuilder.Entity<QualityResult>(ConfigureQualityResult);

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(CapitalLetter().Replace(property.Name, "$1_$2").ToLowerInvariant());
            }
        }
    }

    private static void ConfigureDataSource(EntityTypeBuilder<DataSource> builder)
    {
        builder.ToTable("data_sources");
        builder.HasKey(source => source.Id);
        builder.Property(source => source.Code).HasMaxLength(64);
        builder.Property(source => source.Name).HasMaxLength(200);
        builder.Property(source => source.Url).HasMaxLength(500);
        builder.Property(source => source.License).HasMaxLength(200);
        builder.HasIndex(source => source.Code).IsUnique().HasDatabaseName("ux_data_sources_code");

        builder.HasData(new
        {
            Id = 1,
            Code = "ibb-hourly-traffic",
            Name = "İBB Saatlik Trafik Yoğunluk Veri Seti",
            Url = "https://data.ibb.gov.tr/dataset/hourly-traffic-density-data-set",
            License = "İBB Açık Veri Lisansı",
            IsActive = true,
            CreatedAt = new DateTimeOffset(2026, 11, 18, 0, 0, 0, TimeSpan.Zero),
        });
    }

    private static void ConfigureImportRun(EntityTypeBuilder<ImportRun> builder)
    {
        builder.ToTable("import_runs");
        builder.HasKey(run => run.Id);
        builder.Property(run => run.SourceFile).HasMaxLength(255);
        builder.Property(run => run.SourceSha256).HasMaxLength(64).IsFixedLength();
        builder.HasOne<DataSource>()
            .WithMany()
            .HasForeignKey(run => run.DataSourceId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(run => new { run.DataSourceId, run.Month })
            .IsUnique()
            .HasDatabaseName("ux_import_runs_source_month");
        builder.HasMany(run => run.QualityResults)
            .WithOne()
            .HasForeignKey(result => result.ImportRunId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(run => run.QualityResults).UsePropertyAccessMode(PropertyAccessMode.Field);
    }

    private static void ConfigureQualityResult(EntityTypeBuilder<QualityResult> builder)
    {
        builder.ToTable("quality_results");
        builder.HasKey(result => result.Id);
        builder.Property(result => result.Metric).HasMaxLength(64);
        builder.Property(result => result.SharePct).HasPrecision(6, 3);
        builder.HasIndex(result => new { result.ImportRunId, result.Metric })
            .IsUnique()
            .HasDatabaseName("ux_quality_results_run_metric");
    }

    [GeneratedRegex("([a-z0-9])([A-Z])", RegexOptions.CultureInvariant)]
    private static partial Regex CapitalLetter();
}

/// <summary>Lets the EF Core tools create migrations without a running database.</summary>
internal sealed class AdminDbContextFactory : IDesignTimeDbContextFactory<AdminDbContext>
{
    public AdminDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AdminDbContext>()
            .UseNpgsql(
                "Host=localhost;Database=design_time",
                npgsql => npgsql.MigrationsHistoryTable(AdminDbContext.MigrationsTable, AdminDbContext.Schema))
            .Options;
        return new AdminDbContext(options);
    }
}
