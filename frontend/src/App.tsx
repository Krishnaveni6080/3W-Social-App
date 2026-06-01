import { FormEvent, useEffect, useMemo, useState } from "react";
import "./App.css";

// API Base URL loaded from environment variables or defaulting to localhost
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// --- TypeScript Type Definitions ---

// User model structure representing the currently logged in session
type User = {
  id: string;
  username: string;
  email: string;
};

// Simplified user structure used in lists like 'likes' or comments author
type NamedUser = {
  userId: string;
  username: string;
};

// Comment structure nested within a Post
type Comment = NamedUser & {
  _id: string;
  text: string;
  createdAt: string;
};

// Main Post structure returned from the database API
type Post = {
  _id: string;
  userId: string;
  username: string;
  text?: string;
  image?: string;
  likedBy: NamedUser[];
  comments: Comment[];
  createdAt: string;
};

// Authentication views: either login or signup
type AuthMode = "login" | "signup";

// Feed filter views: 'all' posts, 'mine' (only user posts), 'commented' (posts user commented on)
type FeedView = "all" | "mine" | "commented";

function App() {
  // --- State Hooks ---
  
  // Controls whether the auth form displays the login screen or registration screen
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  
  // Current logged in user object, loaded from localStorage if already authenticated
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("social_user");
    return saved ? JSON.parse(saved) : null;
  });
  
  // Authentication bearer token retrieved from localStorage if existing
  const [token, setToken] = useState(() => localStorage.getItem("social_token") || "");
  
  // Main list of posts currently displayed in the feed
  const [posts, setPosts] = useState<Post[]>([]);
  
  // Current page counter for infinite scroll/pagination loading
  const [page, setPage] = useState(1);
  
  // Indicates if more posts are available on the backend to load
  const [hasMore, setHasMore] = useState(true);
  
  // Controls loading spinner states for asynchronous requests
  const [loading, setLoading] = useState(false);
  
  // Stores and displays error messages on the UI
  const [error, setError] = useState("");
  
  // Keeps track of the active feed filter view
  const [feedView, setFeedView] = useState<FeedView>("all");
  
  // Controls inputs in the login/signup form
  const [authForm, setAuthForm] = useState({ username: "", email: "", password: "" });
  
  // Controls the text and image inputs in the post composer form
  const [postForm, setPostForm] = useState({ text: "", image: "" });
  
  // Tracks pending comment drafts for each post, mapped by postId
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // --- Memoized Values ---
  
  // Derives 2-character uppercase initials from the current username for avatar preview
  const initials = useMemo(() => {
    if (!user?.username) return "TP";
    return user.username
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user]);

  // --- Side Effects ---
  
  // Reload feed posts whenever the authentication token or feed filter changes
  useEffect(() => {
    if (token) {
      loadPosts(1, true);
    }
  }, [token, feedView]);

  // --- Helper API Wrapper ---
  
  /**
   * General-purpose HTTP request wrapper around fetch.
   * Handles appending VITE_API_URL, content-type headers, JWT token, and error handling.
   * @template T - Expected JSON response shape
   * @param {string} path - API endpoint path (e.g. "/posts")
   * @param {RequestInit} options - Standard fetch options overrides
   * @returns {Promise<T>} Parsed response data
   */
  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || "Something went wrong");
    }
    return data;
  }

  // --- Action Handlers ---

  /**
   * Handles user authentication submission (login or signup).
   * Stores user session details in state and localStorage on success.
   */
  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const path = authMode === "signup" ? "/auth/signup" : "/auth/login";
      const payload =
        authMode === "signup"
          ? authForm
          : { email: authForm.email, password: authForm.password };
      
      const data = await api<{ token: string; user: User }>(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      
      // Save credentials in App State
      setToken(data.token);
      setUser(data.user);
      
      // Persist credentials locally
      localStorage.setItem("social_token", data.token);
      localStorage.setItem("social_user", JSON.stringify(data.user));
      
      // Reset form fields
      setAuthForm({ username: "", email: "", password: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  /**
   * Loads posts from the API server.
   * @param {number} nextPage - Page number to load.
   * @param {boolean} reset - If true, clears the current posts list (used on feed filter change).
   */
  async function loadPosts(nextPage = page, reset = false) {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ posts: Post[]; page: number; totalPages: number }>(
        `/posts?page=${nextPage}&limit=5&filter=${feedView}`
      );
      
      // Append or replace posts list depending on action context
      setPosts((current) => (reset ? data.posts : [...current, ...data.posts]));
      setPage(data.page + 1);
      setHasMore(data.page < data.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load posts");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Submits and creates a new post with the text and/or image content.
   */
  async function createPost(event: FormEvent) {
    event.preventDefault();
    setError("");
    
    // Validation: Require at least one content medium
    if (!postForm.text.trim() && !postForm.image.trim()) {
      setError("Write something or add an image before posting.");
      return;
    }
    
    try {
      const data = await api<{ post: Post }>("/posts", {
        method: "POST",
        body: JSON.stringify({
          text: postForm.text.trim(),
          image: postForm.image.trim(),
        }),
      });
      
      // Insert new post at the top of the feed if viewing a matching filter
      if (feedView === "all" || feedView === "mine") {
        setPosts((current) => [data.post, ...current]);
      }
      
      // Clear composer form fields
      setPostForm({ text: "", image: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post could not be created");
    }
  }

  /**
   * Toggles the like status of a specific post for the logged-in user.
   */
  async function toggleLike(postId: string) {
    try {
      const data = await api<{ post: Post }>(`/posts/${postId}/like`, { method: "POST" });
      // Update local state list with updated post details
      replacePost(data.post);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Like update failed");
    }
  }

  /**
   * Adds a new comment draft to the specified post.
   */
  async function addComment(postId: string) {
    const text = commentDrafts[postId]?.trim();
    if (!text) return;
    try {
      const data = await api<{ post: Post }>(`/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      // Update local state list with the new comments list
      replacePost(data.post);
      // Clear input draft for this post
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comment could not be added");
    }
  }

  /**
   * Prompts user for confirmation and deletes a specific post.
   */
  async function deletePost(postId: string) {
    const confirmed = window.confirm("Delete this post permanently?");
    if (!confirmed) return;

    try {
      await api<{ message: string }>(`/posts/${postId}`, { method: "DELETE" });
      // Remove deleted post from local state list
      setPosts((current) => current.filter((post) => post._id !== postId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post could not be deleted");
    }
  }

  /**
   * Updates feed view filter. Resets pagination to page 1.
   */
  function changeFeedView(nextView: FeedView) {
    setFeedView(nextView);
    setPage(1);
    setHasMore(true);
  }

  /**
   * Replaces a single post inside the posts state list with its updated version.
   */
  function replacePost(updated: Post) {
    setPosts((current) => current.map((post) => (post._id === updated._id ? updated : post)));
  }

  /**
   * Signs the user out, clearing state parameters and local storage tokens.
   */
  function logout() {
    setToken("");
    setUser(null);
    setPosts([]);
    setFeedView("all");
    localStorage.removeItem("social_token");
    localStorage.removeItem("social_user");
  }

  /**
   * Converts a user uploaded image file into a base64 Data URL.
   * Useful to embed local image files directly into the post draft before saving.
   */
  function handleImageFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPostForm((current) => ({ ...current, image: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  }

  // --- Rendering Conditional: Unauthenticated User Screen ---
  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div>
            <p className="eyebrow">TaskPlanet Social</p>
            <h1>Share wins, tasks, and daily updates.</h1>
            <p className="muted">
              Create an account, publish a text or image post, and join the public feed.
            </p>
          </div>

          <form className="auth-card" onSubmit={handleAuth}>
            {/* Toggle tabs between Login and Signup */}
            <div className="segmented">
              <button
                className={authMode === "login" ? "active" : ""}
                type="button"
                onClick={() => setAuthMode("login")}
              >
                Login
              </button>
              <button
                className={authMode === "signup" ? "active" : ""}
                type="button"
                onClick={() => setAuthMode("signup")}
              >
                Signup
              </button>
            </div>

            {/* Display username field only on Signup Mode */}
            {authMode === "signup" && (
              <label>
                Username
                <input
                  value={authForm.username}
                  onChange={(event) => setAuthForm({ ...authForm, username: event.target.value })}
                  placeholder="Aarav Sharma"
                  required
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                placeholder="Minimum 6 characters"
                minLength={6}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary" type="submit">
              {authMode === "signup" ? "Create account" : "Login"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  // --- Rendering Main: Authenticated App View ---
  return (
    <main className="app-shell">
      {/* Sidebar Navigation Panel */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">3W</span>
          <div>
            <strong>Social</strong>
            <small>Public feed</small>
          </div>
        </div>
        <nav>
          <button
            className={feedView === "all" ? "nav-active" : ""}
            onClick={() => changeFeedView("all")}
          >
            Home
          </button>
          <button
            className={feedView === "mine" ? "nav-active" : ""}
            onClick={() => changeFeedView("mine")}
          >
            My Posts
          </button>
          <button
            className={feedView === "commented" ? "nav-active" : ""}
            onClick={() => changeFeedView("commented")}
          >
            Comments
          </button>
        </nav>
        {/* User identity profile chip */}
        <div className="profile-chip">
          <span>{initials}</span>
          <div>
            <strong>{user.username}</strong>
            <small>{user.email}</small>
          </div>
        </div>
        <button className="ghost" onClick={logout}>
          Logout
        </button>
      </aside>

      {/* Main Feed Column */}
      <section className="feed-column">
        <header className="topbar">
          <div>
            <p className="eyebrow">Community</p>
            <h1>
              {feedView === "all" && "Social Feed"}
              {feedView === "mine" && "My Posts"}
              {feedView === "commented" && "Commented Posts"}
            </h1>
          </div>
          <button className="refresh" onClick={() => loadPosts(1, true)} disabled={loading}>
            Refresh
          </button>
        </header>

        {/* Post Composer Form */}
        <form className="composer" onSubmit={createPost}>
          <textarea
            value={postForm.text}
            onChange={(event) => setPostForm({ ...postForm, text: event.target.value })}
            placeholder="Share your task update..."
            rows={4}
          />
          {postForm.image && <img className="image-preview" src={postForm.image} alt="Post preview" />}
          <div className="composer-actions">
            <input
              value={postForm.image}
              onChange={(event) => setPostForm({ ...postForm, image: event.target.value })}
              placeholder="Paste image URL or upload"
            />
            <label className="file-button">
              Upload
              <input type="file" accept="image/*" onChange={(event) => handleImageFile(event.target.files?.[0])} />
            </label>
            <button className="primary" type="submit">
              Post
            </button>
          </div>
        </form>

        {error && <p className="error">{error}</p>}

        {/* Scrollable Feed List */}
        <div className="post-list">
          {posts.map((post) => {
            const liked = post.likedBy.some((like) => like.userId === user.id);
            const canDelete = post.userId === user.id;
            return (
              <article className="post-card" key={post._id}>
                {/* Header with avatar, author name, and date details */}
                <div className="post-head">
                  <span className="avatar">{post.username.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{post.username}</strong>
                    <small>{new Date(post.createdAt).toLocaleString()}</small>
                  </div>
                  {/* Delete option visible only for owner of the post */}
                  {canDelete && (
                    <button className="delete-button" onClick={() => deletePost(post._id)}>
                      Delete
                    </button>
                  )}
                </div>

                {post.text && <p className="post-text">{post.text}</p>}
                {post.image && <img className="post-image" src={post.image} alt={`${post.username} post`} />}

                {/* Engagement stats */}
                <div className="stats">
                  <span>{post.likedBy.length} likes</span>
                  <span>{post.comments.length} comments</span>
                </div>
                {post.likedBy.length > 0 && (
                  <p className="names">Liked by {post.likedBy.map((like) => like.username).join(", ")}</p>
                )}

                {/* Interaction actions: Like, comment draft input, and send button */}
                <div className="post-actions">
                  <button className={liked ? "liked" : ""} onClick={() => toggleLike(post._id)}>
                    {liked ? "Liked" : "Like"}
                  </button>
                  <input
                    value={commentDrafts[post._id] || ""}
                    onChange={(event) =>
                      setCommentDrafts((current) => ({ ...current, [post._id]: event.target.value }))
                    }
                    placeholder="Add a comment"
                  />
                  <button onClick={() => addComment(post._id)}>Send</button>
                </div>

                {/* Last three comments overview */}
                {post.comments.length > 0 && (
                  <div className="comments">
                    {post.comments.slice(-3).map((comment) => (
                      <p key={comment._id}>
                        <strong>{comment.username}</strong> {comment.text}
                      </p>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
          
          {/* Feed empty state illustration info */}
          {!loading && posts.length === 0 && (
            <section className="empty-state">
              <strong>No posts here yet.</strong>
              <span>
                {feedView === "all" && "Create the first post in the community feed."}
                {feedView === "mine" && "Your posts will appear here after you publish them."}
                {feedView === "commented" && "Posts you comment on will appear here."}
              </span>
            </section>
          )}
        </div>

        {/* Next page loader trigger */}
        {hasMore && (
          <button className="load-more" onClick={() => loadPosts()} disabled={loading}>
            {loading ? "Loading..." : "Load more"}
          </button>
        )}
      </section>
    </main>
  );
}

export default App;
