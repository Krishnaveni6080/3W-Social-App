import { FormEvent, useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

type User = {
  id: string;
  username: string;
  email: string;
};

type NamedUser = {
  userId: string;
  username: string;
};

type Comment = NamedUser & {
  _id: string;
  text: string;
  createdAt: string;
};

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

type AuthMode = "login" | "signup";

function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("social_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem("social_token") || "");
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authForm, setAuthForm] = useState({ username: "", email: "", password: "" });
  const [postForm, setPostForm] = useState({ text: "", image: "" });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const initials = useMemo(() => {
    if (!user?.username) return "TP";
    return user.username
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user]);

  useEffect(() => {
    if (token) {
      loadPosts(1, true);
    }
  }, [token]);

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
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("social_token", data.token);
      localStorage.setItem("social_user", JSON.stringify(data.user));
      setAuthForm({ username: "", email: "", password: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  async function loadPosts(nextPage = page, reset = false) {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ posts: Post[]; page: number; totalPages: number }>(
        `/posts?page=${nextPage}&limit=5`
      );
      setPosts((current) => (reset ? data.posts : [...current, ...data.posts]));
      setPage(data.page + 1);
      setHasMore(data.page < data.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load posts");
    } finally {
      setLoading(false);
    }
  }

  async function createPost(event: FormEvent) {
    event.preventDefault();
    setError("");
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
      setPosts((current) => [data.post, ...current]);
      setPostForm({ text: "", image: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post could not be created");
    }
  }

  async function toggleLike(postId: string) {
    try {
      const data = await api<{ post: Post }>(`/posts/${postId}/like`, { method: "POST" });
      replacePost(data.post);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Like update failed");
    }
  }

  async function addComment(postId: string) {
    const text = commentDrafts[postId]?.trim();
    if (!text) return;
    try {
      const data = await api<{ post: Post }>(`/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      replacePost(data.post);
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comment could not be added");
    }
  }

  function replacePost(updated: Post) {
    setPosts((current) => current.map((post) => (post._id === updated._id ? updated : post)));
  }

  function logout() {
    setToken("");
    setUser(null);
    setPosts([]);
    localStorage.removeItem("social_token");
    localStorage.removeItem("social_user");
  }

  function handleImageFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPostForm((current) => ({ ...current, image: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  }

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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">3W</span>
          <div>
            <strong>Social</strong>
            <small>Public feed</small>
          </div>
        </div>
        <nav>
          <button className="nav-active">Home</button>
          <button>Posts</button>
          <button>Comments</button>
        </nav>
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

      <section className="feed-column">
        <header className="topbar">
          <div>
            <p className="eyebrow">Community</p>
            <h1>Social Feed</h1>
          </div>
          <button className="refresh" onClick={() => loadPosts(1, true)} disabled={loading}>
            Refresh
          </button>
        </header>

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

        <div className="post-list">
          {posts.map((post) => {
            const liked = post.likedBy.some((like) => like.userId === user.id);
            return (
              <article className="post-card" key={post._id}>
                <div className="post-head">
                  <span className="avatar">{post.username.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{post.username}</strong>
                    <small>{new Date(post.createdAt).toLocaleString()}</small>
                  </div>
                </div>

                {post.text && <p className="post-text">{post.text}</p>}
                {post.image && <img className="post-image" src={post.image} alt={`${post.username} post`} />}

                <div className="stats">
                  <span>{post.likedBy.length} likes</span>
                  <span>{post.comments.length} comments</span>
                </div>
                {post.likedBy.length > 0 && (
                  <p className="names">Liked by {post.likedBy.map((like) => like.username).join(", ")}</p>
                )}

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
        </div>

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
