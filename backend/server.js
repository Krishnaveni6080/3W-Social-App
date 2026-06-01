const bcrypt = require("bcryptjs");
const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

// Load environment variables from backend/.env file
dotenv.config();

const app = express();
// Server port configuration (default to 5000 if not specified)
const port = process.env.PORT || 5000;
// Secret key used to sign and verify JSON Web Tokens (JWT)
const jwtSecret = process.env.JWT_SECRET || "development-secret-change-me";

// Enable Cross-Origin Resource Sharing (CORS) to allow requests from the frontend client
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "*",
  })
);

// Middleware to parse incoming request bodies in JSON format with a size limit of 6mb
app.use(express.json({ limit: "6mb" }));

/**
 * Mongoose Schema representing a User in the database.
 */
const userSchema = new mongoose.Schema(
  {
    // The unique display name of the user
    username: { type: String, required: true, trim: true, minlength: 2 },
    // Unique email address used for login
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Hashed password string (never store plain text passwords!)
    passwordHash: { type: String, required: true },
  },
  { timestamps: true } // Automatically manages createdAt and updatedAt fields
);

/**
 * Sub-schema to represent a minimal user object (ID + Username)
 * utilized for lists like 'likedBy' to avoid fetching complete user records.
 */
const namedUserSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    username: { type: String, required: true },
  },
  { _id: false } // Prevents generating an automatic _id field for sub-documents
);

/**
 * Sub-schema to represent a comment on a post.
 */
const commentSchema = new mongoose.Schema(
  {
    // ID of the user who commented
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Username of the user who commented
    username: { type: String, required: true },
    // The content text of the comment
    text: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: true } // Tracks comment creation time
);

/**
 * Mongoose Schema representing a Social Post.
 */
const postSchema = new mongoose.Schema(
  {
    // Reference to the author's user ID
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Cache the author's username for fast feed rendering
    username: { type: String, required: true },
    // Text description or update content of the post
    text: { type: String, trim: true, maxlength: 1500 },
    // Base64 or direct URL string pointing to an uploaded image
    image: { type: String, trim: true },
    // List of users who have liked this post
    likedBy: [namedUserSchema],
    // Comments left on this post by users
    comments: [commentSchema],
  },
  { timestamps: true }
);

// Compiling Schemas into Mongoose Models
const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);

/**
 * Helper: Signs a JSON Web Token (JWT) for user authentication session.
 * @param {object} user - The mongoose user instance.
 * @returns {string} Signed JWT.
 */
function signToken(user) {
  return jwt.sign({ id: user._id, username: user.username, email: user.email }, jwtSecret, {
    expiresIn: "7d", // Session expires in 7 days
  });
}

/**
 * Helper: Filter and sanitize user database object for public/client consumption.
 * @param {object} user - The mongoose user instance.
 * @returns {object} Filtered user details (omits password hash).
 */
function publicUser(user) {
  return { id: user._id, username: user.username, email: user.email };
}

/**
 * Middleware: Authenticates incoming requests using JWT.
 * Verifies token, fetches associated user from DB, and mounts user to req.user.
 */
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    // Extracts token from "Bearer <Token>" structure
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ message: "Login required" });

    // Verify token with secret key
    const decoded = jwt.verify(token, jwtSecret);
    // Find matching user in database
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: "User not found" });

    // Mount authenticated user to the request object
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

/**
 * GET /api/health
 * Public health check route to verify that backend service is running correctly.
 */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "taskplanet-social-api" });
});

/**
 * POST /api/auth/signup
 * Public route to register a new user. Hashes the password and signs a JWT.
 */
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Basic validation check
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Check if user already exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email is already registered" });

    // Securely hash user password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create new user in database
    const user = await User.create({ username, email, passwordHash });

    // Respond with access token and sanitized user details
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Signup failed" });
  }
});

/**
 * POST /api/auth/login
 * Public route to authenticate returning users. Verifies credentials and signs a JWT.
 */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Retrieve user by email
    const user = await User.findOne({ email: String(email || "").toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    // Compare raw password with stored password hash
    const matches = await bcrypt.compare(password || "", user.passwordHash);
    if (!matches) return res.status(401).json({ message: "Invalid email or password" });

    // Respond with access token and sanitized user details
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Login failed" });
  }
});

/**
 * GET /api/posts
 * Authenticated route to retrieve paginated posts. Supports filtering and limit queries.
 * Filters: 'all' (default), 'mine' (only user's posts), 'commented' (posts user commented on).
 */
app.get("/api/posts", auth, async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);
  const skip = (page - 1) * limit;
  const filter = String(req.query.filter || "all");
  const query = {};

  // Apply feed view filters based on query params
  if (filter === "mine") {
    query.userId = req.user._id;
  }

  if (filter === "commented") {
    query["comments.userId"] = req.user._id;
  }

  // Execute database operations in parallel: query for posts + count total matched posts
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

/**
 * POST /api/posts
 * Authenticated route to publish a new post containing text, image URL, or both.
 */
app.post("/api/posts", auth, async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    const image = String(req.body.image || "").trim();
    
    // Ensure the post has some content
    if (!text && !image) {
      return res.status(400).json({ message: "Post needs text, an image, or both" });
    }

    // Insert new post into DB
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

/**
 * POST /api/posts/:id/like
 * Authenticated route to toggle like status of a specific post.
 */
app.post("/api/posts/:id/like", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  const userId = String(req.user._id);
  // Check if user already liked the post
  const existingIndex = post.likedBy.findIndex((like) => String(like.userId) === userId);
  
  if (existingIndex >= 0) {
    // Unlike if already liked
    post.likedBy.splice(existingIndex, 1);
  } else {
    // Like if not already liked
    post.likedBy.push({ userId: req.user._id, username: req.user.username });
  }

  await post.save();
  res.json({ post });
});

/**
 * DELETE /api/posts/:id
 * Authenticated route to delete a post. User must be the owner of the post.
 */
app.delete("/api/posts/:id", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  // Verification that requester is the author of the post
  if (String(post.userId) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only delete your own posts" });
  }

  await post.deleteOne();
  res.json({ message: "Post deleted" });
});

/**
 * POST /api/posts/:id/comments
 * Authenticated route to add a comment to a specific post.
 */
app.post("/api/posts/:id/comments", auth, async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ message: "Comment text is required" });

  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  // Append new comment to the comments sub-document array
  post.comments.push({
    userId: req.user._id,
    username: req.user.username,
    text,
  });

  await post.save();
  res.status(201).json({ post });
});

/**
 * Initializes database connection and boots up the API server.
 */
async function start() {
  if (!process.env.MONGODB_URI) {
    console.warn("MONGODB_URI is missing. Add it to backend/.env before starting the API.");
  }

  // Connect to MongoDB Atlas (if URI provided) or fallback to local MongoDB instance
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/taskplanet-social");
  
  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
  });
}

// Start execution
start().catch((error) => {
  console.error("Server failed to start", error);
  process.exit(1);
});
