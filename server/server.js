const net = require('net');
const fs = require('fs');
const path = require('path');

let clients = [];
let clientId = 0;

const typingStatus = new Map();
const usersFilePath = path.join(__dirname, 'users.json');
const logFilePath = path.join(__dirname, 'chat.log');

if (!fs.existsSync(usersFilePath)) fs.writeFileSync(usersFilePath, '[]');
if (!fs.existsSync(logFilePath)) fs.writeFileSync(logFilePath, '');

function loadUsers() {
  return JSON.parse(fs.readFileSync(usersFilePath));
}

function saveUsers(users) {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
}

function logMessage(message) {
  const logEntry = `${new Date().toISOString()} ${message}`;
  fs.appendFileSync(logFilePath, logEntry + '\n');
}

function getRecentMessages(n = 10) {
  const lines = fs.readFileSync(logFilePath, 'utf-8').trim().split('\n');
  return lines.slice(-n);
}

const server = net.createServer((socket) => {
  clientId++;
  const thisClientId = clientId;
  let clientName = `Client ${thisClientId}`;
  let named = false;
  let loginStage = 'username';
  let tempUsername = '';

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
          clients.push({ id: thisClientId, name: clientName, socket, paused: false, lastMessage: null });

          named = true;
          socket.write(`✅ Welcome back, ${clientName}!\n`);
          sendRecentMessages(socket);
          broadcast(`${clientName} has joined the chat.\n`, socket);
          sendClientCount();
          logMessage(`${clientName} logged in.`);
          console.log(`${clientName} logged in. Total online: ${clients.length}`);
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
        clients.push({ id: thisClientId, name: clientName, socket, paused: false, lastMessage: null });
        named = true;
        socket.write(`✅ Registration successful. Welcome, ${clientName}!\n`);
        sendRecentMessages(socket);
        broadcast(`${clientName} has joined the chat.\n`, socket);
        sendClientCount();
        logMessage(`${clientName} registered and joined.`);
        console.log(`${clientName} registered. Total online: ${clients.length}`);
        return;
      }

      return;
    }

    // Typing indicator
    if (!typingStatus.has(socket)) {
      broadcast(`[${clientName}] is typing...\n`, socket);

      const timeout = setTimeout(() => {
        typingStatus.delete(socket);
      }, 2000);

      typingStatus.set(socket, timeout);
    } else {
      // Reset timer
      clearTimeout(typingStatus.get(socket));
      const timeout = setTimeout(() => {
        typingStatus.delete(socket);
      }, 2000);
      typingStatus.set(socket, timeout);
    }

    // Commands
    if (message === '/pause') {
      const client = clients.find(c => c.socket === socket);
      if (client) {
        client.paused = true;
        socket.write('>> You have paused the chat. Use /resume to see messages again.\n');
      }
      return;
    }

    if (message === '/resume') {
      const client = clients.find(c => c.socket === socket);
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

    if (message === '/help') {
      socket.write(
        `>> Available Commands:\n` +
        `/msg <username> <message> - Send private message\n` +
        `/list                     - List online users\n` +
        `/pause                    - Pause receiving messages\n` +
        `/resume                   - Resume receiving messages\n` +
        `/edit <new message>       - Edit your last message\n` +
        `/help                     - Show this help message\n`
      );
      return;
    }

    if (message.startsWith('/edit ')) {
      const newMessage = message.slice(6).trim();
      const client = clients.find(c => c.socket === socket);

      if (!client || !client.lastMessage) {
        socket.write('>> No previous message to edit.\n');
      } else {
        const editedMessage = `${client.name} edited their message: ${newMessage}`;
        broadcast(editedMessage + '\n', socket);
        logMessage(`[EDITED] ${editedMessage}`);
        client.lastMessage = newMessage;
        socket.write('>> Your message was edited and sent.\n');
      }
      return;
    }

    // Normal message
    broadcast(`${clientName}: ${message}\n`, socket);
    logMessage(`${clientName}: ${message}`);
    const client = clients.find(c => c.socket === socket);
    if (client) client.lastMessage = message;
  });

  socket.on('end', () => {
    clients = clients.filter(c => c.socket !== socket);
    broadcast(`${clientName} has left the chat.\n`);
    sendClientCount();
    logMessage(`${clientName} disconnected.`);
    typingStatus.delete(socket);
    console.log(`${clientName} disconnected. Total online: ${clients.length}`);
  });

  socket.on('error', () => {
    clients = clients.filter(c => c.socket !== socket);
    broadcast(`${clientName} disconnected from the chat!\n`);
    sendClientCount();
    logMessage(`${clientName} error/disconnect.`);
    typingStatus.delete(socket);
    console.log(`${clientName} disconnected. Total online: ${clients.length}`);
  });
});

function broadcast(message, senderSocket) {
  clients.forEach(client => {
    if (client.socket !== senderSocket && !client.paused) {
      client.socket.write(message);
    }
  });
}

function sendClientCount() {
  const msg = `>> Total clients online: ${clients.length}\n`;
  clients.forEach(client => {
    client.socket.write(msg);
  });
}

function sendRecentMessages(socket) {
  const messages = getRecentMessages(10);
  if (messages.length > 0) {
    socket.write('\n>> Recent Messages:\n');
    messages.forEach(line => {
      socket.write(`${line}\n`);
    });
    socket.write('>> End of History\n\n');
  }
}
// ✅ Handle client disconnection
function handleDisconnect(socket, name) {
  clients = clients.filter(c => c.socket !== socket);
  broadcast(`${getTimeStamp()} ${name} disconnected from the chat!\n`, socket);
  sendClientCount();
  console.log(`${name} disconnected. Total online: ${clients.length}`);
}

// Timestamp helper
function getTimeStamp() {
  const now = new Date();
  return `[${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]`;
}

//function to log messages to a file
function logMessage(message) {
  const logEntry = `${new Date().toISOString()} ${message}`;
  fs.appendFile('chat.log', logEntry + '\n', (err) => {
    if (err) console.error('Failed to write to log:', err);
  });
}
//function for pause/resume logic
function broadcast(message, senderSocket) {
  clients.forEach(client => {
    if (client.socket !== senderSocket && !client.paused) {
      client.socket.write(message);
    }
  });
}

server.listen(3000, () => {
  console.log('Chat server listening on port 3000');
});

