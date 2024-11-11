class Chat {
    constructor() {
        this.initializeElements();
        this.currentTab = 'team';
        this.isMessageImportant = false;
        this.unsubscribe = null;
        this.setupEventListeners();
        this.startRealtimeUpdates();
        this.setupDailyCleanup();
    }

    initializeElements() {
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendMessage');
        this.chatMessages = document.getElementById('chatMessages');
        this.emojiButton = document.getElementById('toggleEmoji');
        this.emojiPicker = document.getElementById('emojiPicker');
        this.markImportantButton = document.getElementById('markImportant');
        this.chatTabs = document.querySelectorAll('.tab-btn');
        
        // Emoji data
        this.emojiData = {
            smileys: ['😊', '😂', '🤣', '😅', '😆', '😍', '🥳', '👍'],
            sports: ['🏓', '⚽', '🎾', '🏃‍♂️', '💪', '🏆', '🥇', '🎯'],
            objects: ['📝', '📅', '⭐', '🎵', '📌', '💡', '🎪', '🎨']
        };
        
        this.initializeEmojiPicker();
    }

    initializeEmojiPicker() {
        const emojiList = this.emojiPicker?.querySelector('.emoji-list');
        if (emojiList) {
            Object.values(this.emojiData).flat().forEach(emoji => {
                const span = document.createElement('span');
                span.textContent = emoji;
                span.addEventListener('click', () => this.insertEmoji(emoji));
                emojiList.appendChild(span);
            });
        }
    }

    setupEventListeners() {
        // Message sending
        this.sendButton?.addEventListener('click', () => this.sendMessage());
        
        this.messageInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Emoji picker
        this.emojiButton?.addEventListener('click', () => {
            this.emojiPicker?.classList.toggle('hidden');
        });

        // Important marker
        this.markImportantButton?.addEventListener('click', () => {
            this.isMessageImportant = !this.isMessageImportant;
            this.markImportantButton.classList.toggle('active');
            this.markImportantButton.title = this.isMessageImportant ? 
                'Avmarkera som anteckning' : 'Spara som anteckning';
        });

        // Tab switching
        this.chatTabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.emojiPicker?.contains(e.target) && e.target !== this.emojiButton) {
                this.emojiPicker?.classList.add('hidden');
            }
        });
    }

    setupDailyCleanup() {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const timeUntilMidnight = tomorrow - now;

        setTimeout(() => {
            this.cleanupMessages();
            setInterval(() => this.cleanupMessages(), 24 * 60 * 60 * 1000);
        }, timeUntilMidnight);
    }

    async cleanupMessages() {
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const snapshot = await db.collection('chat')
                .where('timestamp', '<=', yesterday)
                .where('important', '==', false)
                .get();

            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log(`Cleaned up ${snapshot.docs.length} messages`);
        } catch (error) {
            console.error('Error cleaning up messages:', error);
        }
    }

    insertEmoji(emoji) {
        if (!this.messageInput) return;
        
        const cursorPos = this.messageInput.selectionStart;
        const text = this.messageInput.value;
        this.messageInput.value = text.slice(0, cursorPos) + emoji + text.slice(cursorPos);
        this.messageInput.focus();
        this.emojiPicker?.classList.add('hidden');
    }

    async sendMessage() {
        const text = this.messageInput?.value.trim();
        if (!text) return;

        try {
            await db.collection('chat').add({
                text: text,
                userId: currentUser.uid,
                userName: currentUserData.name,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                important: this.isMessageImportant,
                tab: this.currentTab
            });

            this.messageInput.value = '';
            this.isMessageImportant = false;
            this.markImportantButton.classList.remove('active');
        } catch (error) {
            console.error('Error sending message:', error);
            showNotification('Kunde inte skicka meddelandet', 'error');
        }
    }

    startRealtimeUpdates() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        let query = db.collection('chat')
            .orderBy('timestamp', 'desc')
            .limit(50);

        if (this.currentTab === 'notes') {
            query = query.where('important', '==', true);
        }

        this.unsubscribe = query.onSnapshot(snapshot => {
            this.chatMessages.innerHTML = '';
            snapshot.docs.forEach(doc => {
                const message = { id: doc.id, ...doc.data() };
                this.addMessageToUI(message);
            });
            this.scrollToBottom();
        }, error => {
            console.error('Chat update error:', error);
        });
    }

    addMessageToUI(message) {
        if (!message || !message.text) return;

        const messageElement = document.createElement('div');
        const isSentByMe = message.userId === currentUser.uid;
        
        const timestamp = message.timestamp ? message.timestamp.toDate() : new Date();
        const timeString = this.formatTime(timestamp);

        messageElement.className = `message ${isSentByMe ? 'sent' : 'received'}`;
        if (message.important) messageElement.classList.add('important');

        messageElement.innerHTML = `
            <div class="message-info">
                <span class="message-sender">${isSentByMe ? 'Du' : message.userName}</span>
                <span class="message-time">${timeString}</span>
            </div>
            <div class="message-text">${this.formatMessageText(message.text)}</div>
        `;

        this.chatMessages.appendChild(messageElement);
    }

    formatTime(date) {
        return date.toLocaleTimeString('sv-SE', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatMessageText(text) {
        return text.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
    }

    switchTab(tab) {
        this.currentTab = tab;
        
        this.chatTabs.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        this.startRealtimeUpdates();
    }

    scrollToBottom() {
        if (this.chatMessages) {
            setTimeout(() => {
                this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
            }, 100);
        }
    }
}

// Initialize chat when page loads and user is authenticated
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (currentUser && currentUserData) {
            window.chatInstance = new Chat();
        }
    }, 1000);
});
