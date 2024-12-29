// Global değişkenler
var chatConnection = null;
var currentChatId = null;

// SignalR bağlantısını başlat
function initializeSignalR() {
    console.log('Initializing SignalR...');

    if (!chatConnection) {
        chatConnection = new signalR.HubConnectionBuilder()
            .withUrl("/chatHub")
            .withAutomaticReconnect()
            .configureLogging(signalR.LogLevel.Information)
            .build();

        chatConnection.onreconnecting(error => {
            console.log('Reconnecting...', error);
        });

        chatConnection.onreconnected(connectionId => {
            console.log('Reconnected!', connectionId);
            if (currentChatId) {
                chatConnection.invoke("JoinChat", currentChatId);
            }
        });

        chatConnection.on("ReceiveMessage", function (message) {
            console.log('Message received:', message);
            appendMessage(message);
        });

        chatConnection.start()
            .then(() => {
                console.log('SignalR Connected!');
            })
            .catch(err => {
                console.error('SignalR Connection Error: ', err);
            });
    }
}

// Event listener'ları başlat
function initializeEventListeners() {
    console.log('Initializing event listeners');

    // Sohbet seçme
    $('.chat-item').on('click', function (e) {
        console.log('Chat item clicked');
        e.preventDefault();

        const chatId = $(this).data('chat-id');
        console.log('Selected chat ID:', chatId);

        if (chatId) {
            switchChat(chatId, this);
        }
    });

    // Mesaj gönderme - click event
    $('.send-button').on('click', function () {
        console.log('Send button clicked');
        sendMessageFromInput();
    });

    //// Mesaj gönderme - enter key event
    //$('#messageInput').on('keypress', function (e) {
    //    if (e.which === 13 && !e.shiftKey) {
    //        console.log('Enter key pressed');
    //        e.preventDefault();
    //        sendMessageFromInput();
    //    }
    //});
}

// Mesaj gönderme fonksiyonu
function sendMessageFromInput() {
    const input = $('#messageInput');
    console.log('Input element:', input.length ? 'found' : 'not found');

    const message = input.val();
    console.log('Raw message value:', message);

    const trimmedMessage = message ? message.trim() : '';
    console.log('Trimmed message:', trimmedMessage);

    if (trimmedMessage && currentChatId && chatConnection?.state === signalR.HubConnectionState.Connected) {
        console.log('Sending message:', {
            chatId: currentChatId,
            message: trimmedMessage,
            connectionState: chatConnection.state
        });

        chatConnection.invoke("SendMessage", currentChatId, trimmedMessage)
            .then(() => {
                console.log('Message sent successfully');
                input.val(''); // Input'u temizle

                // Mesajı hemen UI'a ekle
                appendMessage({
                    content: trimmedMessage,
                    senderId: currentUserId,
                    sentAt: new Date(),
                    isRead: false
                });
            })
            .catch(err => {
                console.error('Error sending message:', err);
                alert('Mesaj gönderilemedi. Lütfen tekrar deneyin.');
            });
    } else {
        console.warn('Cannot send message:', {
            messageExists: !!trimmedMessage,
            chatIdExists: !!currentChatId,
            connectionState: chatConnection?.state,
            inputValue: message
        });
    }
}

// Sohbet değiştirme
async function switchChat(chatId, element) {
    console.log('Switching to chat:', chatId);

    try {
        if (currentChatId && chatConnection?.state === signalR.HubConnectionState.Connected) {
            await chatConnection.invoke("LeaveChat", currentChatId);
        }

        currentChatId = chatId;

        if (chatConnection?.state === signalR.HubConnectionState.Connected) {
            await chatConnection.invoke("JoinChat", chatId);
        }

        updateChatUI(element);
        await loadMessages(chatId);

    } catch (error) {
        console.error('Error in switchChat:', error);
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
    console.log('Appending message:', message);

    const messageHtml = `
        <div class="message ${message.senderId === currentUserId ? 'sent' : 'received'}">
            <div class="message-content">
                <p>${message.content}</p>
                <span class="message-time">
                    ${new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    ${message.senderId === currentUserId ? '<i class="fas fa-check"></i>' : ''}
                </span>
            </div>
        </div>
    `;

    $('.chat-messages').append(messageHtml);
    scrollToBottom();
}

// Chat UI güncelleme
function updateChatUI(element) {
    console.log('Updating chat UI');

    $('.chat-item').removeClass('active');
    $(element).addClass('active');

    const userName = $(element).find('h4').text();
    const userImg = $(element).find('img').attr('src');

    $('#chatUserName').text(userName);
    $('#chatUserImage').attr('src', userImg);
    $('#chatUserStatus').text('Çevrimiçi');

    if (window.innerWidth <= 768) {
        $('.container').addClass('show-chat');
    }
}

// Sohbet alanını en alta kaydır
function scrollToBottom() {
    const chatMessages = $('.chat-messages');
    chatMessages.scrollTop(chatMessages[0].scrollHeight);
}

// DOM yüklendiğinde başlat
$(document).ready(function () {
    console.log('Document ready');
    initializeSignalR();
    initializeEventListeners();
});