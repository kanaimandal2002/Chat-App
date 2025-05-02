const net = require('net');
const fs = require('fs');
const path = require('path');

let clients = [];
let clientId = 0;
let messageId = 0;
const typingStatus = new Map();
const chatHistory = new Map();
const usersFilePath = path.join(__dirname, 'users.json');
const bannedFilePath = path.join(__dirname, 'banned.json');
const emojiMap = {
  ':smile:': '😄',
  ':heart:': '❤️',
  ':thumbsup:': '👍',
  ':fire:': '🔥',
  ':laugh:': '😂',
  ':cry:': '😢',
  ':star:': '⭐',
  ':check:': '✅',
  ':x:': '❌',
  ':sun:': '☀️',
  // Add more as desired
};

if (!fs.existsSync(usersFilePath)) fs.writeFileSync(usersFilePath, '[]');
if (!fs.existsSync(bannedFilePath)) fs.writeFileSync(bannedFilePath, '[]');

function loadUsers() {
  return JSON.parse(fs.readFileSync(usersFilePath));
}

function saveUsers(users) {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
}

function loadBanned() {
  return JSON.parse(fs.readFileSync(bannedFilePath));
}

function saveBanned(banned) {
  fs.writeFileSync(bannedFilePath, JSON.stringify(banned, null, 2));
}

function logMessage(message) {
  const logEntry = `${new Date().toISOString()} ${message}`;
  fs.appendFile('chat.log', logEntry + '\n', (err) => {
    if (err) console.error('Failed to write to log:', err);
  });
}

function getTimeStamp() {
  const now = new Date();
  return `[${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]`;
}

function broadcast(message, senderSocket, room = null) {
  clients.forEach(client => {
    if (client.socket !== senderSocket && !client.paused) {
      if (!room || client.room === room) {
        client.socket.write(message);
      }
    }
  });
}

function replaceEmojis(text) {
  for (const [code, emoji] of Object.entries(emojiMap)) {
    text = text.split(code).join(emoji);
  }
  return text;
}

function sendClientCount() {
  const msg = `>> Total clients online: ${clients.length}\n`;
  clients.forEach(client => client.socket.write(msg));
}

