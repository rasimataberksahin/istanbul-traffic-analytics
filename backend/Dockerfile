# syntax=docker/dockerfile:1

# Build stage: restore with the central package versions, then publish.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Directory.Build.props Directory.Packages.props ./
COPY src/IstanbulTraffic.Domain/IstanbulTraffic.Domain.csproj src/IstanbulTraffic.Domain/
COPY src/IstanbulTraffic.Application/IstanbulTraffic.Application.csproj src/IstanbulTraffic.Application/
COPY src/IstanbulTraffic.Infrastructure/IstanbulTraffic.Infrastructure.csproj src/IstanbulTraffic.Infrastructure/
COPY src/IstanbulTraffic.Api/IstanbulTraffic.Api.csproj src/IstanbulTraffic.Api/
RUN dotnet restore src/IstanbulTraffic.Api/IstanbulTraffic.Api.csproj

COPY src/ src/
RUN dotnet publish src/IstanbulTraffic.Api/IstanbulTraffic.Api.csproj \
    --configuration Release --no-restore --output /app /p:UseAppHost=false

# Runtime stage: only the published output, running as the image's non-root user.
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_gcServer=0
# Npgsql probes for Kerberos at startup; the library keeps that probe from logging an error.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app ./
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "IstanbulTraffic.Api.dll"]
