using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ChatApp.Data;
using ChatApp.Models;
using Microsoft.AspNetCore.Authorization;

namespace ChatApp.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/chat")]
    public class ChatController : ControllerBase
    {
        private readonly ChatDbContext _context;
        private readonly ILogger<ChatController> _logger;

        public ChatController(ChatDbContext context, ILogger<ChatController> logger)
        {
            _context = context;
            _logger = logger;
        }

        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetChatByUserId(int userId)
        {
            try
            {
                var userIdClaim = User.FindFirst("UserId");
                if (userIdClaim == null)
                {
                    return Unauthorized("User ID not found in claims");
                }
                var currentUserId = int.Parse(userIdClaim.Value);

                var chat = await _context.Chats
                    .Include(c => c.Users)
                    .Include(c => c.Messages.OrderByDescending(m => m.SentAt).Take(1))
                    .Where(c => c.Users.Any(u => u.Id == currentUserId) && 
                            c.Users.Any(u => u.Id == userId))
                    .FirstOrDefaultAsync();

                if (chat == null)
                {
                    return NotFound();
                }

                var otherUser = await _context.Users
                    .Where(u => u.Id == userId)
                    .Select(u => new { u.Id, u.Username, u.ProfileImage })
                    .FirstOrDefaultAsync();

                var result = new
                {
                    chatId = chat.Id,
                    user = otherUser,
                    lastMessage = chat.Messages.Select(m => new
                    {
                        m.Id,
                        m.Content,
                        m.SenderId,
                        m.SentAt,
                        m.IsRead
                    }).FirstOrDefault()
                };

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error retrieving chat for users {userId}");
                return StatusCode(500, "Internal server error");
            }
        }

        [HttpGet("{chatId}/messages")]
        public async Task<IActionResult> GetMessages(int chatId)
        {
            try
            {
                var messages = await _context.Messages
                    .Include(m => m.Sender)
                    .Where(m => m.ChatId == chatId)
                    .OrderBy(m => m.SentAt)
                    .Select(m => new
                    {
                        id = m.Id,
                        content = m.Content,
                        senderId = m.SenderId,
                        senderName = m.Sender.Username,
                        sentAt = m.SentAt,
                        isRead = m.IsRead
                    })
                    .ToListAsync();

                _logger.LogInformation($"Retrieved {messages.Count} messages for chat {chatId}");
                return Ok(messages);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error retrieving messages for chat {chatId}");
                return StatusCode(500, "Internal server error");
            }
        }

        [HttpPost("create")]
        public async Task<IActionResult> CreateChat([FromBody] CreateChatRequest request)
        {
            try
            {
                _logger.LogInformation($"Creating chat with user {request.UserId}");

                // Mevcut kullanıcı ID'sini al
                var userIdClaim = User.FindFirst("UserId");
                if (userIdClaim == null)
                {
                    return Unauthorized("User ID not found in claims");
                }
                var currentUserId = int.Parse(userIdClaim.Value);
                _logger.LogInformation($"Current user ID: {currentUserId}");

                // Önce mevcut sohbeti kontrol et
                var existingChat = await _context.Chats
                    .Include(c => c.Users)
                    .FirstOrDefaultAsync(c =>
                        c.Users.Any(u => u.Id == currentUserId) &&
                        c.Users.Any(u => u.Id == request.UserId));

                if (existingChat != null)
                {
                    _logger.LogInformation($"Existing chat found with ID: {existingChat.Id}");
                    return Ok(new { id = existingChat.Id });
                }

                // Kullanıcıları bul
                var currentUser = await _context.Users.FindAsync(currentUserId);
                var otherUser = await _context.Users.FindAsync(request.UserId);

                if (currentUser == null)
                {
                    _logger.LogError($"Current user not found: {currentUserId}");
                    return NotFound("Current user not found");
                }

                if (otherUser == null)
                {
                    _logger.LogError($"Other user not found: {request.UserId}");
                    return NotFound("Other user not found");
                }

                // Yeni sohbet oluştur
                var newChat = new Chat
                {
                    CreatedAt = DateTime.UtcNow,
                    Users = new List<User> { currentUser, otherUser }
                };

                _context.Chats.Add(newChat);
                await _context.SaveChangesAsync();

                _logger.LogInformation($"New chat created with ID: {newChat.Id}");
                return Ok(new { id = newChat.Id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating chat");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        public class CreateChatRequest
        {
            public int UserId { get; set; }
        }
    }
}