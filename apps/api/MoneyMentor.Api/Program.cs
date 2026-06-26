using System.Text.Json.Serialization;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Api.Endpoints;
using MoneyMentor.Api.Endpoints.Auth;
using MoneyMentor.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
const string WebCorsPolicy = "MoneyMentorWeb";

builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<IExpenseInputParser, HeuristicExpenseInputParser>();
builder.Services.AddSingleton<IExpenseInputDraftStore, InMemoryExpenseInputDraftStore>();
builder.Services.AddScoped<IExpenseInputProcessor, ExpenseInputProcessor>();
builder.Services.AddMoneyMentorAuth(builder.Configuration);
builder.Services.AddCors(options =>
{
    options.AddPolicy(
        WebCorsPolicy,
        policy => policy
            .WithOrigins(
                "http://localhost:3000",
                "http://localhost:3001",
                "https://localhost:3000",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:3001",
                "https://127.0.0.1:3000")
            .AllowAnyHeader()
            .AllowAnyMethod());
});
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors(WebCorsPolicy);
app.UseAuthentication();
app.UseAuthorization();
app.MapMoneyMentorEndpoints();

app.Run();
