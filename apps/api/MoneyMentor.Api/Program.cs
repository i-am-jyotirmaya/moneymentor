using System.Text.Json.Serialization;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Api.Endpoints;
using MoneyMentor.Api.Endpoints.Auth;
using MoneyMentor.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<IExpenseInputParser, HeuristicExpenseInputParser>();
builder.Services.AddMoneyMentorAuth(builder.Configuration);
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.MapMoneyMentorEndpoints();

app.Run();
