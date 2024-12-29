namespace ChatApp.Models
{
    public class Message
    {
        public int Id { get; set; }
        public int ChatId { get; set; }
        public int SenderId { get; set; }
        public int ReceiverId { get; set; }  // Alıcı ID'si eklendi
        public string Content { get; set; }
        public DateTime SentAt { get; set; }
        public bool IsRead { get; set; }

        // Navigation properties
        public Chat Chat { get; set; }
        public User Sender { get; set; }
        public User Receiver { get; set; }  // Alıcı navigation property'si
    }
}
