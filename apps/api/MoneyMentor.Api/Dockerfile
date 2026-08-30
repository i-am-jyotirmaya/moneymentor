FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY MoneyMentor.slnx ./
COPY apps/api/MoneyMentor.Api/MoneyMentor.Api.csproj apps/api/MoneyMentor.Api/
COPY apps/api/MoneyMentor.Operations/MoneyMentor.Operations.csproj apps/api/MoneyMentor.Operations/
COPY apps/api/MoneyMentor.Application/MoneyMentor.Application.csproj apps/api/MoneyMentor.Application/
COPY apps/api/MoneyMentor.Domain/MoneyMentor.Domain.csproj apps/api/MoneyMentor.Domain/
COPY apps/api/MoneyMentor.Infrastructure/MoneyMentor.Infrastructure.csproj apps/api/MoneyMentor.Infrastructure/
RUN dotnet restore apps/api/MoneyMentor.Api/MoneyMentor.Api.csproj
RUN dotnet restore apps/api/MoneyMentor.Operations/MoneyMentor.Operations.csproj
COPY apps/api ./apps/api
RUN dotnet publish apps/api/MoneyMentor.Api/MoneyMentor.Api.csproj --configuration Release --no-restore --output /out /p:UseAppHost=false
RUN dotnet publish apps/api/MoneyMentor.Operations/MoneyMentor.Operations.csproj --configuration Release --no-restore --output /operations /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_EnableDiagnostics=0
COPY --from=build --chown=app:app /out ./
COPY --from=build --chown=app:app /operations ./operations
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "MoneyMentor.Api.dll"]
