using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class SpendingSummaryCategory
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SpendingSummaryId { get; set; }

    public string SubjectKey { get; set; } = string.Empty;

    public Guid? CategoryId { get; set; }

    public Guid? ParentCategoryId { get; set; }

    public string CategoryNameSnapshot { get; set; } = string.Empty;

    public string? ParentCategoryNameSnapshot { get; set; }

    public CategoryClassification? ClassificationSnapshot { get; set; }

    public decimal Amount { get; set; }

    public decimal? Share { get; set; }

    public int TransactionCount { get; set; }

    public decimal? PreviousAmount { get; set; }

    public decimal? PreviousDeltaAmount { get; set; }

    public decimal? PreviousDeltaPercent { get; set; }

    public MetricTrend PreviousTrend { get; set; } = MetricTrend.NotAvailable;

    public decimal? BaselineAmount { get; set; }

    public decimal? BaselineDeltaAmount { get; set; }

    public decimal? BaselineDeltaPercent { get; set; }

    public MetricTrend BaselineTrend { get; set; } = MetricTrend.NotAvailable;

    public decimal? PreviousShare { get; set; }

    public decimal? PreviousShareDeltaPoints { get; set; }

    public decimal? BaselineShare { get; set; }

    public decimal? BaselineShareDeltaPoints { get; set; }

    public bool IsNew { get; set; }

    public bool IsStopped { get; set; }

    public bool IsMaterial { get; set; }

    public JudgementDirection Direction { get; set; } = JudgementDirection.Neutral;
}
