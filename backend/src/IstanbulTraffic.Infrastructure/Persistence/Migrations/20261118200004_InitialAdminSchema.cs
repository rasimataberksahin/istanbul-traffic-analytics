using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IstanbulTraffic.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialAdminSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "admin");

            migrationBuilder.CreateTable(
                name: "data_sources",
                schema: "admin",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    license = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_data_sources", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "import_runs",
                schema: "admin",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    data_source_id = table.Column<int>(type: "integer", nullable: false),
                    month = table.Column<DateOnly>(type: "date", nullable: false),
                    source_file = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    source_sha256 = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false),
                    row_count = table.Column<long>(type: "bigint", nullable: false),
                    vehicle_total = table.Column<long>(type: "bigint", nullable: false),
                    location_count = table.Column<int>(type: "integer", nullable: false),
                    loaded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    synced_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_import_runs", x => x.id);
                    table.ForeignKey(
                        name: "FK_import_runs_data_sources_data_source_id",
                        column: x => x.data_source_id,
                        principalSchema: "admin",
                        principalTable: "data_sources",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "quality_results",
                schema: "admin",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    import_run_id = table.Column<int>(type: "integer", nullable: false),
                    metric = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    row_count = table.Column<long>(type: "bigint", nullable: false),
                    share_pct = table.Column<decimal>(type: "numeric(6,3)", precision: 6, scale: 3, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_quality_results", x => x.id);
                    table.ForeignKey(
                        name: "FK_quality_results_import_runs_import_run_id",
                        column: x => x.import_run_id,
                        principalSchema: "admin",
                        principalTable: "import_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                schema: "admin",
                table: "data_sources",
                columns: new[] { "id", "code", "created_at", "is_active", "license", "name", "url" },
                values: new object[] { 1, "ibb-hourly-traffic", new DateTimeOffset(new DateTime(2026, 11, 18, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), true, "İBB Açık Veri Lisansı", "İBB Saatlik Trafik Yoğunluk Veri Seti", "https://data.ibb.gov.tr/dataset/hourly-traffic-density-data-set" });

            migrationBuilder.CreateIndex(
                name: "ux_data_sources_code",
                schema: "admin",
                table: "data_sources",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_import_runs_source_month",
                schema: "admin",
                table: "import_runs",
                columns: new[] { "data_source_id", "month" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_quality_results_run_metric",
                schema: "admin",
                table: "quality_results",
                columns: new[] { "import_run_id", "metric" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "quality_results",
                schema: "admin");

            migrationBuilder.DropTable(
                name: "import_runs",
                schema: "admin");

            migrationBuilder.DropTable(
                name: "data_sources",
                schema: "admin");
        }
    }
}
