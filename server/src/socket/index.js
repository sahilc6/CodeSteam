const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const Room = require("../models/Room");
const Chat = require("../models/Chat");
const OTEngine = require("../utils/ot");
const logger = require("../utils/logger");

let io = null;

// In-memory OT engines per room+language
const engines = new Map();

// Active users per room: roomId -> Map(socketId -> userInfo)
const roomUsers = new Map();

const DEFAULT_CODE = {
  javascript: `// JavaScript Example
console.log("Hello, World!");

// Your code here
function myFunction() {
  return "Hello";
}

console.log(myFunction());
`,
  typescript: `// TypeScript Example
const greeting: string = "Hello, World!";
console.log(greeting);

// Your code here
function add(a: number, b: number): number {
  return a + b;
}

console.log(add(5, 3));
`,
  python: `# Python Example
print("Hello, World!")

# Your code here
def my_function():
    return "Hello"

print(my_function())
`,
  java: `// Java - Name this class "Main"
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        // Your code here
    }
}
`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    
    // Your code here
    
    return 0;
}
`,
  c: `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    
    // Your code here
    
    return 0;
}
`,
  go: `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
    
    // Your code here
}
`,
  rust: `fn main() {
    println!("Hello, World!");
    
    // Your code here
}
`,
  ruby: `# Ruby Example
puts "Hello, World!"

# Your code here
def my_function
  "Hello"
end

puts my_function()
`,
  php: `<?php
echo "Hello, World!" . PHP_EOL;

// Your code here
function myFunction() {
    return "Hello";
}

echo myFunction() . PHP_EOL;
?>
`,
  swift: `import Foundation

print("Hello, World!")

// Your code here
`,
  kotlin: `fun main() {
    println("Hello, World!")
    
    // Your code here
}
`,
  bash: `#!/bin/bash
echo "Hello, World!"

# Your code here
function myFunction() {
    echo "Hello"
}

myFunction()
`,
  sql: `-- SQL Example
SELECT 'Hello, World!';

-- Your code here
`,
  html: `<!DOCTYPE html>
<html>
<head>
  <title>Hello</title>
</head>
<body>
  <h1>Hello, World!</h1>
</body>
</html>
`,
  css: `body {
  font-family: Arial, sans-serif;
}

