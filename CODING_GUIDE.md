# MoneyMentor Coding Guide

## Product Direction

MoneyMentor is an assistant-first personal finance guide.
Users enter natural language expenses and finance questions.

## Architecture

- .NET 8 backend
- Modular monolith
- Domain/Application/Infrastructure/API separation
- Backend owns all financial calculations
- AI only parses, explains, and suggests

## Rules

- Do not let AI directly write financial records without backend validation
- All money calculations must use decimal
- All dates must be timezone-aware at API boundary
- Store original SourceText for every transaction
- Always write tests for parsing and financial calculations
- Keep handlers small and focused
- Do not introduce microservices
- Do not introduce unnecessary libraries

## Main Modules

- Transactions
- Categories
- Assistant
- Reports
- Insights
- Households

## Naming

- Use Guid IDs
- Use DateOnly for transaction dates where possible
- Use decimal for Amount
