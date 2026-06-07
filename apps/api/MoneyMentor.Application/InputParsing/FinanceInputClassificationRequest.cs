namespace MoneyMentor.Application.InputParsing;

public sealed record FinanceInputClassificationRequest(
    string SourceText,
    string AuthProvider,
    string AuthSubject,
    string? Locale);
