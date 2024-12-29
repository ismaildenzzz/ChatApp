using ChatApp.Models;
using ChatApp;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[Authorize]
public class IndexModel : PageModel
{
    private readonly ChatDbContext _context;
    private readonly ILogger<IndexModel> _logger;

    public User CurrentUser { get; set; }
    public List<User> OtherUsers { get; set; }
    public List<Chat> UserChats { get; set; }

    public IndexModel(ChatDbContext context, ILogger<IndexModel> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<IActionResult> OnGetAsync()
    {
        var userId = int.Parse(User.FindFirst("UserId")?.Value);

        // Mevcut kullanıcıyı al
        CurrentUser = await _context.Users.FindAsync(userId);
        if (CurrentUser == null)
        {
            return NotFound();
        }

        // Diğer kullanıcıları al
        OtherUsers = await _context.Users
            .Where(u => u.Id != userId)
            .OrderBy(u => u.Username)
            .ToListAsync();

        // Mevcut sohbetleri al
        UserChats = await _context.Chats
            .Include(c => c.Users)
            .Include(c => c.Messages.OrderByDescending(m => m.SentAt).Take(1))
            .Where(c => c.Users.Any(u => u.Id == userId))
            .ToListAsync();

        return Page();
    }
}