const server = net.createServer((socket) => {
  clientId++;
  const thisClientId = clientId;
  let clientName = `Client${thisClientId}`;
  let named = false;
  let loginStage = 'username';
  let tempUsername = '';
  let currentRoom = 'general';

  socket.write('Welcome! Do you have an account? (yes/no):\n');

  socket.on('data', (data) => {
    const message = data.toString().trim();

    if (!typingStatus.has(socket)) {
      broadcast(`[${clientName}] is typing...\n`, socket, currentRoom);
      const timeout = setTimeout(() => typingStatus.delete(socket), 2000);
      typingStatus.set(socket, timeout);
    }

    if (!named) {
      if (loginStage === 'username') {
        if (message.toLowerCase() === 'yes') {
          socket.write('Enter your username:\n');
          loginStage = 'login-username';
        } else if (message.toLowerCase() === 'no') {
          socket.write('Register a new username:\n');
          loginStage = 'register-username';
        } else {
          socket.write('Please answer "yes" or "no":\n');
        }
        return;
      }

      if (loginStage === 'login-username') {
        tempUsername = message;
        socket.write('Enter your password:\n');
        loginStage = 'login-password';
        return;
      }

      if (loginStage === 'login-password') {
        const users = loadUsers();
        const banned = loadBanned();
        if (banned.includes(tempUsername)) {
          socket.write('⛔ You are banned from this server.\n');
          socket.end();
          return;
        }
        const found = users.find(u => u.username === tempUsername && u.password === message);
        if (found) {
          clientName = tempUsername;
          clients.push({ id: thisClientId, name: clientName, socket, paused: false, room: currentRoom });
          named = true;
          socket.write(`✅ Welcome back, ${clientName}!\n`);
          broadcast(`${clientName} has joined the chat.\n`, socket, currentRoom);
          sendClientCount();
          logMessage(`${clientName} logged in.`);
        } else {
          socket.write('❌ Invalid credentials. Try again.\n');
          loginStage = 'username';
        }
        return;
      }

      if (loginStage === 'register-username') {
        const users = loadUsers();
        if (users.some(u => u.username === message)) {
          socket.write('❌ Username already exists. Try a different one:\n');
          return;
        }
        tempUsername = message;
        socket.write('Set a password:\n');
        loginStage = 'register-password';
        return;
      }

      if (loginStage === 'register-password') {
        const users = loadUsers();
        users.push({ username: tempUsername, password: message });
        saveUsers(users);
        clientName = tempUsername;
        clients.push({ id: thisClientId, name: clientName, socket, paused: false, room: currentRoom });
        named = true;
        socket.write(`✅ Registration successful. Welcome, ${clientName}!\n`);
        broadcast(`${clientName} has joined the chat.\n`, socket, currentRoom);
        sendClientCount();
        logMessage(`${clientName} registered and joined.`);
        return;
      }

      return;
    }

    const client = clients.find(c => c.socket === socket);

    if (message === '/pause') {
      client.paused = true;
      socket.write('>> You have paused the chat. Use /resume to see messages again.\n');
      return;
    }

    if (message === '/resume') {
      client.paused = false;
      socket.write('>> You have resumed the chat.\n');
      return;
    }

    if (message === '/logout') {
      const clientIndex = clients.findIndex(c => c.socket === socket);
      if (clientIndex !== -1) {
        const name = clients[clientIndex].name;
        clients.splice(clientIndex, 1);
        socket.write('🔒 You have been logged out.\n');
        broadcast(`${name} has logged out.\n`, socket);
        sendClientCount();
        logMessage(`${name} logged out.`);
        named = false;
        loginStage = 'username';
        socket.write('Welcome! Do you have an account? (yes/no):\n');
      } else {
        socket.write('❌ You are not logged in.\n');
      }
      return;
    }

    if (message.startsWith('/msg ')) {
      const parts = message.split(' ');
      const targetName = parts[1];
      const privateMsg = parts.slice(2).join(' ');
      const targetClient = clients.find(c => c.name === targetName);
      if (targetClient) {
        targetClient.socket.write(`[Private] ${clientName}: ${privateMsg}\n`);
        socket.write(`[Private to ${targetName}]: ${privateMsg}\n`);
        logMessage(`[Private] ${clientName} to ${targetName}: ${privateMsg}`);
      } else {
        socket.write(`User '${targetName}' not found.\n`);
      }
      return;
    }

    if (message.startsWith('/dm ')) {
      const parts = message.split(' ');
      const targetName = parts[1];
      const dmMessage = parts.slice(2).join(' ');
      const targetClient = clients.find(c => c.name === targetName);
      if (targetClient) {
        targetClient.socket.write(`[DM] ${clientName}: ${dmMessage}\n`);
        socket.write(`[DM to ${targetName}]: ${dmMessage}\n`);
        logMessage(`[DM] ${clientName} to ${targetName}: ${dmMessage}`);
      } else {
        socket.write(`User '${targetName}' not found.\n`);
      }
      return;
    }

    if (message === '/list') {
      const names = clients.map(c => `- ${c.name} (${c.room})`).join('\n');
      socket.write(`>> Online Users:\n${names}\n`);
      return;
    }

    if (message === '/help') {
      socket.write(
        `>> Available Commands:\n` +
        '/kick <username>          - Kick a user (admin only)\n' +
        '/ban <username>           - Ban a user permanently (admin only)\n' +
        '/unban <username>         - Unban a user (admin only)\n' +
        '/msg <username> <message> - Send private message\n' +
        '/dm <username> <message>  - Send a direct message\n' +
        '/list                     - List online users\n' +
        '/pause                    - Pause receiving messages\n' +
        '/resume                   - Resume receiving messages\n' +
        '/logout                   - Logout from the chat\n' +
        '/edit <id> <new message>  - Edit your last message\n' +
        '/history                  - View your last 10 messages\n' +
        '/room <name>              - Join or create a room\n' +
        '/whoami                   - Show your username and status\n' +
        '/clear                    - Clear your chat screen\n' +
        '/help                     - Show this help message\n'
      );
      return;
    }

    // Handle message sending
    const timestamp = getTimeStamp();
    const fullMessage = `${timestamp} ${clientName}: ${replaceEmojis(message)}\n`;

    broadcast(fullMessage, socket, client.room);
    socket.write(fullMessage);

    // Store message in history
    if (!chatHistory.has(clientName)) chatHistory.set(clientName, []);
    const userHistory = chatHistory.get(clientName);
    userHistory.push({ id: ++messageId, text: message });
    if (userHistory.length > 10) userHistory.shift();

    logMessage(`${clientName}: ${message}`);
  });

  socket.on('close', () => {
    const index = clients.findIndex(c => c.socket === socket);
    if (index !== -1) {
      const name = clients[index].name;
      clients.splice(index, 1);
      broadcast(`${name} has disconnected.\n`, socket);
      sendClientCount();
      logMessage(`${name} disconnected.`);
    }
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err.message);
  });
});

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
