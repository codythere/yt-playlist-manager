// /lib/google-revoke.ts
async function postForm(url: string, params: Record<string, string>) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

/** Revoke refresh_token（主要） */
export async function revokeRefreshToken(refreshToken: string) {
  // 200/400 都可視為處理過（400 表示 token 已無效）
  await postForm("https://oauth2.googleapis.com/revoke", {
    token: refreshToken,
  });
}

/** 可選：Revoke access_token（通常非必要） */
export async function revokeAccessToken(accessToken: string) {
  try {
    await postForm("https://oauth2.googleapis.com/revoke", {
      token: accessToken,
    });
  } catch {
    // ignore
  }
}
