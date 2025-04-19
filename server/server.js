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

    if (!named) {
      clientName = message || clientName;
      clients.push({ id: thisClientId, name: clientName, socket });
      named = true;

      broadcast(`${clientName} has joined the chat.\n`, socket);
      sendClientCount(); // update everyone
      console.log(`${clientName} connected. Total online: ${clients.length}`);
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

    // ✅ New: Check for /help command
if (message === '/help') {
  socket.write(
    `>> Available Commands:\n` +
    `/msg <username> <message> - Send private message\n` +
    `/list                     - List online users\n` +
    `/help                     - Show this help message\n`
  );
  return;
}

    

    broadcast(`${clientName}: ${message}\n`, socket);
  });

  socket.on('end', () => {
    clients = clients.filter(c => c.socket !== socket);
    broadcast(`${clientName} has left the chat.\n`);
    sendClientCount();
    console.log(`${clientName} disconnected. Total online: ${clients.length}`);
  });

  socket.on('error', () => {
    clients = clients.filter(c => c.socket !== socket);
    broadcast(`${clientName} disconnected from the chat!\n`, socket);
    sendClientCount();
    console.log(`${clientName} disconnected. Total online: ${clients.length}`);
  });
});

function broadcast(message, senderSocket) {
  clients.forEach(client => {
    if (client.socket !== senderSocket) {
      client.socket.write(message);
    }
  });
}

// Send online count to all clients
function sendClientCount() {
  const countMessage = `>> Total clients online: ${clients.length}\n`;
  clients.forEach(client => {
    client.socket.write(countMessage);
  });
}

server.listen(3000, () => {
  console.log('Chat server listening on port 3000');
});
