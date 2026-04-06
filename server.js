const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files (the frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Rooms: roomId -> Set of connected WebSocket clients
const rooms = new Map();

wss.on('connection', (ws) => {
    console.log('🔌 New client connected');
    let currentRoom = null;
    let clientName = 'Anonymous';

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'join':
                    currentRoom = message.room;
                    clientName = message.name || 'Anonymous';
                    
                    if (!rooms.has(currentRoom)) {
                        rooms.set(currentRoom, new Set());
                    }
                    rooms.get(currentRoom).add(ws);
                    
                    console.log(`📢 ${clientName} joined room: ${currentRoom}`);
                    
                    // Notify others in room
                    broadcastToRoom(currentRoom, ws, {
                        type: 'user-joined',
                        name: clientName
                    });
                    
                    // Send list of existing peers (excluding self)
                    const peers = [];
                    for (const client of rooms.get(currentRoom)) {
                        if (client !== ws && client._name) {
                            peers.push(client._name);
                        }
                    }
                    ws.send(JSON.stringify({
                        type: 'peer-list',
                        peers: peers
                    }));
                    
                    // Store name on ws object
                    ws._name = clientName;
                    ws._room = currentRoom;
                    break;
                    
                case 'offer':
                    // Forward offer to specific peer
                    forwardToPeer(message.target, ws, {
                        type: 'offer',
                        offer: message.offer,
                        from: ws._name
                    });
                    break;
                    
                case 'answer':
                    forwardToPeer(message.target, ws, {
                        type: 'answer',
                        answer: message.answer,
                        from: ws._name
                    });
                    break;
                    
                case 'ice-candidate':
                    forwardToPeer(message.target, ws, {
                        type: 'ice-candidate',
                        candidate: message.candidate,
                        from: ws._name
                    });
                    break;
                    
                case 'leave':
                    if (currentRoom && rooms.has(currentRoom)) {
                        rooms.get(currentRoom).delete(ws);
                        broadcastToRoom(currentRoom, ws, {
                            type: 'user-left',
                            name: ws._name
                        });
                    }
                    break;
            }
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    });
    
    ws.on('close', () => {
        console.log(`Client disconnected: ${ws._name}`);
        if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom).delete(ws);
            broadcastToRoom(currentRoom, ws, {
                type: 'user-left',
                name: ws._name
            });
            
            if (rooms.get(currentRoom).size === 0) {
                rooms.delete(currentRoom);
            }
        }
    });
});

function broadcastToRoom(room, sender, message) {
    if (!rooms.has(room)) return;
    for (const client of rooms.get(room)) {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    }
}

function forwardToPeer(targetName, sender, message) {
    const room = sender._room;
    if (!room || !rooms.has(room)) return;
    
    for (const client of rooms.get(room)) {
        if (client._name === targetName && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
            break;
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Caller.js server running on http://localhost:${PORT}`);
});
