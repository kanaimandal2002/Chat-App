const net = require('net');
const readline = require('readline');

const client = net.createConnection({ port: 5000 }, () => {
  console.log('Connected to chat server');
});

client.on('data', (data) => {
  process.stdout.write(data.toString());
});

client.on('end', () => {
  console.log('Disconnected from server');
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', (line) => {
  client.write(line);
});
