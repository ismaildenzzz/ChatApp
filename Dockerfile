# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies
COPY ["ChatApp/ChatApp.csproj", "ChatApp/"]
RUN dotnet restore "ChatApp/ChatApp.csproj"

# Copy all files and build
COPY . .
WORKDIR "/src/ChatApp"
RUN dotnet build "ChatApp.csproj" -c Release -o /app/build

# Publish stage
FROM build AS publish
RUN dotnet publish "ChatApp.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Final stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 80
EXPOSE 443

# Copy published files from publish stage
COPY --from=publish /app/publish .

# Set environment variables
ENV ASPNETCORE_URLS=http://+:80
ENV ASPNETCORE_ENVIRONMENT=Production

# Create a non-root user
RUN useradd -m myappuser
USER myappuser

ENTRYPOINT ["dotnet", "ChatApp.dll"] 