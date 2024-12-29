using ChatApp.Models;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Data
{
    public static class DatabaseSeeder
    {
        public static async Task SeedData(IServiceProvider serviceProvider)
        {
            using var scope = serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<ChatDbContext>();
            var logger = scope.ServiceProvider.GetRequiredService<ILogger<ChatDbContext>>();

            try
            {
                // Veritabanını oluştur
                await context.Database.EnsureCreatedAsync();

                // Eğer hiç kullanıcı yoksa
                if (!await context.Users.AnyAsync())
                {
                    logger.LogInformation("Seeding database...");

                    // Örnek kullanıcılar
                    var users = new List<User>
                    {
                        new User
                        {
                            Username = "Ahmet Yılmaz",
                            Email = "ahmet@example.com",
                            ProfileImage = "https://via.placeholder.com/50",
                            CreatedAt = DateTime.UtcNow,
                            LastSeen = DateTime.UtcNow
                        },
                        new User
                        {
                            Username = "Ayşe Demir",
                            Email = "ayse@example.com",
                            ProfileImage = "https://via.placeholder.com/50",
                            CreatedAt = DateTime.UtcNow,
                            LastSeen = DateTime.UtcNow
                        },
                        new User
                        {
                            Username = "Mehmet Kaya",
                            Email = "mehmet@example.com",
                            ProfileImage = "https://via.placeholder.com/50",
                            CreatedAt = DateTime.UtcNow,
                            LastSeen = DateTime.UtcNow
                        }
                    };

                    await context.Users.AddRangeAsync(users);
                    await context.SaveChangesAsync();

                    // Örnek sohbetler
                    var chats = new List<Chat>
                    {
                        new Chat
                        {
                            CreatedAt = DateTime.UtcNow,
                            Users = new List<User> { users[0], users[1] }
                        },
                        new Chat
                        {
                            CreatedAt = DateTime.UtcNow,
                            Users = new List<User> { users[0], users[2] }
                        }
                    };

                    await context.Chats.AddRangeAsync(chats);
                    await context.SaveChangesAsync();

                    // Örnek mesajlar
                    var messages = new List<Message>
                    {
                        new Message
                        {
                            ChatId = chats[0].Id,
                            SenderId = users[0].Id,
                            ReceiverId = users[1].Id,
                            Content = "Merhaba Ayşe, nasılsın?",
                            SentAt = DateTime.UtcNow.AddMinutes(-30),
                            IsRead = true
                        },
                        new Message
                        {
                            ChatId = chats[0].Id,
                            SenderId = users[1].Id,
                            ReceiverId = users[0].Id,
                            Content = "İyiyim Ahmet, teşekkürler. Sen nasılsın?",
                            SentAt = DateTime.UtcNow.AddMinutes(-29),
                            IsRead = true
                        }
                    };

                    await context.Messages.AddRangeAsync(messages);
                    await context.SaveChangesAsync();

                    logger.LogInformation("Database seeded successfully!");
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "An error occurred while seeding the database.");
                throw;
            }
        }
    }
}