// server/src/routes/auth.js
const router = require("express").Router();
const {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  me,
} = require("../controllers/authController");
const { authMiddleware } = require("../utils/auth");

router.post("/register", register);
router.post("/login", login);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationEmail);
router.get("/me", authMiddleware, me);

module.exports = router;
