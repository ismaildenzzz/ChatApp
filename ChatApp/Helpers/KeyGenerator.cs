using System.Security.Cryptography;

namespace ChatApp.Helpers
{
    public static class KeyGenerator
    {
        public static (string key, string iv) GenerateKeyAndIV()
        {
            using (var aes = Aes.Create())
            {
                aes.GenerateKey();
                aes.GenerateIV();
                
                string key = Convert.ToBase64String(aes.Key); // 32 bytes key
                string iv = Convert.ToBase64String(aes.IV);   // 16 bytes IV
                
                return (key, iv);
            }
        }
    }
} 