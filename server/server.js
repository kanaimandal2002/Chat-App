const net = require('net');

let clients = [];
let clientId = 0;

const server = net.createServer((socket) => {
  clientId++;
  const thisClientId = clientId;
  let clientName = `Client ${thisClientId}`;
  socket.write('Welcome! Please enter your name:\n');

  let named = false;

  socket.on('data', (data) => {
    const message = data.toString().trim();

    // First message = name
  if (!named) {
    if (clients.some(c => c.name === message)) {
      socket.write(`❌ Username '${message}' is already taken. Please choose another name:\n`);
      return;
    }

    clientName = message || clientName;
    clients.push({ id: thisClientId, name: clientName, socket });
    named = true;

    socket.write(`✅ Welcome, ${clientName}!\n`);
    broadcast(`${getTimeStamp()} ${clientName} has joined the chat.\n`, socket);
    sendClientCount();
    console.log(`${clientName} connected. Total online: ${clients.length}`);
    return;
  }

    // /msg command
    if (message.startsWith('/msg ')) {
      const parts = message.split(' ');
      const targetName = parts[1];
      const privateMsg = parts.slice(2).join(' ');

      const targetClient = clients.find(c => c.name === targetName);
      if (targetClient) {
        targetClient.socket.write(`${getTimeStamp()} [Private] ${clientName}: ${privateMsg}\n`);
        socket.write(`${getTimeStamp()} [Private to ${targetName}]: ${privateMsg}\n`);
      } else {
        socket.write(`User '${targetName}' not found.\n`);
      }
      return;
    }

    // /list command
    if (message === '/list') {
      const names = clients.map(c => `- ${c.name}`).join('\n');
      socket.write(`>> Online Users:\n${names}\n`);
      return;
    }

    // /help command
    if (message === '/help') {
      socket.write(
        `>> Available Commands:\n` +
        `/msg <username> <message> - Send private message\n` +
        `/list                     - List online users\n` +
        `/help                     - Show this help message\n`
      );
      return;
    }

    // Broadcast message
    broadcast(`${getTimeStamp()} ${clientName}: ${message}\n`, socket);
  });

  socket.on('end', () => {
    handleDisconnect(socket, clientName);
  });

  socket.on('error', () => {
    handleDisconnect(socket, clientName);
  });
});

// Broadcast to all except sender
function broadcast(message, senderSocket) {
  clients.forEach(client => {
    if (client.socket !== senderSocket) {
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

// Clean disconnection
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

// Start server
server.listen(3000, () => {
  console.log('🚀 Chat server listening on port 3000');
});
