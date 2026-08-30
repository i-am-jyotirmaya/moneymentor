FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY MoneyMentor.slnx ./
COPY apps/api/MoneyMentor.Operations/MoneyMentor.Operations.csproj apps/api/MoneyMentor.Operations/
COPY apps/api/MoneyMentor.Infrastructure/MoneyMentor.Infrastructure.csproj apps/api/MoneyMentor.Infrastructure/
COPY apps/api/MoneyMentor.Application/MoneyMentor.Application.csproj apps/api/MoneyMentor.Application/
COPY apps/api/MoneyMentor.Domain/MoneyMentor.Domain.csproj apps/api/MoneyMentor.Domain/
RUN dotnet restore apps/api/MoneyMentor.Operations/MoneyMentor.Operations.csproj
COPY apps/api ./apps/api
RUN dotnet publish apps/api/MoneyMentor.Operations/MoneyMentor.Operations.csproj --configuration Release --no-restore --output /out /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/runtime:10.0 AS runtime
WORKDIR /app
COPY --from=build --chown=app:app /out ./
USER app
ENTRYPOINT ["dotnet", "MoneyMentor.Operations.dll"]
