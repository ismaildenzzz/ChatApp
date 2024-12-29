// Global değişkenler
var chatConnection = null;
var currentChatId = null;
var isMessageBeingProcessed = false;

// Şifreleme fonksiyonları
const cryptoHelpers = {
    async getKeyMaterial(password) {
        const enc = new TextEncoder();
        return await window.crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            "PBKDF2",
            false,
            ["deriveBits", "deriveKey"]
        );
    },

    async getKey(keyMaterial, salt) {
        return await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },

    async encrypt(message, chatId) {
        const keyMaterial = await this.getKeyMaterial(chatId.toString());
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const key = await this.getKey(keyMaterial, salt);
        const enc = new TextEncoder();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            enc.encode(message)
        );

        const encryptedContent = {
            encrypted: Array.from(new Uint8Array(encrypted)),
            iv: Array.from(iv),
            salt: Array.from(salt)
        };

        return JSON.stringify(encryptedContent);
    },

    async decrypt(encryptedMsg, chatId) {
        try {
            // Önce mesajın JSON formatında şifrelenmiş olup olmadığını kontrol et
            try {
                const encryptedContent = JSON.parse(encryptedMsg);
                // Eğer gerekli alanlar varsa, şifrelenmiş mesaj olarak işle
                if (encryptedContent.encrypted && encryptedContent.iv && encryptedContent.salt) {
                    const keyMaterial = await this.getKeyMaterial(chatId.toString());
                    const key = await this.getKey(keyMaterial, new Uint8Array(encryptedContent.salt));
                    const decrypted = await window.crypto.subtle.decrypt(
                        { name: "AES-GCM", iv: new Uint8Array(encryptedContent.iv) },
                        key,
                        new Uint8Array(encryptedContent.encrypted)
                    );

                    return new TextDecoder().decode(decrypted);
                }
            } catch (jsonError) {
                // JSON parse hatası aldıysak veya gerekli alanlar yoksa,
                // bu eski format bir mesajdır, olduğu gibi döndür
                return encryptedMsg;
            }

            // Eğer buraya kadar geldiyse ve hala mesaj çözülemediyse
            return encryptedMsg;
        } catch (error) {
            console.error('Decryption error:', error);
            return 'Mesaj çözülemedi';
        }
    }
};

// SignalR bağlantısını başlat
function initializeSignalR() {
    console.log('Initializing SignalR...');

    if (!chatConnection) {
        chatConnection = new signalR.HubConnectionBuilder()
            .withUrl("/chatHub")
            .withAutomaticReconnect()
            .build();

        // Mesaj alma
        chatConnection.on("ReceiveMessage", async function (message) {
            try {
                const decryptedContent = await cryptoHelpers.decrypt(message.content, message.chatId);
                // Mesajı UI'da göster (appendMessage fonksiyonunu kullan)
                appendMessage({
                    ...message,
                    content: decryptedContent
                });
                
                // Son mesajı da güncelle
                updateLastMessage(message.chatId, decryptedContent, message.sentAt);
            } catch (error) {
                console.error('Error receiving message:', error);
            }
        });

        // Yeni sohbet bildirimi alma
        chatConnection.on("NewChat", function (chatData) {
            console.log('New chat received:', chatData);
            appendNewChat(chatData);
        });

        chatConnection.start()
            .then(() => {
                console.log('SignalR Connected!');
                // Kullanıcı özel grubuna katıl
                return chatConnection.invoke("JoinUserGroup");
            })
            .then(() => {
                console.log('Joined user group');
                // Eğer aktif bir sohbet varsa, ona da katıl
                if (currentChatId) {
                    return chatConnection.invoke("JoinChat", currentChatId);
                }
            })
            .then(() => {
                if (currentChatId) {
                    console.log('Joined chat:', currentChatId);
                }
            })
            .catch(err => {
                console.error('SignalR Error:', err);
            });
    }
}

// Son mesajı güncelleme fonksiyonu
function updateLastMessage(chatId, content, sentAt) {
    const chatItem = $(`.chat-item[data-chat-id="${chatId}"]`);
    if (chatItem.length) {
        chatItem.find('.last-message').text(content);
        chatItem.find('.time').text(new Date(sentAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        }));

        // Sohbeti listenin başına taşı
        chatItem.prependTo('.chat-list');
    }
}

// Event listener'ları başlat
function initializeEventListeners() {
    console.log('Initializing event listeners');

    // Sohbet öğelerine tıklama olayı
    $(document).on('click', '.chat-item', function (e) {
        console.log('Chat item clicked');
        e.preventDefault();
        const chatId = $(this).data('chat-id');
        const userId = $(this).data('user-id');
        console.log('Selected chat ID:', chatId, 'User ID:', userId);
        if (chatId) {
            loadAndSwitchChat(chatId, userId);
        }
    });

    // Mesaj gönderme butonu
    $(document).on('click', '.send-button', function (e) {
        console.log('Send button clicked');
        e.preventDefault();
        sendMessageFromInput();
    });

    // Enter tuşu ile mesaj gönderme
    $(document).on('keypress', '#messageInput', function (e) {
        if (e.which === 13 && !e.shiftKey) {
            console.log('Enter key pressed');
            e.preventDefault();
            sendMessageFromInput();
        }
    });
}

