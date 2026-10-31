
var builder = WebApplication.CreateBuilder(args);

// Настройки CORS должны быть ДО builder.Build()
builder.Services.AddCors(options =>
{
    options.AddPolicy("PhotositePolicy", policy =>
    {
        policy
            .WithOrigins(
                "http://127.0.0.1:5500",
                "http://localhost:5500"
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// CORS включается ДО обработчиков запросов
app.UseCors("PhotositePolicy");

app.MapGet("/", () => "Hello World!");

app.MapPost("/api/rate", async (HttpRequest request) =>
{
    // СЮДА нужно вернуть твой существующий код оценки фотографии.
    return Results.Problem(
        "Код оценки фотографии ещё не добавлен."
    );
});

app.Run();

