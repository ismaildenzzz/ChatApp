using ChatApp.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Pages.Account
{
    public class RegisterModel : PageModel
    {
        private readonly ChatDbContext _context;
        private readonly ILogger<RegisterModel> _logger;
        private readonly IWebHostEnvironment _environment;

        [BindProperty]
        public Models.RegisterModel Input { get; set; }

        public RegisterModel(ChatDbContext context, ILogger<RegisterModel> logger, IWebHostEnvironment environment)
        {
            _context = context;
            _logger = logger;
            _environment = environment;
        }

        public async Task<IActionResult> OnPostAsync()
        {
            if (ModelState.IsValid)
            {
                if (await _context.Users.AnyAsync(u => u.Email == Input.Email))
                {
                    ModelState.AddModelError(string.Empty, "Bu email adresi zaten kullanýlýyor");
                    return Page();
                }

                var user = new User
                {
                    Username = Input.Username,
                    Email = Input.Email,
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(Input.Password),
                    CreatedAt = DateTime.UtcNow,
                    LastSeen = DateTime.UtcNow,
                    ProfileImage = "https://via.placeholder.com/150" // Varsayýlan profil resmi
                };

                _context.Users.Add(user);
                await _context.SaveChangesAsync();

                return RedirectToPage("./Login");
            }

            return Page();
        }

        private string HashPassword(string password)
        {
            return BCrypt.Net.BCrypt.HashPassword(password);
        }
    }
}
