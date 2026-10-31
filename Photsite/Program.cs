
using System.Text.Json;
using System.Text.Json.Nodes;

var builder = WebApplication.CreateBuilder(args);


builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod());
});

builder.Services.AddHttpClient();

var app = builder.Build();
app.UseCors("PhotositePolicy");
app.UseCors();

app.MapGet("/", () => Results.Ok(new
{
    status = "API работает",
    endpoint = "/api/rate"
}));

app.MapPost("/api/rate", async (
    HttpRequest request,
    IHttpClientFactory httpClientFactory) =>
{
    if (!request.HasFormContentType)
        return Results.BadRequest(new { error = "Ожидается multipart/form-data." });

    var form = await request.ReadFormAsync();
    var photo = form.Files.GetFile("photo");

    if (photo == null || photo.Length == 0)
        return Results.BadRequest(new { error = "Фотография не получена." });

    if (photo.Length > 10 * 1024 * 1024)
        return Results.BadRequest(new { error = "Максимальный размер фото — 10 МБ." });

    var token = Environment.GetEnvironmentVariable("HUGGINGFACE_TOKEN");

    if (string.IsNullOrWhiteSpace(token))
    {
        return Results.Problem(
            "Не задан токен HUGGINGFACE_TOKEN.",
            statusCode: 500);
    }

    try
    {
        await using var stream = new MemoryStream();
        await photo.CopyToAsync(stream);

        var contentType = string.IsNullOrWhiteSpace(photo.ContentType)
            ? "image/jpeg"
            : photo.ContentType;

        var dataUrl =
            $"data:{contentType};base64,{Convert.ToBase64String(stream.ToArray())}";

        var prompt = """
        Оцени фотографию по четырём критериям от 1 до 10:
        focus — качество и фокус;
        composition — перспектива и композиция;
        geometry — геометрия кадра;
        light — свет и экспозиция.

        Верни только JSON без Markdown:
        {"focus":7,"composition":8,"geometry":7,"light":8,"comment":"Краткий отзыв на русском"}
        Числа должны быть целыми от 1 до 10.
        """;

        var payload = new
        {
            model = "meta-llama/Llama-3.2-11B-Vision-Instruct",
            messages = new object[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "text", text = prompt },
                        new
                        {
                            type = "image_url",
                            image_url = new { url = dataUrl }
                        }
                    }
                }
            },
            max_tokens = 500,
            temperature = 0.2
        };

        using var client = httpClientFactory.CreateClient();

        using var apiRequest = new HttpRequestMessage(
            HttpMethod.Post,
            "https://router.huggingface.co/v1/chat/completions");

        apiRequest.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue(
                "Bearer", token);

        apiRequest.Content = new StringContent(
            JsonSerializer.Serialize(payload),
            System.Text.Encoding.UTF8,
            "application/json");

        using var response = await client.SendAsync(apiRequest);
        var raw = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            return Results.Problem(
                $"Ошибка сервиса нейросети ({(int)response.StatusCode}): {raw}",
                statusCode: 502);
        }

        var apiJson = JsonNode.Parse(raw);
        var answer = apiJson?["choices"]?[0]?["message"]?["content"]?.ToString();

        if (string.IsNullOrWhiteSpace(answer))
            return Results.Problem("Нейросеть не вернула ответ.", statusCode: 502);

        // Удаляем возможную Markdown-обёртку вокруг JSON.
        answer = answer.Trim();

        if (answer.StartsWith("```"))
        {
            var firstNewline = answer.IndexOf('\n');
            if (firstNewline >= 0)
                answer = answer[(firstNewline + 1)..];

            if (answer.TrimEnd().EndsWith("```"))
                answer = answer.TrimEnd()[..^3].Trim();
        }

        var scores = JsonNode.Parse(answer);

        int ReadScore(string key)
        {
            var value = scores?[key]?.GetValue<int>() ?? 0;

            if (value < 1 || value > 10)
                throw new JsonException($"Некорректная оценка: {key}");

            return value;
        }

        var focus = ReadScore("focus");
        var composition = ReadScore("composition");
        var geometry = ReadScore("geometry");
        var light = ReadScore("light");

        return Results.Json(new
        {
            average = Math.Round(
                (focus + composition + geometry + light) / 4.0, 1),
            criteria = new
            {
                focus,
                composition,
                geometry,
                light
            },
            comment = scores?["comment"]?.ToString() ?? ""
        });
    }
    catch (JsonException)
    {
        return Results.Problem(
            "Не удалось разобрать ответ нейросети. Попробуй загрузить фото ещё раз.",
            statusCode: 502);
    }
    catch (HttpRequestException)
    {
        return Results.Problem(
            "Не удалось подключиться к сервису нейросети.",
            statusCode: 502);
    }
});

app.Run();

