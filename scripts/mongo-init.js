// MongoDB init script — runs once when container is first created
// Creates the app user with least-privilege access to codesteam DB only

db = db.getSiblingDB('codesteam');

db.createUser({
  user: 'codesteam_app',
  pwd:  process.env.MONGO_APP_PASSWORD || 'changeme',
  roles: [{ role: 'readWrite', db: 'codesteam' }],
});

// Bootstrap indexes (Mongoose will also create these, but doing it here
// ensures they exist before the first connection)
db.rooms.createIndex({ roomId: 1 }, { unique: true });
db.rooms.createIndex({ updatedAt: 1 }, { expireAfterSeconds: 604800 }); // 7d TTL
db.users.createIndex({ email: 1 },    { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });

print('MongoDB init complete');
