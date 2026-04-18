const mongoose = require("mongoose");

const SUPPORTED_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "cpp",
  "c",
  "go",
  "rust",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "bash",
  "sql",
  "html",
  "css",
];

const fileStateSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      default: "",
      maxlength: 500000,
    },
    revision: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const filesSchemaDefinition = {};
for (const lang of SUPPORTED_LANGUAGES) {
  filesSchemaDefinition[lang] = {
    type: fileStateSchema,
    default: () => ({ content: "", revision: 0 }),
  };
}

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    language: {
      type: String,
      default: "javascript",
      enum: SUPPORTED_LANGUAGES,
    },

    // Per-language code storage
    files: {
      type: new mongoose.Schema(filesSchemaDefinition, { _id: false }),
      default: () => ({}),
    },

    users: [
      {
        userId: String,
        username: String,
        color: String,
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    isPrivate: { type: Boolean, default: true },
    password: { type: String, select: false },
    maxUsers: { type: Number, default: 20 },
    createdBy: { type: String },
    allowedUsers: [
      {
        userId: String,
        username: String,
        allowedAt: { type: Date, default: Date.now },
      },
    ],
    joinRequests: [
      {
        userId: String,
        username: String,
        requestedAt: { type: Date, default: Date.now },
      },
    ],
    isEnded: { type: Boolean, default: false },
    activity: [
      {
        type: {
          type: String,
          enum: [
            "created",
            "joined",
            "left",
            "language-changed",
            "ended",
            "requested",
            "approved",
            "denied",
            "removed",
          ],
        },
        message: String,
        user: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

// Auto-expire rooms after 7 days of inactivity
roomSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model("Room", roomSchema);