h1 {
  color: #4f46e5;
}
`,
};

async function logActivity(roomId, type, message, user) {
  try {
    await Room.findOneAndUpdate(
      { roomId },
      { $push: { activity: { type, message, user } } },
    );
  } catch (err) {
    logger.error("logActivity error:", err);
  }
}

const CURSOR_COLORS = [
  "#89b4fa",
  "#a6e3a1",
  "#f38ba8",
  "#f9e2af",
  "#cba6f7",
  "#94e2d5",
  "#fab387",
  "#eba0ac",
];

function getEngineKey(roomId, language) {
  return `${roomId}:${language}`;
}

function getOrCreateEngine(roomId, language, content, revision) {
  const key = getEngineKey(roomId, language);
  if (!engines.has(key)) {
    engines.set(key, new OTEngine(content, revision));
  }
  return engines.get(key);
}

function removeRoomEngines(roomId) {
  for (const key of engines.keys()) {
    if (key.startsWith(`${roomId}:`)) {
      engines.delete(key);
    }
  }
}

function sameId(left, right) {
  return Boolean(left && right && String(left) === String(right));
}

function isCreator(room, userId) {
  return sameId(room.createdBy, userId);
}

function isAllowedJoiner(room, userId) {
  return Boolean(
    userId &&
      (room.allowedUsers || []).some((member) => sameId(member.userId, userId)),
  );
}

function canAccessRoom(room, userId) {
  return isCreator(room, userId) || isAllowedJoiner(room, userId);
}

async function ensureRoomFiles(room) {
  const currentLanguage = room.language || "javascript";

  if (!room.files) {
    room.files = {};
  }

  if (!room.files[currentLanguage]) {
    room.files[currentLanguage] = {
      content:
        room.content ||
        room.snapshot?.content ||
        DEFAULT_CODE[currentLanguage] ||
        "",
      revision: room.snapshot?.revision || 0,
    };
    await room.save();
  }

  return room;
}

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: (process.env.CORS_ORIGINS || "http://localhost:5173").split(","),
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        socket.isAuthenticated = true;
      } catch (err) {
        logger.warn("Socket token verification failed:", err.message);
      }
    }
    socket.userId = socket.userId || `guest_${uuidv4().slice(0, 8)}`;
    socket.isAuthenticated = socket.isAuthenticated || false;
    socket.username =
      socket.handshake.auth.username || `Guest_${socket.userId.slice(-4)}`;
    socket.cursorColor =
      CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
    next();
  });

  io.on("connection", (socket) => {
    logger.debug(`Socket connected: ${socket.id} (${socket.username})`);

    // ── JOIN ROOM ──────────────────────────────────────────────────────
    socket.on("join-room", async ({ roomId }) => {
      try {
        let room = await Room.findOne({ roomId });
        if (!room) return socket.emit("error", { message: "Room not found" });
        if (room.isEnded) {
          return socket.emit("error", { message: "This room has ended" });
        }
        if (!socket.isAuthenticated) {
          return socket.emit("error", {
            message: "Sign in to join this room",
          });
        }
        if (!canAccessRoom(room, socket.userId)) {
          return socket.emit("error", {
            message: "Request access before joining this room",
          });
        }

        room = await ensureRoomFiles(room);

        const currentLanguage = room.language || "javascript";
        const fileState = room.files?.[currentLanguage] || {
          content: DEFAULT_CODE[currentLanguage] || "",
          revision: 0,
        };

        const engine = getOrCreateEngine(
          roomId,
          currentLanguage,
          fileState.content || "",
          fileState.revision || 0,
        );

        socket.join(roomId);
        socket.roomId = roomId;
        socket.currentLanguage = currentLanguage;

        if (!roomUsers.has(roomId)) roomUsers.set(roomId, new Map());
        const roomUserMap = roomUsers.get(roomId);

        for (const [oldSocketId, user] of roomUserMap.entries()) {
          if (sameId(user.userId, socket.userId) && oldSocketId !== socket.id) {
            roomUserMap.delete(oldSocketId);
            socket.to(roomId).emit("user-left", {
              socketId: oldSocketId,
              userId: socket.userId,
              username: socket.username,
            });
          }
        }

        roomUserMap.set(socket.id, {
          socketId: socket.id,
          userId: socket.userId,
          username: socket.username,
          color: socket.cursorColor,
          role: isCreator(room, socket.userId) ? "creator" : "joiner",
        });

        socket.emit("room-state", {
          content: engine.content,
          revision: engine.revision,
          language: currentLanguage,
          users: Array.from(roomUsers.get(roomId).values()),
          role: isCreator(room, socket.userId) ? "creator" : "joiner",
          pendingRequests: isCreator(room, socket.userId)
            ? room.joinRequests || []
            : [],
          allowedUsers: isCreator(room, socket.userId)
            ? room.allowedUsers || []
            : [],
        });

        socket.to(roomId).emit("user-joined", {
          socketId: socket.id,
          userId: socket.userId,
          username: socket.username,
          color: socket.cursorColor,
        });

        await logActivity(
          roomId,
          "joined",
          `${socket.username} joined the room`,
          socket.username,
        );

        logger.debug(`${socket.username} joined room ${roomId}`);
      } catch (err) {
        logger.error("join-room error:", err);
        socket.emit("error", { message: "Failed to join room" });
      }
    });

    // ── OT OPERATION ──────────────────────────────────────────────────
    socket.on("op", async ({ op, roomId: rid }) => {
      const roomId = rid || socket.roomId;
      const language = socket.currentLanguage;

      if (!roomId || !language) return;
      if (roomId !== socket.roomId) return;

      const key = getEngineKey(roomId, language);
      const engine = engines.get(key);
      if (!engine) return;

      const transformed = engine.applyOp(op, op.revision);
      if (!transformed) return;

      socket.emit("op-ack", { revision: transformed.revision });
      socket.to(roomId).emit("op", { op: transformed });

      if (engine.revision % 20 === 0) {
        await Room.findOneAndUpdate(
          { roomId },
          {
            $set: {
              [`files.${language}.content`]: engine.content,
              [`files.${language}.revision`]: engine.revision,
              updatedAt: new Date(),
            },
          },
        ).catch((err) => logger.error("persist error:", err));
      }
    });

    // ── CURSOR MOVE ───────────────────────────────────────────────────
    socket.on("cursor", ({ position, selection }) => {
      if (!socket.roomId) return;
      socket.to(socket.roomId).emit("cursor", {
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
        color: socket.cursorColor,
        position,
        selection,
      });
    });

    // ── CONTENT SYNC (client sends its real editor content) ──────────
    // The client periodically (and before disconnect) sends its actual
    // editor content. This is the ultimate source of truth — if the OT
    // engine drifted, this corrects it.
    socket.on("sync-content", async ({ roomId: rid, language: lang, content }) => {
      const roomId = rid || socket.roomId;
      const language = lang || socket.currentLanguage;
      if (!roomId || !language || content == null) return;
      if (roomId !== socket.roomId) return;

      const key = getEngineKey(roomId, language);
      const engine = engines.get(key);

      if (engine) {
        // Correct the engine's content to match the client's real content
        engine.content = content;
        // Clear history since it no longer corresponds to the current content
        engine.history = [];
      }

      // Persist to database
      await Room.findOneAndUpdate(
        { roomId },
        {
          $set: {
            [`files.${language}.content`]: content,
            [`files.${language}.revision`]: engine ? engine.revision : 0,
            updatedAt: new Date(),
          },
        },
      ).catch((err) => logger.error("sync-content persist error:", err));
    });

    // ── LANGUAGE CHANGE ───────────────────────────────────────────────
    socket.on("language-change", async ({ language }) => {
      if (!socket.roomId) return;

      const roomId = socket.roomId;
      const previousLanguage = socket.currentLanguage || "javascript";

      try {
        const previousKey = getEngineKey(roomId, previousLanguage);
        const previousEngine = engines.get(previousKey);

        if (previousEngine) {
          await Room.findOneAndUpdate(
            { roomId },
            {
              $set: {
                [`files.${previousLanguage}.content`]: previousEngine.content,
                [`files.${previousLanguage}.revision`]: previousEngine.revision,
              },
            },
          );
        }

        let room = await Room.findOne({ roomId });
        if (!room) return;

        room = await ensureRoomFiles(room);

        if (!room.files[language]) {
          room.files[language] = {
            content: DEFAULT_CODE[language] || "",
            revision: 0,
          };
          await room.save();
        }

        const nextFile = room.files[language] || {
          content: DEFAULT_CODE[language] || "",
          revision: 0,
        };

        const nextEngine = getOrCreateEngine(
          roomId,
          language,
          nextFile.content || "",
          nextFile.revision || 0,
        );

        socket.currentLanguage = language;

        await Room.findOneAndUpdate(
          { roomId },
          {
            language,
            $set: {
              [`files.${language}.content`]: nextEngine.content,
              [`files.${language}.revision`]: nextEngine.revision,
              updatedAt: new Date(),
            },
          },
        );

        io.to(roomId).emit("language-change", {
          language,
          content: nextEngine.content,
          revision: nextEngine.revision,
          changedBy: socket.username,
        });

        await logActivity(
          roomId,
          "language-changed",
          `Language changed to ${language} by ${socket.username}`,
          socket.username,
        );
      } catch (err) {
        logger.error("language-change error:", err);
      }
    });

    // ── CHAT HISTORY ──────────────────────────────────────────────────
    socket.on("chat-history", async ({ roomId }, callback) => {
      try {
        if (roomId !== socket.roomId) return callback([]);
        const messages = await Chat.find({ roomId })
          .sort({ timestamp: 1 })
          .limit(100)
          .lean();
        callback(messages || []);
      } catch (err) {
        logger.error("chat-history error:", err);
        callback([]);
      }
    });

    // ── CHAT MESSAGE ──────────────────────────────────────────────────
    socket.on("chat-message", async ({ roomId, message }, callback) => {
      try {
        if (roomId !== socket.roomId) {
          return callback({ ok: false, error: "Not allowed in this room" });
        }
        if (!roomId || !message.text || !message.text.trim()) {
          return callback({ ok: false, error: "Invalid message" });
        }

        const chatMsg = await Chat.create({
          roomId,
          username: socket.username,
          text: message.text.trim(),
          timestamp: new Date(),
        });

        io.to(roomId).emit("chat-message", {
          username: socket.username,
          text: chatMsg.text,
          timestamp: chatMsg.timestamp,
        });

        callback({ ok: true });
      } catch (err) {
        logger.error("chat-message error:", err);
        callback({ ok: false, error: "Failed to save message" });
      }
    });

    // ── END ROOM ──────────────────────────────────────────────────────
    socket.on("end-room", async () => {
      const roomId = socket.roomId;
      if (!roomId) {
        return socket.emit("room-error", { message: "You are not in a room" });
      }

      if (!socket.isAuthenticated) {
        return socket.emit("room-error", {
          message: "You must be logged in to end a room",
        });
      }

      try {
        const room = await Room.findOne({ roomId });
        if (!room) {
          return socket.emit("room-error", { message: "Room not found" });
        }

        if (room.createdBy !== socket.userId) {
          return socket.emit("room-error", {
            message: "Only the room creator can end the room",
          });
        }

        await Room.findOneAndUpdate(
          { roomId, createdBy: socket.userId },
          {
            isEnded: true,
            $push: {
              activity: {
                type: "ended",
                message: `Room ended by ${socket.username}`,
                user: socket.username,
              },
            },
          },
        );

        io.to(roomId).emit("room-ended", {
          message: `${socket.username} ended the room`,
        });

        await io.in(roomId).socketsLeave(roomId);
        roomUsers.delete(roomId);
        removeRoomEngines(roomId);
      } catch (err) {
        logger.error("end-room error:", err);
        socket.emit("room-error", { message: "Failed to end room" });
      }
    });

    // ── DISCONNECT ────────────────────────────────────────────────────
    socket.on("disconnect", async () => {
      const roomId = socket.roomId;
      const language = socket.currentLanguage;

      if (!roomId) return;

      const users = roomUsers.get(roomId);
      if (users) {
        users.delete(socket.id);

        if (language) {
          const key = getEngineKey(roomId, language);
          const engine = engines.get(key);

          if (engine) {
            await Room.findOneAndUpdate(
              { roomId },
              {
                $set: {
                  [`files.${language}.content`]: engine.content,
                  [`files.${language}.revision`]: engine.revision,
                  users: [],
                  updatedAt: new Date(),
                },
              },
            ).catch((err) => logger.error("final persist error:", err));
          }
        }

        if (users.size === 0) {
          roomUsers.delete(roomId);
          removeRoomEngines(roomId);
        }
      }

      socket.to(roomId).emit("user-left", {
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
      });

      await logActivity(
        roomId,
        "left",
        `${socket.username} left the room`,
        socket.username,
      );

      logger.debug(`${socket.username} left room ${roomId}`);
    });
  });

  return io;
}

module.exports = { initSocket };
