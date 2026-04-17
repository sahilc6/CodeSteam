const mongoose = require('mongoose')

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
      default: 'javascript',
      enum: [
        'javascript', 'typescript', 'python', 'java', 'cpp',
        'c', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin',
        'bash', 'sql', 'html', 'css',
      ],
    },
    content: {
      type: String,
      default: '',
      maxlength: 500000,
    },
    // Snapshot of OT operations for late joiners
    snapshot: {
      revision: { type: Number, default: 0 },
      content: { type: String, default: '' },
    },
    users: [
      {
        userId: String,
        username: String,
        color: String,
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    isPrivate: { type: Boolean, default: false },
    password: { type: String, select: false },
    maxUsers: { type: Number, default: 20 },
    createdBy: { type: String },
    isEnded: { type: Boolean, default: false },
    activity: [
      {
        type: { type: String, enum: ['created', 'joined', 'left', 'language-changed', 'ended'] },
        message: String,
        user: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
)

// Auto-expire rooms after 7 days of inactivity
roomSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 })

module.exports = mongoose.model('Room', roomSchema)
