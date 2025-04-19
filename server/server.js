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

    broadcast(`${clientName}: ${message}\n`, socket);
  });

  socket.on('end', () => {
    clients = clients.filter(c => c.socket !== socket);
    broadcast(`${clientName} has left the chat.\n`);
  });

  socket.on('error', (err) => {
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
