namespace Ocr.Storage;

using Microsoft.EntityFrameworkCore;
using Ocr.Core.Entities;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<DocumentType> DocumentTypes => Set<DocumentType>();
    public DbSet<Template> Templates => Set<Template>();
    public DbSet<DocumentSample> Samples => Set<DocumentSample>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<DocumentType>(builder =>
        {
            builder.HasIndex(x => x.Code).IsUnique();
            builder.Property(x => x.Code).HasMaxLength(64);
            builder.Property(x => x.Name).HasMaxLength(256);
            builder.Property(x => x.PreferredMode).HasConversion<string>().HasMaxLength(16);
        });

        modelBuilder.Entity<Template>(builder =>
        {
            builder.HasIndex(x => new { x.DocumentTypeId, x.Version }).IsUnique();
            builder.Property(x => x.Version).HasMaxLength(32);
            builder.Property(x => x.AnchorsJson).HasColumnType("TEXT");
            builder.Property(x => x.FieldsJson).HasColumnType("TEXT");
        });

        modelBuilder.Entity<DocumentSample>(builder =>
        {
            builder.Property(x => x.FileName).HasMaxLength(256);
            builder.Property(x => x.FullText).HasColumnType("TEXT");
            builder.Property(x => x.FieldsJson).HasColumnType("TEXT");
        });
    }
}
