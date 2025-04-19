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
      return;
    }

    // Check for private message
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

    broadcast(`${clientName}: ${message}\n`, socket);
  });

  socket.on('end', () => {
    clients = clients.filter(c => c.socket !== socket);
    broadcast(`${clientName} has left the chat.\n`);
  });

  socket.on('error', () => {
    console.log(`${clientName} disconnected.`);
  });
});

function broadcast(message, senderSocket) {
  clients.forEach(client => {
    if (client.socket !== senderSocket) {
      client.socket.write(message);
    }
  });
}

server.listen(3000, () => {
  console.log('Chat server listening on port 3000');
});
