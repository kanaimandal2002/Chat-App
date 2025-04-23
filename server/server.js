const net = require('net');
const fs = require('fs');
const path = require('path');

let clients = [];
let clientId = 0;
const typingStatus = new Map(); // Track typing status of clients

const usersFilePath = path.join(__dirname, 'users.json');
if (!fs.existsSync(usersFilePath)) fs.writeFileSync(usersFilePath, '[]');

function loadUsers() {
  return JSON.parse(fs.readFileSync(usersFilePath));
}

function saveUsers(users) {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
}

function logMessage(message) {
  const logEntry = `${new Date().toISOString()} ${message}`;
  fs.appendFile('chat.log', logEntry + '\n', (err) => {
    if (err) console.error('Failed to write to log:', err);
  });
}

function getMessageHistory() {
  if (!fs.existsSync('chat.log')) return [];
  const lines = fs.readFileSync('chat.log', 'utf-8').split('\n').filter(Boolean);
  return lines.slice(-20); // Last 20 lines
}

const server = net.createServer((socket) => {
  clientId++;
  const thisClientId = clientId;
  let clientName = `Client ${thisClientId}`;
  let named = false;
  let loginStage = 'username';
  let tempUsername = '';
  let currentRoom = null;

  socket.write('Welcome! Do you have an account? (yes/no):\n');

  socket.on('data', (data) => {
    const message = data.toString().trim();

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

      if (!typingStatus.has(socket)) {
        broadcast(`[${clientName}] is typing...\n`, socket);
        const timeout = setTimeout(() => {
          typingStatus.delete(socket);
        }, 2000);
        typingStatus.set(socket, timeout);
      }

      if (loginStage === 'login-username') {
        tempUsername = message;
        socket.write('Enter your password:\n');
        loginStage = 'login-password';
        return;
      }

      if (loginStage === 'login-password') {
        const users = loadUsers();
        const found = users.find(u => u.username === tempUsername && u.password === message);
        if (found) {
          clientName = tempUsername;
          clients.push({ id: thisClientId, name: clientName, socket, paused: false, room: null });

          named = true;
          socket.write(`✅ Welcome back, ${clientName}!\n`);
          socket.write('>> Last 20 messages:\n' + getMessageHistory().join('\n') + '\n');
          broadcast(`${clientName} has joined the chat.\n`, socket);
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
        clients.push({ id: thisClientId, name: clientName, socket, paused: false, room: null });
        named = true;
        socket.write(`✅ Registration successful. Welcome, ${clientName}!\n`);
        socket.write('>> Last 20 messages:\n' + getMessageHistory().join('\n') + '\n');
        broadcast(`${clientName} has joined the chat.\n`, socket);
        sendClientCount();
        logMessage(`${clientName} registered and joined.`);
        return;
      }

      return;
    }

    // Commands after login
    const client = clients.find(c => c.socket === socket);

    if (message === '/pause') {
      if (client) {
        client.paused = true;
        socket.write('>> You have paused the chat. Use /resume to see messages again.\n');
      }
      return;
    }

    if (message === '/resume') {
      if (client) {
        client.paused = false;
        socket.write('>> You have resumed the chat.\n');
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

    if (message === '/list') {
      const names = clients.map(c => `- ${c.name}`).join('\n');
      socket.write(`>> Online Users:\n${names}\n`);
      return;
    }

    if (message.startsWith('/join ')) {
      const roomName = message.split(' ')[1];
      client.room = roomName;
      socket.write(`>> You joined room: ${roomName}\n`);
      return;
    }

    if (message === '/leave') {
      client.room = null;
      socket.write('>> You left the room.\n');
      return;
    }

    if (message === '/help') {
      socket.write(
        `>> Available Commands:\n` +
        `/msg <username> <message> - Send private message\n` +
        `/list                     - List online users\n` +
        `/pause                    - Pause receiving messages\n` +
        `/resume                   - Resume receiving messages\n` +
        `/join <roomname>          - Join or create a chat room\n` +
        `/leave                    - Leave current room\n` +
        `/help                     - Show this help message\n`
      );
      return;
    }

    broadcast(`${clientName}: ${message}\n`, socket, client.room);
    logMessage(`${clientName}: ${message}`);
  });

  socket.on('end', () => {
    clients = clients.filter(c => c.socket !== socket);
    broadcast(`${clientName} has left the chat.\n`);
    sendClientCount();
    logMessage(`${clientName} disconnected.`);
    typingStatus.delete(socket);
  });

  socket.on('error', () => {
    clients = clients.filter(c => c.socket !== socket);
    broadcast(`${clientName} disconnected from the chat!\n`);
    sendClientCount();
    logMessage(`${clientName} error/disconnect.`);
    typingStatus.delete(socket);
  });
});

// Broadcast to all except sender, respecting pause status and room
function broadcast(message, senderSocket, room = null) {
  clients.forEach(client => {
    if (
      client.socket !== senderSocket &&
      !client.paused &&
      (room === null || client.room === room)
    ) {
      client.socket.write(message);
    }
  });
}

// Send total client count
function sendClientCount() {
  const msg = `>> Total clients online: ${clients.length}\n`;
  clients.forEach(client => {
    client.socket.write(msg);
  });
}

// Start the server
server.listen(3000, () => {
  console.log('Chat server listening on port 3000');
});
