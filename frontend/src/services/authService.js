import api from "./api";

/** Mirrors MIN_PASSWORD in backend/portal/helpers/credentials.py, which is
 *  the boundary. Every form that sets a password reads it from here so none
 *  of them can quietly disagree with the server — or with each other.
 *  The reset page prefers the value the API reports for the link it holds. */
export const MIN_PASSWORD = 8;

/** `identifier` is a username or an email address — the server works out
 *  which from the '@', so the sign-in form has one field, not a toggle. */
export async function login(identifier, password) {
  const res = await api.post("/auth/login", { identifier, password });
  return res.data.data; // { access_token, refresh_token, user }
}

/** Asks for a reset link. Resolves the same way whether or not the account
 *  exists — the server will not say, so neither can this. */
export async function requestPasswordReset(identifier) {
  const res = await api.post("/auth/password/forgot", { identifier });
  return res.data.message;
}

/** Whether a reset link is still good, and who it belongs to. Lets the reset
 *  page say so before the visitor types a password into a dead form. */
export async function checkResetLink(token) {
  const res = await api.get("/auth/password/reset", { params: { token } });
  return res.data.data; // { name, username, email, purpose, expires_at, min_password }
}

/** Spends the link and sets the password. Single-use, server-side.
 *
 *  `currentPassword` is the temporary password from the welcome email, and is
 *  required only for an invite link — the server says which via
 *  `requires_current_password` on `checkResetLink`. Sent empty otherwise, and
 *  ignored there. */
export async function resetPassword(token, password, confirmPassword, currentPassword = "") {
  const res = await api.post("/auth/password/reset", {
    token,
    password,
    confirm_password: confirmPassword,
    current_password: currentPassword,
  });
  return res.data.data;
}

export async function fetchCurrentUser() {
  const res = await api.get("/auth/me");
  return res.data.data;
}

export async function logout() {
  try {
    await api.post("/auth/logout");
  } catch {
    // Best-effort: token is discarded client-side regardless.
  }
}

export async function updateProfile(fields) {
  // Only the keys present are touched server-side, so callers can send a
  // partial patch (e.g. just { name }).
  const res = await api.patch("/auth/me", fields);
  return res.data.data; // updated user
}

export async function uploadAvatar(file) {
  const form = new FormData();
  form.append("avatar", file);
  const res = await api.post("/auth/me/avatar", form);
  return res.data.data; // updated user
}

export async function removeAvatar() {
  const res = await api.delete("/auth/me/avatar");
  return res.data.data; // updated user
}

export async function changePassword(currentPassword, newPassword) {
  await api.post("/auth/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
