namespace ChatApp.Models
{
    public class Chat
    {
        public int Id { get; set; }
        public DateTime CreatedAt { get; set; }
        public List<User> Users { get; set; } = new();
        public List<Message> Messages { get; set; } = new();
    }
}
