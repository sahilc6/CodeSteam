// server/src/controllers/authController.js
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const crypto = require("crypto");
const User = require("../models/User");
const logger = require("../utils/logger");
const { sendVerificationEmail } = require("../utils/mailer");

const registerSchema = Joi.object({
  username: Joi.string().min(2).max(32).alphanum().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const resendVerificationSchema = Joi.object({
  email: Joi.string().email().required(),
});

function signToken(userId, username) {
  return jwt.sign({ id: userId, username }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function createVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getClientUrl(req) {
  if (process.env.CLIENT_URL) {
    return process.env.CLIENT_URL;
  }

  const forwardedProto = req.get("x-forwarded-proto");
  const forwardedHost = req.get("x-forwarded-host");
  const host = forwardedHost || req.get("host");

  if (host) {
    return `${forwardedProto || req.protocol}://${host}`;
  }

  return "http://localhost:5173";
}

function buildVerificationUrl(req, token) {
  const clientUrl = getClientUrl(req).replace(/\/+$/, "");
  return `${clientUrl}/verify-email?token=${token}`;
}

async function register(req, res) {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const email = value.email.toLowerCase();

    const exists = await User.findOne({
      $or: [{ email }, { username: value.username }],
    });

    if (exists) {
      return res.status(409).json({ error: "Email or username already taken" });
    }

    const verificationToken = createVerificationToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.create({
      username: value.username,
      email,
      password: value.password,
      verificationToken,
      verificationTokenExpires,
      isVerified: false,
    });

    const verificationUrl = buildVerificationUrl(req, verificationToken);

    try {
      await sendVerificationEmail({
        to: user.email,
        username: user.username,
        verificationUrl,
      });
    } catch (mailError) {
      await User.deleteOne({ _id: user._id });
      throw mailError;
    }

    return res.status(201).json({
      message:
        "Registration successful. Please verify your email before logging in.",
    });
  } catch (err) {
    logger.error("register error:", err);
    return res.status(500).json({ error: "Registration failed" });
  }
}

async function login(req, res) {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const email = value.email.toLowerCase();

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(value.password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        error: "Please verify your email before logging in.",
        needsVerification: true,
      });
    }

    const token = signToken(user._id, user.username);

    return res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        cursorColor: user.cursorColor,
      },
    });
  } catch (err) {
    logger.error("login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
}

async function verifyEmail(req, res) {
  try {
    const token = req.query.token || req.body.token;

    if (!token) {
      return res.status(400).json({ error: "Verification token is required" });
    }

    const user = await User.findOne({
      verificationToken: token,
    }).select("+verificationToken +verificationTokenExpires");

    if (!user) {
      return res.status(400).json({ error: "Invalid verification link" });
    }

    if (
      !user.verificationTokenExpires ||
      user.verificationTokenExpires < new Date()
    ) {
      return res.status(400).json({ error: "Verification link has expired" });
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    return res.json({
      message: "Email verified successfully. You can now log in.",
    });
  } catch (err) {
    logger.error("verifyEmail error:", err);
    return res.status(500).json({ error: "Email verification failed" });
  }
}

async function resendVerificationEmail(req, res) {
  try {
    const { error, value } = resendVerificationSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const email = value.email.toLowerCase();

    const user = await User.findOne({ email }).select(
      "+verificationToken +verificationTokenExpires",
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    const previousVerificationToken = user.verificationToken;
    const previousVerificationTokenExpires = user.verificationTokenExpires;
    const verificationToken = createVerificationToken();
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.verificationToken = verificationToken;
    user.verificationTokenExpires = verificationTokenExpires;
    await user.save();

    const verificationUrl = buildVerificationUrl(req, verificationToken);

    try {
      await sendVerificationEmail({
        to: user.email,
        username: user.username,
        verificationUrl,
      });
    } catch (mailError) {
      user.verificationToken = previousVerificationToken;
      user.verificationTokenExpires = previousVerificationTokenExpires;
      await user.save();
      throw mailError;
    }

    return res.json({ message: "Verification email sent successfully" });
  } catch (err) {
    logger.error("resendVerificationEmail error:", err);
    return res
      .status(500)
      .json({ error: "Could not resend verification email" });
  }
}

async function me(req, res) {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    id: user._id,
    username: user.username,
    email: user.email,
    cursorColor: user.cursorColor,
    isVerified: user.isVerified,
  });
}

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  me,
};
