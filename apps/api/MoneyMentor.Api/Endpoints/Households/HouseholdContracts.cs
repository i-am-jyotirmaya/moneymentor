using System.ComponentModel.DataAnnotations;

namespace MoneyMentor.Api.Endpoints.Households;

public sealed class CreateHouseholdRequest
{
    [Required]
    [MaxLength(128)]
    public string Name { get; init; } = string.Empty;
}

public sealed class AddHouseholdMemberRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; init; } = string.Empty;

    [MaxLength(32)]
    public string Role { get; init; } = "Member";
}
