using Microsoft.AspNetCore.SignalR;
using ChatApp.Data;
using ChatApp.Models;
using Microsoft.EntityFrameworkCore;
using ChatApp.Services;

namespace ChatApp.Hubs
{
    public class ChatHub : Hub
    {
        private readonly ChatDbContext _context;
        private readonly ILogger<ChatHub> _logger;
        private readonly IEncryptionService _encryptionService;

        public ChatHub(
            ChatDbContext context, 
            ILogger<ChatHub> logger,
            IEncryptionService encryptionService)
        {
            _context = context;
            _logger = logger;
            _encryptionService = encryptionService;
        }

        public override async Task OnConnectedAsync()
        {
            _logger.LogInformation($"Client connected: {Context.ConnectionId}");
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _logger.LogInformation($"Client disconnected: {Context.ConnectionId}");
            await base.OnDisconnectedAsync(exception);
        }

        public async Task SendMessage(int chatId, string encryptedContent)
        {
            try
            {
                var senderId = int.Parse(Context.User.FindFirst("UserId").Value);
                var sender = await _context.Users.FindAsync(senderId);

                if (sender == null)
                {
                    _logger.LogError("No sender found");
                    return;
                }

                var chat = await _context.Chats
                    .Include(c => c.Users)
                    .FirstOrDefaultAsync(c => c.Id == chatId);

                if (chat == null)
                {
                    _logger.LogError($"Chat {chatId} not found");
                    return;
                }

                var receiver = chat.Users.FirstOrDefault(u => u.Id != senderId);
                if (receiver == null)
                {
                    _logger.LogError($"No receiver found in chat {chatId}");
                    return;
                }

                var message = new Message
                {
                    ChatId = chatId,
                    SenderId = senderId,
                    ReceiverId = receiver.Id,
                    Content = encryptedContent,
                    SentAt = DateTime.UtcNow,
                    IsRead = false
                };

                _context.Messages.Add(message);
                await _context.SaveChangesAsync();

                await Clients.Group(chatId.ToString()).SendAsync("ReceiveMessage", new
                {
                    id = message.Id,
                    chatId = message.ChatId,
                    content = encryptedContent,
                    senderId = message.SenderId,
                    receiverId = message.ReceiverId,
                    senderName = sender.Username,
                    receiverName = receiver.Username,
                    sentAt = message.SentAt,
                    isRead = message.IsRead
                });

                await Clients.Group($"User_{receiver.Id}").SendAsync("NewChat", new
                {
                    chatId = chat.Id,
                    userId = senderId,
                    username = sender.Username,
                    profileImage = sender.ProfileImage,
                    lastMessage = "Yeni mesaj",
                    sentAt = message.SentAt
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in SendMessage");
                throw;
            }
        }

        // Kullanıcı kendi grubuna katılır
        public async Task JoinUserGroup()
        {
            try
            {
                var userId = Context.User?.FindFirst("UserId")?.Value;
                if (!string.IsNullOrEmpty(userId))
                {
                    var userGroup = $"User_{userId}";
                    _logger.LogInformation($"User {userId} joining group {userGroup}");
                    await Groups.AddToGroupAsync(Context.ConnectionId, userGroup);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in JoinUserGroup");
                throw;
            }
        }

        // Sohbete katılma
        public async Task JoinChat(int chatId)
        {
            try
            {
                var userId = Context.User?.FindFirst("UserId")?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    _logger.LogError("No user ID found in context");
                    return;
                }

                var chat = await _context.Chats
                    .Include(c => c.Users)
                    .FirstOrDefaultAsync(c => c.Id == chatId);

                if (chat == null)
                {
                    _logger.LogError($"Chat {chatId} not found");
                    return;
                }

                // Kullanıcının bu sohbete erişim yetkisi var mı kontrol et
                if (!chat.Users.Any(u => u.Id == int.Parse(userId)))
                {
                    _logger.LogError($"User {userId} not authorized for chat {chatId}");
                    return;
                }

                await Groups.AddToGroupAsync(Context.ConnectionId, chatId.ToString());
                _logger.LogInformation($"User {userId} joined chat {chatId}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in JoinChat");
                throw;
            }
        }

        public async Task LeaveChat(int chatId)
        {
            try
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, chatId.ToString());
                _logger.LogInformation($"User left chat {chatId}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in LeaveChat");
                throw;
            }
        }

        public async Task<List<Message>> GetMessages(int chatId)
        {
            var messages = await _context.Messages
                .Where(m => m.ChatId == chatId)
                .ToListAsync();

            // Mesajları deşifre et
            foreach (var message in messages)
            {
                message.Content = _encryptionService.Decrypt(message.Content);
            }

            return messages;
        }
    }
}