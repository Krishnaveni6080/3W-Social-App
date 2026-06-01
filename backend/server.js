const bcrypt = require("bcryptjs");
const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET || "development-secret-change-me";

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "*",
  })
);
app.use(express.json({ limit: "6mb" }));

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 2 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const namedUserSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    username: { type: String, required: true },
  },
  { _id: false }
);

const commentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    username: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

const postSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    username: { type: String, required: true },
    text: { type: String, trim: true, maxlength: 1500 },
    image: { type: String, trim: true },
    likedBy: [namedUserSchema],
    comments: [commentSchema],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);

function signToken(user) {
  return jwt.sign({ id: user._id, username: user.username, email: user.email }, jwtSecret, {
    expiresIn: "7d",
  });
}

function publicUser(user) {
  return { id: user._id, username: user.username, email: user.email };
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ message: "Login required" });

    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "taskplanet-social-api" });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email is already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, passwordHash });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Signup failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || "").toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const matches = await bcrypt.compare(password || "", user.passwordHash);
    if (!matches) return res.status(401).json({ message: "Invalid email or password" });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Login failed" });
  }
});

app.get("/api/posts", auth, async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);
  const skip = (page - 1) * limit;
  const filter = String(req.query.filter || "all");
  const query = {};

  if (filter === "mine") {
    query.userId = req.user._id;
  }

  if (filter === "commented") {
    query["comments.userId"] = req.user._id;
  }

  const [posts, total] = await Promise.all([
    Post.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Post.countDocuments(query),
  ]);

  res.json({
    posts,
    page,
    totalPages: Math.max(Math.ceil(total / limit), 1),
    total,
  });
});

app.post("/api/posts", auth, async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    const image = String(req.body.image || "").trim();
    if (!text && !image) {
      return res.status(400).json({ message: "Post needs text, an image, or both" });
    }

    const post = await Post.create({
      userId: req.user._id,
      username: req.user.username,
      text,
      image,
      likedBy: [],
      comments: [],
    });

    res.status(201).json({ post });
  } catch (error) {
    res.status(500).json({ message: "Could not create post" });
  }
});

app.post("/api/posts/:id/like", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  const userId = String(req.user._id);
  const existingIndex = post.likedBy.findIndex((like) => String(like.userId) === userId);
  if (existingIndex >= 0) {
    post.likedBy.splice(existingIndex, 1);
  } else {
    post.likedBy.push({ userId: req.user._id, username: req.user.username });
  }

  await post.save();
  res.json({ post });
});

app.delete("/api/posts/:id", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  if (String(post.userId) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only delete your own posts" });
  }

  await post.deleteOne();
  res.json({ message: "Post deleted" });
});

app.post("/api/posts/:id/comments", auth, async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ message: "Comment text is required" });

  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  post.comments.push({
    userId: req.user._id,
    username: req.user.username,
    text,
  });

  await post.save();
  res.status(201).json({ post });
});

async function start() {
  if (!process.env.MONGODB_URI) {
    console.warn("MONGODB_URI is missing. Add it to backend/.env before starting the API.");
  }

  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/taskplanet-social");
  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Server failed to start", error);
  process.exit(1);
});
