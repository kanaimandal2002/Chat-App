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

    if (message.startsWith('/edit ')) {
      const [_, id, ...newParts] = message.split(' ');
      const newText = newParts.join(' ');
      const history = chatHistory.get(clientName) || [];
      const msgIndex = history.findIndex(m => m.id === Number(id));
      if (msgIndex !== -1) {
        history[msgIndex].text = newText;
        socket.write(`📝 Edited message ${id}: ${newText}\n`);
        broadcast(`📝 ${clientName} edited message ${id}: ${newText}\n`, socket, client.room);
        logMessage(`${clientName} edited message ${id}: ${newText}`);
      } else {
        socket.write(`❌ Message ID not found.\n`);
      }
      return;
    }

    if (message === '/history') {
      const history = chatHistory.get(clientName) || [];
      const formatted = history.map(m => `${m.id}: ${m.text}`).join('\n') || 'No history.';
      socket.write(`🕘 Your Message History:\n${formatted}\n`);
      return;
    }

    if (message.startsWith('/room ')) {
      const newRoom = message.split(' ')[1];
      const oldRoom = client.room;
      client.room = newRoom;
      currentRoom = newRoom;
      socket.write(`🚪 You joined room: ${newRoom}\n`);
      broadcast(`📢 ${clientName} joined the room "${newRoom}".\n`, socket, newRoom);
      logMessage(`${clientName} joined room ${newRoom}`);
      return;
    }

    if (message === '/clear') {
      socket.write('\x1Bc');
      socket.write(`>> Chat cleared. Welcome back, ${clientName}!\n`);
      return;
    }

    if (message === '/whoami') {
      const status = client.paused ? '⏸️ Paused' : '▶️ Active';
      socket.write(
        `👤 Username: ${clientName}\n` +
        `📁 Room: ${client.room}\n` +
        `💡 Status: ${status}\n`
      );
      return;
    }

    if (message.startsWith('/kick ')) {
      const targetName = message.slice(6).trim();
      if (clientName !== 'admin') {
        socket.write('❌ You are not authorized to use /kick.\n');
        return;
      }
      const targetClient = clients.find(c => c.name === targetName);
      if (targetClient) {
        targetClient.socket.write('⛔ You have been kicked by admin.\n');
        targetClient.socket.end();
        broadcast(`🚫 ${targetName} was kicked by admin.\n`, socket);
        logMessage(`Admin kicked ${targetName}`);
      } else {
        socket.write(`❌ User '${targetName}' not found.\n`);
      }
      return;
    }

    if (message.startsWith('/ban ')) {
      const targetName = message.slice(5).trim();
      if (clientName !== 'admin') {
        socket.write('❌ You are not authorized to use /ban.\n');
        return;
      }
      const banned = loadBanned();
      if (!banned.includes(targetName)) {
        banned.push(targetName);
        saveBanned(banned);
      }
      const targetClient = clients.find(c => c.name === targetName);
      if (targetClient) {
        targetClient.socket.write('⛔ You have been banned by admin.\n');
        targetClient.socket.end();
      }
      broadcast(`🚫 ${targetName} was banned by admin.\n`, socket);
      logMessage(`Admin banned ${targetName}`);
      return;
    }

    if (message.startsWith('/unban ')) {
      const targetName = message.slice(7).trim();
      if (clientName !== 'admin') {
        socket.write('❌ You are not authorized to use /unban.\n');
        return;
      }
      const banned = loadBanned();
      const index = banned.indexOf(targetName);
      if (index !== -1) {
        banned.splice(index, 1);
        saveBanned(banned);
        socket.write(`✅ User '${targetName}' has been unbanned.\n`);
        logMessage(`Admin unbanned ${targetName}`);
      } else {
        socket.write(`❌ User '${targetName}' is not banned.\n`);
      }
      return;
    }

    const history = chatHistory.get(clientName) || [];
    messageId++;
    history.push({ id: messageId, text: message });
    if (history.length > 10) history.shift();
    chatHistory.set(clientName, history);

    const fullMessage = `${getTimeStamp()} ${clientName}: ${message}\n`;
    broadcast(fullMessage, socket, currentRoom);
    socket.write(fullMessage);
    logMessage(`${clientName}: ${message}`);
  });

  socket.on('end', () => {
    clients = clients.filter(c => c.socket !== socket);
    broadcast(`${clientName} has left the chat.\n`, socket);
    sendClientCount();
    logMessage(`${clientName} disconnected.`);
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err);
  });
});

server.listen(5000, () => {
  console.log('Server listening on port 5000');
});