async function loadAndSwitchChat(chatId, userId) {
    console.log('Loading chat:', chatId, 'with user:', userId);

    try {
        // Sohbet mesajlarını getir
        const response = await fetch(`/api/chat/${chatId}/messages`);
        if (!response.ok) throw new Error('Failed to fetch messages');

        const messages = await response.json();
        console.log('Fetched messages:', messages);

        // Chat UI'ı güncelle
        updateChatUI(chatId, userId, messages);

        // SignalR sohbet grubuna katıl
        if (chatConnection?.state === signalR.HubConnectionState.Connected) {
            await chatConnection.invoke("JoinChat", chatId);
        }

        // Global chat ID'yi güncelle
        currentChatId = chatId;

    } catch (error) {
        console.error('Error loading chat:', error);
    }
}

function sendMessageFromInput() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput?.value.trim() ?? '';
    console.log('Attempting to send message:', message);

    if (message && currentChatId && chatConnection?.state === signalR.HubConnectionState.Connected) {
        console.log('Sending message to chat:', currentChatId);

        chatConnection.invoke("SendMessage", currentChatId, message)
            .then(() => {
                console.log('Message sent successfully');
                messageInput.value = '';

                // Mesajı hemen UI'a eklemeye gerek yok, 
                // SignalR üzerinden gelecek
            })
            .catch(err => {
                console.error('Error sending message:', err);
                alert('Mesaj gönderilemedi. Lütfen tekrar deneyin.');
            });
    } else {
        console.warn('Cannot send message:', {
            hasMessage: !!message,
            chatId: currentChatId,
            connectionState: chatConnection?.state
        });
    }
}

// SignalR bağlantıs

// Mesaj gönderme fonksiyonu
async function sendMessageFromInput() {
    if (isMessageBeingProcessed) return;

    const messageInput = document.getElementById('messageInput');
    const message = messageInput?.value.trim() ?? '';

    if (message && currentChatId && chatConnection?.state === signalR.HubConnectionState.Connected) {
        try {
            isMessageBeingProcessed = true;
            console.log('Sending message:', { chatId: currentChatId, message });

            await chatConnection.invoke("SendMessage", currentChatId, message);
            messageInput.value = '';

            // Mesajı gönderen tarafta eklemeye gerek yok, 
            // ReceiveMessage event'i ile eklenecek

        } catch (err) {
            console.error('Error sending message:', err);
            alert('Mesaj gönderilemedi. Lütfen tekrar deneyin.');
        } finally {
            isMessageBeingProcessed = false;
        }
    }
}

// Sohbet değiştirme fonksiyonunu da güncelleyelim
async function switchChat(chatId, chatElement) {
    if (currentChatId === chatId) return;

    try {
        // Önceki sohbetten ayrıl
        if (currentChatId && chatConnection?.state === signalR.HubConnectionState.Connected) {
            await chatConnection.invoke("LeaveChat", currentChatId);
        }

        currentChatId = chatId;

        // Yeni sohbete katıl
        if (chatConnection?.state === signalR.HubConnectionState.Connected) {
            await chatConnection.invoke("JoinChat", chatId);
        }

        // UI güncellemeleri...
        updateChatUI(chatId, chatElement);

    } catch (error) {
        console.error('Error switching chat:', error);
    }
}

