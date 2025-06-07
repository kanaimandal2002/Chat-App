# TCP Chat Application

A basic TCP-based chat application built with Node.js. The app supports multiple clients connecting to a server, where each message is broadcasted to all other connected clients. Each client is assigned a unique identifier like **Client 1**, **Client 2**, etc., and messages are logged accordingly.

## Features

- **Multiple Clients**: Connect multiple clients and exchange messages.
- **Client IDs**: Each client is assigned a unique ID (e.g., Client 1, Client 2).
- **Message Broadcasting**: Messages sent by one client are broadcasted to all other clients.
- **Graceful Disconnect**: Clients can disconnect gracefully without errors being logged unnecessarily.
- **Client Error Handling**: Handles client disconnections and errors appropriately.

## Prerequisites

- **Node.js**: Ensure you have [Node.js](https://nodejs.org/) installed on your system.
- **npm**: Comes with Node.js, but ensure it’s up-to-date.

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/kanaimandal2002/Chat-App.git
   cd Chat-App

2. Run it:

   ```bash
   node server.js
   
3. add new terminal and run:
   
   ```bash
   node client.js
  