// Mesajları yükle
async function loadMessages(chatId) {
    console.log('Loading messages for chat:', chatId);

    try {
        const response = await fetch(`/api/chat/${chatId}/messages`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const messages = await response.json();
        console.log('Retrieved messages:', messages);

        $('.chat-messages').empty();
        messages.forEach(appendMessage);
        scrollToBottom();

    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Mesaj ekleme fonksiyonu
function appendMessage(message) {
    console.log('Appending message:', message, 'Current user:', currentUserId);

    // Mesajın gönderen bilgisini kontrol et
    const isSentByMe = message.senderId === currentUserId;

    const messageHtml = `
        <div class="message ${isSentByMe ? 'sent' : 'received'}">
            <div class="message-content">
                <p>${message.content}</p>
                <span class="message-time">
                    ${new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    ${isSentByMe ? '<i class="fas fa-check"></i>' : ''}
                </span>
            </div>
        </div>
    `;

    $('.chat-messages').append(messageHtml);
    scrollToBottom();
}

// Chat UI güncelleme
function updateChatUI(chatId, userId, messages) {
    console.log('Updating chat UI');

    // Aktif sohbet öğesini güncelle
    $('.chat-item').removeClass('active');
    $(`.chat-item[data-chat-id="${chatId}"]`).addClass('active');

    // Kullanıcı bilgilerini güncelle
    const chatItem = $(`.chat-item[data-chat-id="${chatId}"]`);
    const username = chatItem.find('h4').text();
    const userImage = chatItem.find('img').attr('src');

    $('#chatUserName').text(username);
    $('#chatUserImage').attr('src', userImage);

    // Mesaj alanını temizle ve yeni mesajları ekle
    $('.chat-messages').empty();
    if (messages && messages.length > 0) {
        messages.forEach(message => appendMessage(message));
        scrollToBottom();
    }

    // Chat alanını göster
    $('.chat-area').addClass('active');
    $('#messageInput').focus();
}

// Sohbet alanını en alta kaydır
function scrollToBottom() {
    const chatMessages = $('.chat-messages');
    chatMessages.scrollTop(chatMessages[0].scrollHeight);
}

// Tab değiştirme
$('.tab-btn').on('click', function () {
    $('.tab-btn').removeClass('active');
    $(this).addClass('active');

    const tabId = $(this).data('tab');
    $('.tab-content').hide();
    $(`#${tabId}Tab`).show();
});

// Kullanıcı arama
$('#userSearch').on('input', function () {
    const searchText = $(this).val().toLowerCase();

    $('.user-item, .chat-item').each(function () {
        const username = $(this).find('h4').text().toLowerCase();
        $(this).toggle(username.includes(searchText));
    });
});

// Yeni sohbet başlatma
async function startNewChat(userId) {
    try {
        // Önce bu kullanıcı ile mevcut bir sohbet var mı kontrol et
        const response = await fetch(`/api/chat/user/${userId}`);
        
        if (response.ok) {
            const chatData = await response.json();
            
            if (chatData) {
                // Mevcut sohbet varsa, o sohbeti aç
                loadAndSwitchChat(chatData.chatId, userId);
            } else {
                // Mevcut sohbet yoksa, yeni sohbet başlat
                createNewChat(userId);
            }
        } else {
            console.error('Sohbet bilgisi alınamadı');
        }
    } catch (error) {
        console.error('Bir hata oluştu:', error);
    }
}

async function createNewChat(userId) {
    try {
        const response = await fetch('/api/Chat/Create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: userId })
        });

        if (response.ok) {
            const newChat = await response.json();
            
            // Yeni oluşturulan sohbeti aç
            openExistingChat(newChat.chatId);
        }
    } catch (error) {
        console.error('Yeni sohbet oluşturulurken hata oluştu:', error);
    }
}

// Yeni sohbet ekleme fonksiyonu
function appendNewChat(chatData) {
    // Eğer bu sohbet zaten varsa, güncelle
    const existingChat = $(`.chat-item[data-chat-id="${chatData.chatId}"]`);
    if (existingChat.length > 0) {
        updateLastMessage(chatData.chatId, chatData.lastMessage, chatData.sentAt);
        return;
    }

    // Yeni sohbet HTML'i oluştur
    const chatHtml = `
        <div class="chat-item" data-chat-id="${chatData.chatId}" data-user-id="${chatData.userId}">
            <div class="chat-item-img">
                <img src="${chatData.profileImage || 'https://via.placeholder.com/40'}" alt="${chatData.username}">
            </div>
            <div class="chat-item-info">
                <div class="top-row">
                    <h4>${chatData.username}</h4>
                    <span class="time">${new Date(chatData.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="bottom-row">
                    <p class="last-message">${chatData.lastMessage}</p>
                    <div class="unread-count">1</div>
                </div>
            </div>
        </div>
    `;

    // Sohbeti listenin başına ekle
    $('.chat-list').prepend(chatHtml);

    // Yeni sohbet için click event listener'ı ekle
    $(`.chat-item[data-chat-id="${chatData.chatId}"]`).on('click', function () {
        const chatId = $(this).data('chat-id');
        if (chatId) {
            switchChat(chatId, this);
        }
    });
}

// Mesaj gönderme fonksiyonunu güncelle
async function sendMessage(chatId, content) {
    try {
        const encryptedContent = await cryptoHelpers.encrypt(content, chatId);
        await chatConnection.invoke("SendMessage", chatId, encryptedContent);
        document.getElementById('messageInput').value = '';
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

// Geçmiş mesajları yükleme fonksiyonunu güncelle
async function loadChatHistory(chatId) {
    try {
        const response = await fetch(`/api/chat/${chatId}/messages`);
        const messages = await response.json();
        
        // Tüm mesajları deşifre et
        const decryptedMessages = await Promise.all(messages.map(async (msg) => ({
            ...msg,
            content: await cryptoHelpers.decrypt(msg.content, chatId)
        })));

        displayChatHistory(decryptedMessages);
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// DOM yüklendiğinde
// Document ready olduğunda çalışacak ana fonksiyon
$(document).ready(function () {
    console.log('Document ready');
    initializeEventListeners();
    initializeSignalR();
});